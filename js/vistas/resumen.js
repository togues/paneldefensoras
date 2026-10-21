/* =====================================================================
   Vista Resumen — puerto de la sección #v-resumen de
   diseno/tablero_completo.html a datos reales (GET /admin/estadisticas)
   en vez del arreglo de JavaScript fijo del mockup.

   La gráfica de líneas del mockup la dibujaba a mano en SVG
   (función lineas()); acá se cambió por Chart.js, con el visto bueno
   de Marco de usar CDN y librerías en el panel. El resto —KPIs, tabla
   de casos recientes, alertas, barras de tipos de hecho— es markup
   equivalente al del mockup, generado desde la respuesta del API.
   ===================================================================== */
import { obtenerEstadisticas } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarChartJs } from '../core/cargador-librerias.js';
import { esVistaActiva } from '../main.js';

const NOMBRE_FAMILIA = { persona: 'Agresiones a personas', territorio: 'Agua, tierra y medios de vida', gestion: 'Gestiones', logro: 'Logros' };
const COLOR_FAMILIA = { persona: '#A32B1E', territorio: '#B0620A', gestion: '#5B4B8A', logro: '#2D6A4F' };
const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
const CLASE_ESTADO = { recibido: 'p-n', en_investigacion: 'p-i', cerrado: 'p-c', descartado: 'p-i' };
const NOMBRE_MES = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' };

let graficaSerie = null;

function formatoFechaCorta(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Resumen del observatorio ${botonAyuda('resumen')}</h1><p>Últimos 6 meses</p></div>
    </div>
    <div class="kpis" id="r-kpis"></div>
    <div class="grid">
      <div>
        <div class="caja">
          <h2>Reportes por mes</h2>
          <p class="sub">Separados por familia de hecho.</p>
          <div class="chart-caja"><canvas id="r-serie"></canvas></div>
          <div class="leyenda" id="r-leyenda"></div>
        </div>
        <div class="caja">
          <h2>Casos recientes</h2>
          <p class="sub">Los últimos seis reportes recibidos.</p>
          <table><thead><tr><th>Folio</th><th>Comunidad</th><th>Tipo de hecho</th><th>Familia</th><th>Recibido</th><th>Estado</th></tr></thead>
          <tbody id="r-tabla"></tbody></table>
        </div>
      </div>
      <div>
        <div class="caja">
          <h2>Alertas activas</h2><p class="sub">Disparadas por los umbrales configurados.</p>
          <div id="r-alertas"></div>
        </div>
        <div class="caja">
          <h2>Tipos de hecho más frecuentes</h2><p class="sub">Acumulado de 6 meses.</p>
          <div id="r-tipos"></div>
        </div>
      </div>
    </div>`;
}

function pintarKpis(kpis) {
  const items = [
    { valor: kpis.sin_revisar, texto: 'Sin revisar', clase: 'rojo' },
    { valor: kpis.en_investigacion, texto: 'En investigación', clase: 'ambar' },
    { valor: kpis.total_periodo, texto: 'Reportes en 6 meses', clase: '' },
    { valor: kpis.total_mes, texto: 'Reportes este mes', clase: '' },
    { valor: kpis.marcados_anomalos, texto: 'Marcados anómalos', clase: 'violeta' },
    { valor: kpis.dispositivos_activos, texto: 'Dispositivos activos', clase: '' }
  ];
  document.getElementById('r-kpis').innerHTML = items
    .map((it) => `<div class="kpi${it.clase ? ' ' + it.clase : ''}"><b>${it.valor}</b><span>${it.texto}</span></div>`)
    .join('');
}

function pintarSerie(serieMensual) {
  const etiquetas = serieMensual.meses.map((m) => NOMBRE_MES[m.slice(5, 7)] || m);
  const datasets = serieMensual.series
    .filter((s) => s.datos.some((v) => v > 0))
    .map((s) => ({
      label: NOMBRE_FAMILIA[s.familia] || s.familia,
      data: s.datos,
      borderColor: COLOR_FAMILIA[s.familia] || '#6F7976',
      backgroundColor: (COLOR_FAMILIA[s.familia] || '#6F7976') + '26',
      tension: 0.35,
      fill: true,
      pointRadius: 4,
      pointBackgroundColor: '#fff',
      pointBorderWidth: 2
    }));

  if (graficaSerie) graficaSerie.destroy();
  const ctx = document.getElementById('r-serie').getContext('2d');
  graficaSerie = new Chart(ctx, {
    type: 'line',
    data: { labels: etiquetas, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  document.getElementById('r-leyenda').innerHTML = datasets
    .map((d) => `<span><i class="pt" style="background:${d.borderColor}"></i> ${d.label}</span>`)
    .join('');
}

function pintarTabla(casos) {
  if (!casos.length) {
    document.getElementById('r-tabla').innerHTML = '<tr><td colspan="6" class="vacio">Sin reportes todavía.</td></tr>';
    return;
  }
  document.getElementById('r-tabla').innerHTML = casos.map((c) => `
    <tr>
      <td class="folio">${c.folio || '—'}</td>
      <td>${c.comunidad || '—'}<div class="sub2">${c.canton || ''}</div></td>
      <td>${c.tipo}</td>
      <td><span class="fam"><i style="background:${COLOR_FAMILIA[c.familia] || '#6F7976'}"></i>${NOMBRE_FAMILIA[c.familia] || c.familia}</span></td>
      <td class="sub2">${formatoFechaCorta(c.fecha_registro)}</td>
      <td><span class="pill ${CLASE_ESTADO[c.estado] || 'p-i'}">${ETIQ_ESTADO[c.estado] || c.estado}</span></td>
    </tr>`).join('');
}

function pintarAlertas(alertas) {
  const cont = document.getElementById('r-alertas');
  if (!alertas.length) {
    cont.innerHTML = '<p class="sub2">No hay alertas activas en este momento.</p>';
    return;
  }
  cont.innerHTML = alertas.map((a) => `
    <div class="alerta">
      <b>${a.regla}${a.canton ? ' — ' + a.canton : ''}</b>
      <p>${a.conteo_actual} reportes sobre un umbral de ${a.umbral}. Disparada ${formatoFechaCorta(a.fecha_disparo)}
      ${a.notificados > 0 ? ` · notificada a ${a.notificados} actor${a.notificados === 1 ? '' : 'es'} clave` : ' · sin notificar todavía'}.</p>
    </div>`).join('');
}

function pintarTipos(tipos) {
  const cont = document.getElementById('r-tipos');
  if (!tipos.length) {
    cont.innerHTML = '<p class="sub2">Todavía no hay suficientes reportes para este cálculo.</p>';
    return;
  }
  const max = Math.max(...tipos.map((t) => t.total));
  cont.innerHTML = tipos.map((t) => `
    <div class="barra">
      <div class="bl"><span>${t.tipo}</span><b>${t.total}</b></div>
      <div class="bt"><i style="width:0;background:${COLOR_FAMILIA[t.familia] || '#6F7976'}" data-ancho="${(t.total / max) * 100}"></i></div>
    </div>`).join('');
  requestAnimationFrame(() => {
    cont.querySelectorAll('.bt i').forEach((el) => { el.style.width = el.dataset.ancho + '%'; });
  });
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  raiz.innerHTML += '<p class="cargando" id="r-cargando">Cargando datos reales del observatorio…</p>';

  // En paralelo, no uno después del otro: ninguno depende del otro.
  const [r] = await Promise.all([obtenerEstadisticas(), cargarChartJs()]);
  if (!esVistaActiva('resumen')) return; // se navegó a otra vista mientras tanto
  const cargando = document.getElementById('r-cargando');
  if (cargando) cargando.remove();

  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar el resumen: ${r.error} (${r.code}).</p>`);
    return;
  }

  pintarKpis(r.data.kpis);
  pintarSerie(r.data.serie_mensual);
  pintarTabla(r.data.casos_recientes);
  pintarAlertas(r.data.alertas_activas);
  pintarTipos(r.data.tipos_frecuentes);
}
