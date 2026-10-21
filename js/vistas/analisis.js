/* =====================================================================
   Vista Análisis — puerto de la sección #v-analisis de
   diseno/tablero_completo.html, con datos reales de GET /admin/analisis
   en vez de los arreglos TIPOS/TERRITORIOS/ESTADOS fijos del mockup.

   Se conserva la advertencia que el mockup ya traía, porque sigue
   siendo cierta: "Pendiente de definir con REDNA. Los indicadores
   sociales del observatorio no están establecidos todavía. Lo que se
   muestra aquí son indicadores de uso" — construir esta vista con
   datos reales no resuelve esa pendiente, solo la vuelve honesta en
   vez de inventada.

   La dona y la línea del mockup se dibujaban a mano en SVG; acá son
   Chart.js de verdad (mismo criterio que Resumen y Mapa).

   "Participación" (abajo de todo) es nueva — GET /admin/participacion,
   api_v1.md sección 4.3, pendiente desde el contrato original. Pedido
   de Marco pensando en informes a donantes: cuánta gente participa,
   por sexo y estructura. Rol administrador únicamente, y los números
   nunca bajan de grupos de 5 (v_participacion_agregada, migración
   001) — un grupo chico no se muestra individualizado porque
   identificaría a alguien.
   ===================================================================== */
import { obtenerAnalisis, obtenerParticipacion } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarChartJs } from '../core/cargador-librerias.js';
import { esVistaActiva } from '../main.js';

const NOMBRE_FAMILIA = { persona: 'Contra personas', territorio: 'Agua, tierra y medios de vida', gestion: 'Gestiones', logro: 'Logros' };
const COLOR_FAMILIA = { persona: '#A32B1E', territorio: '#B0620A', gestion: '#5B4B8A', logro: '#2D6A4F' };
const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
const COLOR_ESTADO = { recibido: '#A32B1E', en_investigacion: '#B0620A', cerrado: '#2D6A4F', descartado: '#6F7976' };
const NOMBRE_MES = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' };

let graficaSerie = null;
let graficaDona = null;

function esqueleto() {
  return `
    <div class="head"><div><h1>Análisis ${botonAyuda('analisis')}</h1><p>Estadística descriptiva del observatorio · últimos 6 meses</p></div></div>
    <div class="nota-demo"><b>Pendiente de definir con REDNA.</b> Los indicadores sociales del observatorio no están establecidos todavía. Lo que se muestra aquí son indicadores de uso, que la plataforma genera por sí sola.</div>
    <div class="grid2">
      <div class="caja">
        <h2>Evolución mensual</h2><p class="sub">Total de reportes recibidos por mes.</p>
        <div class="chart-caja"><canvas id="a-serie"></canvas></div>
      </div>
      <div class="caja">
        <h2>Distribución por familia</h2><p class="sub">Del total del período.</p>
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
          <div style="width:190px;height:190px;flex:none"><canvas id="a-dona"></canvas></div>
          <div style="flex:1;min-width:150px" id="a-dona-leyenda"></div>
        </div>
      </div>
    </div>
    <div class="grid2">
      <div class="caja"><h2>Tipos de hecho</h2><p class="sub">Ordenados por frecuencia.</p><div id="a-tipos"></div></div>
      <div>
        <div class="caja"><h2>Distribución por territorio</h2><p class="sub">Reportes del período y dispositivos activos por cantón.</p><div id="a-territorios"></div></div>
        <div class="caja"><h2>Estado de los casos</h2><p class="sub">Situación actual del total acumulado.</p><div id="a-estados"></div></div>
      </div>
    </div>
    <div id="a-participacion-cont"></div>`;
}

function esqueletoParticipacion() {
  return `
    <div class="caja">
      <h2>Participación ${botonAyuda('participacion')}</h2>
      <p class="sub">Cuánta gente participa, agregado por departamento — nunca por debajo de grupos de 5 personas, para no identificar a nadie.</p>
      <div class="kpis" id="a-p-kpis" style="margin-bottom:16px"></div>
      <div id="a-p-grupos"></div>
    </div>`;
}

function pintarParticipacion(d) {
  document.getElementById('a-p-kpis').innerHTML = `
    <div class="kpi"><b>${d.dispositivos_activos}</b><span>Dispositivos activos</span></div>
    <div class="kpi"><b>${d.con_al_menos_un_reporte}</b><span>Con al menos un reporte</span></div>`;

  const cont = document.getElementById('a-p-grupos');
  if (!d.grupos.length) {
    cont.innerHTML = '<p class="sub2">Ningún grupo llega todavía a las 5 personas necesarias para mostrarse sin identificar a nadie.</p>';
    return;
  }
  const porDepartamento = {};
  for (const g of d.grupos) {
    (porDepartamento[g.departamento || 'Sin departamento'] ||= []).push(g);
  }
  cont.innerHTML = Object.entries(porDepartamento).map(([depto, grupos]) => `
    <div style="margin-bottom:10px">
      <div class="volanta" style="margin-bottom:6px">${depto}</div>
      ${grupos.map((g) => `<div class="lista-item"><div class="li-t"><b>${g.sexo}${g.estructura ? ' · ' + g.estructura : ''}</b></div><span class="li-a" style="color:var(--on-surface-var);font-weight:700">${g.personas}</span></div>`).join('')}
    </div>`).join('');
}

function pintarBarras(contId, items, { etiqueta, valor, color, extra }) {
  const cont = document.getElementById(contId);
  if (!items.length) {
    cont.innerHTML = '<p class="sub2">Sin datos todavía.</p>';
    return;
  }
  const max = Math.max(...items.map((it) => it[valor]));
  cont.innerHTML = items.map((it) => `
    <div class="barra">
      <div class="bl"><span style="display:flex;align-items:center;gap:8px">${color ? `<i class="pt" style="background:${color(it)}"></i>` : ''}${it[etiqueta]}</span><b>${it[valor]}</b></div>
      <div class="bt"><i style="width:0;background:${color ? color(it) : 'var(--primary)'}" data-ancho="${max ? (it[valor] / max) * 100 : 0}"></i></div>
      ${extra ? `<div style="font-size:11.5px;color:var(--on-surface-var);margin-top:4px">${extra(it)}</div>` : ''}
    </div>`).join('');
  requestAnimationFrame(() => {
    cont.querySelectorAll('.bt i').forEach((el) => { el.style.width = el.dataset.ancho + '%'; });
  });
}

function pintarDona(distribucion) {
  const total = distribucion.reduce((acc, f) => acc + f.total, 0);
  const conDatos = distribucion.filter((f) => f.total > 0);

  if (graficaDona) graficaDona.destroy();
  const ctx = document.getElementById('a-dona').getContext('2d');
  graficaDona = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: conDatos.map((f) => NOMBRE_FAMILIA[f.familia] || f.familia),
      datasets: [{
        data: conDatos.map((f) => f.total),
        backgroundColor: conDatos.map((f) => COLOR_FAMILIA[f.familia] || '#6F7976'),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      }
    }
  });

  document.getElementById('a-dona-leyenda').innerHTML = distribucion.map((f) => `
    <div class="barra"><div class="bl"><span style="display:flex;align-items:center;gap:8px"><i class="pt" style="background:${COLOR_FAMILIA[f.familia] || '#6F7976'}"></i>${NOMBRE_FAMILIA[f.familia] || f.familia}</span><b>${f.total}</b></div>
      <div class="bt"><i style="width:0;background:${COLOR_FAMILIA[f.familia] || '#6F7976'}" data-ancho="${total ? (f.total / total) * 100 : 0}"></i></div></div>`).join('');
  requestAnimationFrame(() => {
    document.querySelectorAll('#a-dona-leyenda .bt i').forEach((el) => { el.style.width = el.dataset.ancho + '%'; });
  });
}

function pintarSerie(serieTotal) {
  const etiquetas = serieTotal.meses.map((m) => NOMBRE_MES[m.slice(5, 7)] || m);
  if (graficaSerie) graficaSerie.destroy();
  const ctx = document.getElementById('a-serie').getContext('2d');
  graficaSerie = new Chart(ctx, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [{
        label: 'Reportes',
        data: serieTotal.datos,
        borderColor: '#0E5148',
        backgroundColor: '#0E514826',
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  raiz.insertAdjacentHTML('beforeend', '<p class="cargando" id="a-cargando">Cargando…</p>');

  const [r] = await Promise.all([obtenerAnalisis(), cargarChartJs()]);
  if (!esVistaActiva('analisis')) return; // se navegó a otra vista mientras tanto
  document.getElementById('a-cargando')?.remove();

  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar Análisis: ${r.error} (${r.code}).</p>`);
    return;
  }

  pintarSerie(r.data.serie_total);
  pintarDona(r.data.distribucion_familia);
  pintarBarras('a-tipos', r.data.tipos, { etiqueta: 'tipo', valor: 'total', color: (t) => COLOR_FAMILIA[t.familia] || '#6F7976' });
  pintarBarras('a-territorios', r.data.territorios, {
    etiqueta: 'canton', valor: 'reportes',
    extra: (t) => `${t.personas_activas} dispositivo${t.personas_activas === 1 ? '' : 's'} activo${t.personas_activas === 1 ? '' : 's'}`
  });
  pintarBarras('a-estados', r.data.estados.map((e) => ({ ...e, etiqueta: ETIQ_ESTADO[e.estado] || e.estado })), {
    etiqueta: 'etiqueta', valor: 'total', color: (e) => COLOR_ESTADO[e.estado] || '#6F7976'
  });

  const contParticipacion = document.getElementById('a-participacion-cont');
  if (sesion.usuarioActual()?.rol !== 'administrador') {
    contParticipacion.innerHTML = '';
    return;
  }
  contParticipacion.innerHTML = esqueletoParticipacion();
  const rp = await obtenerParticipacion();
  if (!esVistaActiva('analisis')) return; // se navegó a otra vista mientras tanto
  if (rp.ok) pintarParticipacion(rp.data);
  else contParticipacion.innerHTML = `<p class="error-carga">No se pudo cargar Participación: ${rp.error}</p>`;
}
