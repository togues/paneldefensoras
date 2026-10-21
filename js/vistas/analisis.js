/* =====================================================================
   Vista Análisis — tablero con filtros en cascada, al estilo Power BI /
   Metabase (pedido de Marco, 2026-10-20). Un filtro arriba, o un clic
   en cualquier gráfico, refresca TODO el tablero de una vez con una
   sola llamada a GET /admin/analisis. La barra de filtros vive aparte,
   en analisis-filtros.js.

   Sin saltos al filtrar (la queja de REDNA con conexiones lentas):
   - el tablero no se vacía mientras carga: se atenúa y sigue en su
     lugar, con una barra de progreso fina arriba;
   - las gráficas Chart.js se actualizan en su lugar (graficaEnLugar),
     y cada caja conserva su alto;
   - si llega tarde la respuesta de un filtro anterior, se descarta
     (contador de pedidos) — nunca pisa la del filtro actual.

   Participación queda al final, aparte y SIN responder a los filtros:
   cruzar sexo/organización con filtros de casos achicaría los grupos
   por debajo del umbral de 5 (regla 2 de CLAUDE.md).
   ===================================================================== */
import { obtenerAnalisis, obtenerParticipacion } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarChartJs } from '../core/cargador-librerias.js';
import { esVistaActiva, irAVista } from '../main.js';
import { prefiltrarCasos } from './casos.js';
import * as filtros from './analisis-filtros.js';
import {
  NOMBRE_FAMILIA, COLOR_FAMILIA, ETIQ_ESTADO, COLOR_ESTADO,
  esc, diaLegible, pintarBarras, graficaEnLugar,
} from '../core/graficas.js';

let opciones = null; // listas para los filtros: una vez por sesión
let graficaSerie = null;
let graficaDona = null;
let pedidoActual = 0;

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Análisis ${botonAyuda('analisis')}</h1><p id="a-sub">&nbsp;</p></div>
    </div>
    ${filtros.esqueleto()}
    <div id="a-tablero" class="tablero">
      <div class="kpis" id="a-kpis">${'<div class="kpi kpi-cargando"></div>'.repeat(8)}</div>
      <div class="grid">
        <div class="caja">
          <h2>Evolución</h2><p class="sub" id="a-serie-sub">Reportes recibidos, por familia.</p>
          <div class="chart-caja"><canvas id="a-serie" role="img" aria-label="Reportes recibidos en el tiempo, por familia"></canvas></div>
          <div class="leyenda" id="a-serie-leyenda"></div>
        </div>
        <div class="caja">
          <h2>Por familia</h2><p class="sub">Toque una familia para filtrar.</p>
          <div class="dona-fila">
            <div class="dona-caja"><canvas id="a-dona" role="img" aria-label="Distribución por familia"></canvas></div>
            <div class="dona-leyenda" id="a-dona-leyenda"></div>
          </div>
        </div>
      </div>
      <div class="grid2">
        <div class="caja"><h2>Tipos de hecho</h2><p class="sub">Toque uno para filtrar.</p><div class="barras" id="a-tipos"></div></div>
        <div class="caja"><h2>Estado de los casos</h2><p class="sub">Toque uno para filtrar.</p><div class="barras" id="a-estados"></div></div>
      </div>
      <div class="grid2">
        <div class="caja"><h2>Por departamento</h2><p class="sub">Dónde ocurrió el hecho. Toque uno para filtrar.</p><div class="barras" id="a-departamentos"></div></div>
        <div class="caja"><h2>Comunidades con más reportes</h2><p class="sub">Las 15 primeras. Toque una para filtrar.</p><div class="barras" id="a-comunidades"></div></div>
      </div>
      <div class="grid2">
        <div class="caja">
          <h2>Hechos que se repiten</h2>
          <p class="sub">Mismo tipo de hecho, en la misma comunidad, más de una vez en el período. Toque uno para ver solo esos.</p>
          <div id="a-reincidencias"></div>
        </div>
        <div class="caja">
          <h2>Empresas, lugares e instituciones más mencionados</h2>
          <p class="sub">Lo que la persona nombró al reportar. Nunca nombres de personas.</p>
          <div class="barras" id="a-entidades"></div>
        </div>
      </div>
    </div>
    <div id="a-participacion-cont"></div>`;
}

// ---- Indicadores ----

function variacion(actual, anterior, dias) {
  if (!anterior) return `<span class="delta neutro">${actual ? 'sin datos en los ' + dias + ' días anteriores' : '&nbsp;'}</span>`;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return '<span class="delta neutro">igual que el período anterior</span>';
  return `<span class="delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. período anterior (${anterior})</span>`;
}

function dias(v) {
  if (v === null || v === undefined) return '—';
  return v < 1 ? '< 1' : String(Math.round(v));
}

function pintarKpis(k, periodo) {
  const items = [
    { valor: k.total, texto: 'Reportes en el período', extra: variacion(k.total, k.total_anterior, periodo.dias) },
    { valor: k.sin_revisar, texto: 'Sin revisar', clase: k.sin_revisar ? 'rojo' : '' },
    { valor: k.en_investigacion, texto: 'En investigación', clase: k.en_investigacion ? 'ambar' : '' },
    { valor: k.cerrados, texto: 'Cerrados' },
    { valor: k.alta_prioridad, texto: 'Prioridad alta' },
    { valor: k.comunidades_afectadas, texto: 'Comunidades con reportes' },
    { valor: dias(k.dias_primera_respuesta), texto: 'Días hasta la primera respuesta', extra: '<span class="delta neutro">mediana</span>' },
    { valor: dias(k.dias_cierre), texto: 'Días hasta cerrar o descartar', extra: '<span class="delta neutro">mediana</span>' },
  ];
  document.getElementById('a-kpis').innerHTML = items
    .map((it) => `<div class="kpi${it.clase ? ' ' + it.clase : ''}"><b>${it.valor}</b><span>${esc(it.texto)}</span>${it.extra || ''}</div>`)
    .join('');
}

// ---- Gráficas ----

function etiquetaTramo(tramo, granularidad) {
  if (granularidad === 'mes') return diaLegible(tramo, { month: 'short', year: 'numeric' });
  if (granularidad === 'semana') return 'Sem. ' + diaLegible(tramo, { day: 'numeric', month: 'short' });
  return diaLegible(tramo, { day: 'numeric', month: 'short' });
}

function pintarSerie(serie, periodo) {
  const nombreTramo = { dia: 'por día', semana: 'por semana', mes: 'por mes' }[periodo.granularidad];
  document.getElementById('a-serie-sub').textContent = `Reportes recibidos ${nombreTramo}, por familia.`;
  const datasets = serie.series.map((s) => ({
    label: NOMBRE_FAMILIA[s.familia] || s.familia,
    data: s.datos,
    backgroundColor: COLOR_FAMILIA[s.familia] || '#6F7976',
    borderRadius: 3,
    maxBarThickness: 28,
    stack: 'familias',
  }));
  graficaSerie = graficaEnLugar(graficaSerie, document.getElementById('a-serie'), {
    type: 'bar',
    data: { labels: serie.tramos.map((t) => etiquetaTramo(t, periodo.granularidad)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E7EEEB' } },
      },
    },
  });
  const conDatos = serie.series.filter((s) => s.datos.some((v) => v > 0));
  document.getElementById('a-serie-leyenda').innerHTML = conDatos
    .map((s) => `<span><i class="pt" style="background:${COLOR_FAMILIA[s.familia] || '#6F7976'}"></i> ${NOMBRE_FAMILIA[s.familia] || esc(s.familia)}</span>`)
    .join('');
}

function pintarDona(familias) {
  const total = familias.reduce((s, f) => s + f.total, 0);
  graficaDona = graficaEnLugar(graficaDona, document.getElementById('a-dona'), {
    type: 'doughnut',
    data: {
      labels: familias.map((f) => NOMBRE_FAMILIA[f.familia] || f.familia),
      datasets: [{
        label: 'Familias',
        data: familias.map((f) => f.total),
        backgroundColor: familias.map((f) => COLOR_FAMILIA[f.familia] || '#6F7976'),
        borderColor: '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: { legend: { display: false } },
      onClick: (_e, elementos) => {
        if (elementos.length) filtros.alternar('familia', familias[elementos[0].index].familia);
      },
    },
  });
  pintarBarras(document.getElementById('a-dona-leyenda'), familias.map((f) => ({
    clave: f.familia,
    etiqueta: NOMBRE_FAMILIA[f.familia] || f.familia,
    valor: f.total,
    extra: total ? Math.round((f.total / total) * 100) + '%' : '',
    color: COLOR_FAMILIA[f.familia],
    activa: filtros.estaActivo('familia', f.familia),
  })), { alElegir: (c) => filtros.alternar('familia', c) });
}

function pintarDesgloses(d) {
  pintarBarras(document.getElementById('a-tipos'), d.tipos.map((t) => ({
    clave: t.tipo_vulneracion_id, etiqueta: t.tipo, valor: t.total, color: COLOR_FAMILIA[t.familia],
    activa: filtros.estaActivo('tipo_vulneracion_id', t.tipo_vulneracion_id),
  })), { alElegir: (c) => filtros.alternar('tipo_vulneracion_id', c), limite: 8 });

  pintarBarras(document.getElementById('a-estados'), d.estados.map((e) => ({
    clave: e.estado, etiqueta: ETIQ_ESTADO[e.estado] || e.estado, valor: e.total, color: COLOR_ESTADO[e.estado],
    activa: filtros.estaActivo('estado', e.estado),
  })), { alElegir: (c) => filtros.alternar('estado', c) });

  pintarBarras(document.getElementById('a-departamentos'), d.departamentos.map((x) => ({
    clave: x.departamento_id, etiqueta: x.departamento, valor: x.total,
    activa: filtros.estaActivo('departamento_id', x.departamento_id),
  })), { alElegir: (c) => filtros.alternar('departamento_id', c) });

  pintarBarras(document.getElementById('a-comunidades'), d.comunidades.map((x) => ({
    clave: x.comunidad_id, etiqueta: x.comunidad, valor: x.total, extra: x.departamento,
    activa: filtros.estaActivo('comunidad_id', x.comunidad_id),
  })), { alElegir: (c) => filtros.alternar('comunidad_id', c) });

  pintarBarras(document.getElementById('a-entidades'), d.entidades.map((x) => ({
    clave: x.entidad, etiqueta: x.entidad, valor: x.total, color: COLOR_FAMILIA.territorio,
  })), { vacio: 'Ningún reporte del período nombra una empresa, lugar o institución.' });

  const cont = document.getElementById('a-reincidencias');
  if (!d.reincidencias.length) {
    cont.innerHTML = '<p class="sub2 tablero-vacio">Ningún tipo de hecho se repite en una misma comunidad en este período.</p>';
    return;
  }
  cont.innerHTML = `<table class="tabla-accion"><thead><tr><th>Comunidad</th><th>Tipo de hecho</th><th>Veces</th><th>Entre</th></tr></thead><tbody>
    ${d.reincidencias.map((x, i) => `<tr data-i="${i}" tabindex="0" aria-label="Filtrar ${esc(x.tipo)} en ${esc(x.comunidad)}">
      <td>${esc(x.comunidad)}</td>
      <td><span class="fam"><i style="background:${COLOR_FAMILIA[x.familia] || '#6F7976'}"></i>${esc(x.tipo)}</span></td>
      <td><b>${x.total}</b></td>
      <td class="sub2">${diaLegible(x.primera.slice(0, 10), { day: 'numeric', month: 'short' })} – ${diaLegible(x.ultima.slice(0, 10), { day: 'numeric', month: 'short' })}</td>
    </tr>`).join('')}</tbody></table>`;
  const elegir = (fila) => {
    const x = d.reincidencias[Number(fila.dataset.i)];
    filtros.fijar({ comunidad_id: x.comunidad_id, tipo_vulneracion_id: x.tipo_vulneracion_id });
  };
  cont.onclick = (e) => { const f = e.target.closest('tr[data-i]'); if (f) elegir(f); };
  cont.onkeydown = (e) => {
    const f = e.target.closest('tr[data-i]');
    if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); elegir(f); }
  };
}

// ---- Carga ----

function marcarActualizando() {
  document.getElementById('a-tablero')?.classList.add('actualizando');
  document.getElementById('a-tablero')?.setAttribute('aria-busy', 'true');
  document.getElementById('a-filtros')?.classList.add('cargando');
}

async function cargar(parametros) {
  // Un filtro cambiado justo antes de irse a otra vista igual dispara
  // su pedido demorado: acá ya no hay tablero que actualizar.
  if (!esVistaActiva('analisis')) return null;
  const miPedido = ++pedidoActual;
  marcarActualizando();
  const tablero = document.getElementById('a-tablero');
  const barra = document.getElementById('a-filtros');

  const r = await obtenerAnalisis(parametros);
  // Llegó tarde: ya hay un filtro más nuevo pidiéndose, o se cambió de vista.
  if (miPedido !== pedidoActual || !esVistaActiva('analisis')) return null;
  tablero.classList.remove('actualizando');
  tablero.removeAttribute('aria-busy');
  barra.classList.remove('cargando');

  if (!r.ok) {
    document.getElementById('a-sub').innerHTML = `<span class="error-carga">No se pudo cargar el tablero: ${esc(r.error)} (${esc(r.code)}).</span>`;
    return null;
  }
  const d = r.data;

  const p = d.periodo;
  document.getElementById('a-sub').textContent =
    `Del ${diaLegible(p.desde)} al ${diaLegible(p.hasta)} · ${p.dias} días · comparado con los ${p.dias} días anteriores`;
  pintarKpis(d.kpis, p);
  pintarSerie(d.serie, p);
  pintarDona(d.familias);
  pintarDesgloses(d);
  return d;
}

async function cargarParticipacion() {
  const cont = document.getElementById('a-participacion-cont');
  if (sesion.usuarioActual()?.rol !== 'administrador') return;
  cont.innerHTML = `
    <div class="caja caja-aparte">
      <h2>Participación ${botonAyuda('participacion')}</h2>
      <p class="sub">Cuánta gente participa, agregado por departamento — nunca grupos de menos de 5 personas, para no identificar a nadie. <b>No responde a los filtros de arriba</b>, a propósito.</p>
      <div class="kpis" id="a-p-kpis" style="margin-bottom:16px"></div>
      <div id="a-p-grupos"></div>
    </div>`;
  const rp = await obtenerParticipacion();
  if (!esVistaActiva('analisis')) return;
  if (!rp.ok) {
    cont.innerHTML = `<p class="error-carga">No se pudo cargar Participación: ${esc(rp.error)}</p>`;
    return;
  }
  const d = rp.data;
  document.getElementById('a-p-kpis').innerHTML = `
    <div class="kpi"><b>${d.dispositivos_activos}</b><span>Dispositivos activos</span></div>
    <div class="kpi"><b>${d.con_al_menos_un_reporte}</b><span>Con al menos un reporte</span></div>`;
  const grupos = document.getElementById('a-p-grupos');
  if (!d.grupos.length) {
    grupos.innerHTML = '<p class="sub2">Ningún grupo llega todavía a las 5 personas necesarias para mostrarse sin identificar a nadie.</p>';
    return;
  }
  const porDepartamento = {};
  for (const g of d.grupos) (porDepartamento[g.departamento || 'Sin departamento'] ||= []).push(g);
  grupos.innerHTML = Object.entries(porDepartamento).map(([depto, lista]) => `
    <div style="margin-bottom:10px">
      <div class="volanta" style="margin-bottom:6px">${esc(depto)}</div>
      ${lista.map((g) => `<div class="lista-item"><div class="li-t"><b>${esc(g.sexo || 'Sin dato de sexo')}${g.estructura ? ' · ' + esc(g.estructura) : ''}</b></div><span class="li-a" style="color:var(--on-surface-var);font-weight:700">${g.personas}</span></div>`).join('')}
    </div>`).join('');
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  graficaSerie = null;
  graficaDona = null;

  // Primera carga: hacen falta las opciones de los filtros antes de
  // poder pintar la barra — salen en la misma llamada que los datos.
  await cargarChartJs();
  if (!esVistaActiva('analisis')) return;
  if (!opciones) {
    const r = await obtenerAnalisis({ solo_opciones: 1 });
    if (!esVistaActiva('analisis')) return;
    if (r.ok) opciones = r.data.opciones;
    else opciones = { departamentos: [], comunidades: [], tipos: [] };
  }

  const iniciales = filtros.montarBarra({
    opciones,
    alCambiar: (p) => cargar(p),
    alEmpezar: marcarActualizando,
    alVerCasos: (p) => {
      prefiltrarCasos({ ...p, etiquetaTipo: filtros.nombreTipo(p.tipo_vulneracion_id) });
      irAVista('casos');
    },
  });
  await Promise.all([cargar(iniciales), cargarParticipacion()]);
}
