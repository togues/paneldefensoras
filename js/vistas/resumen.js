/* =====================================================================
   Vista Resumen — OPERATIVA desde el 2026-10-20 (decisión de Marco):
   responde "¿qué necesita atención hoy?", sin filtros. Lo analítico
   (series largas, distribuciones, territorio, tipos de hecho) vive en
   Análisis, con filtros en cascada — antes las dos vistas repetían la
   misma serie mensual y los mismos tipos frecuentes.

   Todo lleva a la acción: cada indicador que tiene equivalente exacto
   en Casos abre Casos ya filtrado; cada fila de la bandeja abre la
   ficha del caso ahí mismo. Datos: GET /admin/estadisticas.
   ===================================================================== */
import { obtenerEstadisticas } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarChartJs } from '../core/cargador-librerias.js';
import { esVistaActiva, irAVista } from '../main.js';
import { abrirFichaCaso, prefiltrarCasos } from './casos.js';
import { NOMBRE_FAMILIA, COLOR_FAMILIA, ETIQ_ESTADO, CLASE_ESTADO, esc, fechaHora, hoySV, sumarDias, diaLegible, graficaEnLugar } from '../core/graficas.js';

let graficaPulso = null;

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Resumen ${botonAyuda('resumen')}</h1><p id="r-sub">Lo que necesita atención hoy</p></div>
      <div class="acciones">
        <button type="button" class="btn ghost chico" id="r-actualizar">Actualizar</button>
        <button type="button" class="btn chico" id="r-ir-analisis">Ver tablero de análisis</button>
      </div>
    </div>
    <div class="kpis" id="r-kpis">${'<div class="kpi kpi-cargando"></div>'.repeat(6)}</div>
    <div class="grid">
      <div>
        <div class="caja">
          <h2>Bandeja: pendientes por urgencia</h2>
          <p class="sub">Sin cerrar ni descartar. Primero la prioridad alta, después lo que más lleva esperando. Toque una fila para trabajar el caso.</p>
          <table class="tabla-accion"><thead><tr><th>Folio</th><th>Comunidad</th><th>Tipo de hecho</th><th>Espera</th><th>Estado</th></tr></thead>
          <tbody id="r-pendientes"><tr><td colspan="5" class="cargando">Cargando…</td></tr></tbody></table>
        </div>
        <div class="caja">
          <h2>Lo último que llegó</h2>
          <p class="sub">Los seis reportes más recientes, en cualquier estado.</p>
          <table class="tabla-accion"><thead><tr><th>Folio</th><th>Comunidad</th><th>Familia</th><th>Recibido</th><th>Estado</th></tr></thead>
          <tbody id="r-tabla"><tr><td colspan="5" class="cargando">Cargando…</td></tr></tbody></table>
        </div>
      </div>
      <div>
        <div class="caja">
          <h2>Alertas activas</h2><p class="sub">Disparadas por los umbrales configurados.</p>
          <div id="r-alertas"></div>
        </div>
        <div class="caja">
          <h2>Pulso de los últimos 30 días</h2><p class="sub" id="r-pulso-sub">Reportes recibidos por día.</p>
          <div class="chart-caja chart-chica"><canvas id="r-pulso" aria-label="Reportes recibidos por día en los últimos 30 días" role="img"></canvas></div>
        </div>
      </div>
    </div>`;
}

function variacion(actual, anterior) {
  if (!anterior) return actual ? '<span class="delta neutro">sin datos la semana anterior</span>' : '';
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return '<span class="delta neutro">igual que la semana anterior</span>';
  return `<span class="delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. semana anterior</span>`;
}

function pintarKpis(k) {
  const hoy = hoySV();
  // `ir`: solo los que tienen un equivalente EXACTO en Casos — un
  // indicador que lleva a una tabla con otro número confunde más de
  // lo que ayuda.
  const items = [
    { valor: k.sin_revisar, texto: 'Sin revisar', clase: 'rojo', ir: { estado: 'recibido' } },
    { valor: k.sin_revisar_mas_7_dias, texto: 'Sin revisar hace más de 7 días', clase: k.sin_revisar_mas_7_dias ? 'ambar' : '', ir: { estado: 'recibido', hasta: sumarDias(hoy, -8) } },
    { valor: k.alta_prioridad_pendiente, texto: 'Prioridad alta pendientes', clase: k.alta_prioridad_pendiente ? 'rojo' : '' },
    { valor: k.en_investigacion, texto: 'En investigación', clase: '', ir: { estado: 'en_investigacion' } },
    { valor: k.alertas_abiertas, texto: 'Alertas abiertas', clase: k.alertas_abiertas ? 'violeta' : '', ancla: 'r-alertas' },
    { valor: k.recibidos_7_dias, texto: 'Recibidos en 7 días', clase: '', extra: variacion(k.recibidos_7_dias, k.recibidos_7_dias_anteriores), ir: { desde: sumarDias(hoy, -6) } },
  ];
  const cont = document.getElementById('r-kpis');
  cont.innerHTML = items.map((it, i) => {
    const interactivo = it.ir || it.ancla;
    const tag = interactivo ? 'button' : 'div';
    return `<${tag} ${interactivo ? `type="button" data-kpi="${i}"` : ''} class="kpi${it.clase ? ' ' + it.clase : ''}${interactivo ? ' kpi-accion' : ''}">
      <b>${it.valor}</b><span>${esc(it.texto)}</span>${it.extra || ''}
    </${tag}>`;
  }).join('');
  cont.onclick = (e) => {
    const b = e.target.closest('[data-kpi]');
    if (!b) return;
    const it = items[Number(b.dataset.kpi)];
    if (it.ancla) document.getElementById(it.ancla)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else { prefiltrarCasos(it.ir); irAVista('casos'); }
  };
}

function filaCaso(c, columnas) {
  return `<tr data-id="${c.id}" tabindex="0" aria-label="Abrir el caso ${esc(c.folio)}">${columnas(c)}</tr>`;
}

function enlazarFilas(tbody) {
  const abrir = (fila) => abrirFichaCaso(fila.dataset.id, { alCambiar: recargar });
  tbody.onclick = (e) => { const f = e.target.closest('tr[data-id]'); if (f) abrir(f); };
  tbody.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const f = e.target.closest('tr[data-id]');
    if (f) { e.preventDefault(); abrir(f); }
  };
}

function pintarPendientes(casos) {
  const tbody = document.getElementById('r-pendientes');
  if (!casos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Nada pendiente. Todos los casos están cerrados o descartados.</td></tr>';
    return;
  }
  tbody.innerHTML = casos.map((c) => filaCaso(c, (x) => `
    <td class="folio">${esc(x.folio || '—')}${x.prioridad === 'alta' ? ' <span class="pill p-n">Alta</span>' : ''}</td>
    <td>${esc(x.comunidad || '—')}</td>
    <td>${esc(x.tipo)}</td>
    <td class="${x.dias_esperando > 7 ? 'espera-larga' : 'sub2'}">${x.dias_esperando === 0 ? 'hoy' : `${x.dias_esperando} día${x.dias_esperando === 1 ? '' : 's'}`}</td>
    <td><span class="pill ${CLASE_ESTADO[x.estado] || 'p-i'}">${ETIQ_ESTADO[x.estado] || esc(x.estado)}</span></td>`)).join('');
  enlazarFilas(tbody);
}

function pintarRecientes(casos) {
  const tbody = document.getElementById('r-tabla');
  if (!casos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Sin reportes todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = casos.map((c) => filaCaso(c, (x) => `
    <td class="folio">${esc(x.folio || '—')}</td>
    <td>${esc(x.comunidad || '—')}</td>
    <td><span class="fam"><i style="background:${COLOR_FAMILIA[x.familia] || '#6F7976'}"></i>${NOMBRE_FAMILIA[x.familia] || esc(x.familia)}</span></td>
    <td class="sub2">${fechaHora(x.fecha_registro)}</td>
    <td><span class="pill ${CLASE_ESTADO[x.estado] || 'p-i'}">${ETIQ_ESTADO[x.estado] || esc(x.estado)}</span></td>`)).join('');
  enlazarFilas(tbody);
}

function pintarAlertas(alertas) {
  const cont = document.getElementById('r-alertas');
  if (!alertas.length) {
    cont.innerHTML = '<p class="sub2">No hay alertas activas en este momento.</p>';
    return;
  }
  cont.innerHTML = alertas.map((a) => `
    <div class="alerta">
      <b>${esc(a.regla)}${a.canton ? ' — ' + esc(a.canton) : ''}</b>
      <p>${a.conteo_actual} reportes sobre un umbral de ${a.umbral}. Disparada ${fechaHora(a.fecha_disparo)}
      ${a.notificados > 0 ? ` · notificada a ${a.notificados} actor${a.notificados === 1 ? '' : 'es'} clave` : ' · sin notificar todavía'}.</p>
    </div>`).join('');
}

function pintarPulso(actividad) {
  const total = actividad.reduce((s, a) => s + a.total, 0);
  document.getElementById('r-pulso-sub').textContent = `${total} reporte${total === 1 ? '' : 's'} en 30 días.`;
  graficaPulso = graficaEnLugar(graficaPulso, document.getElementById('r-pulso'), {
    type: 'bar',
    data: {
      labels: actividad.map((a) => diaLegible(a.dia, { day: 'numeric', month: 'short' })),
      datasets: [{ label: 'Reportes', data: actividad.map((a) => a.total), backgroundColor: '#0E5148', borderRadius: 3, maxBarThickness: 14 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 4 }, grid: { color: '#E7EEEB' } },
      },
    },
  });
}

async function recargar() {
  const boton = document.getElementById('r-actualizar');
  if (boton) boton.disabled = true;
  const [r] = await Promise.all([obtenerEstadisticas(), cargarChartJs()]);
  if (!esVistaActiva('resumen')) return;
  if (boton) boton.disabled = false;
  if (!r.ok) {
    document.getElementById('r-kpis').innerHTML = `<p class="error-carga">No se pudo cargar el resumen: ${esc(r.error)} (${esc(r.code)}).</p>`;
    return;
  }
  pintarKpis(r.data.kpis);
  pintarPendientes(r.data.pendientes);
  pintarRecientes(r.data.recientes);
  pintarAlertas(r.data.alertas_activas);
  pintarPulso(r.data.actividad);
  document.getElementById('r-sub').textContent = 'Lo que necesita atención hoy · actualizado a las ' +
    new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' });
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  graficaPulso = null;
  document.getElementById('r-actualizar').addEventListener('click', recargar);
  document.getElementById('r-ir-analisis').addEventListener('click', () => irAVista('analisis'));
  await recargar();
}
