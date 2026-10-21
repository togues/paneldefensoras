/* =====================================================================
   Salud de datos → "Anomalías para revisar": once revisiones en tres
   grupos (datos inconsistentes, uso sospechoso, casos sin atender), con
   GET /admin/calidad-datos. Pedido de Marco, 21 de octubre de 2026.

   Cada tarjeta dice cuántos casos encontró; al tocarla aparece la lista
   y cada caso se abre en su ficha (abrirFichaCaso, de casos.js). Nada
   cambia datos: el sistema señala y una persona decide.
   ===================================================================== */
import { obtenerCalidadDatos } from '../data/api-client.js';
import { abrirFichaCaso } from './casos.js';
import { ETIQ_ESTADO, CLASE_ESTADO, esc, fechaHora } from '../core/graficas.js';
import { esVistaActiva } from '../main.js';

const GRUPOS = [
  { id: 'datos', titulo: 'Datos inconsistentes' },
  { id: 'uso', titulo: 'Uso sospechoso' },
  { id: 'atencion', titulo: 'Casos sin atender' },
];

// u = umbrales que manda el servidor: los textos nunca dicen un número
// distinto del que de verdad se usa.
const TEXTOS = {
  sin_departamento: () => ['Sin departamento', 'Llegaron sin decir en qué departamento ocurrió el hecho (folio "SD").'],
  fecha_imposible: () => ['Fecha imposible', 'La fecha del hecho es posterior al día en que llegó el reporte.'],
  posible_duplicado: (u) => ['Posibles duplicados', `Mismo tipo y departamento, fechas a menos de ${u.duplicado_dias} días y relato parecido.`],
  relato_corto: (u) => ['Relato vacío o muy corto', `Menos de ${u.relato_min} caracteres. El relato es opcional: puede estar bien, pero conviene mirarlo.`],
  punto_fuera: () => ['Punto fuera de El Salvador', 'El punto marcado en el mapa cae fuera del país: casi siempre es un error de toque o de GPS.'],
  muchos_reportes: (u) => ['Muchos reportes de un mismo teléfono', `Más de ${u.rafaga_reportes} en ${u.rafaga_horas} horas. Se muestran los casos, nunca quién los envió.`],
  recuperaciones_altas: (u) => ['Cuentas recuperadas muchas veces', `Teléfonos que recuperaron su cuenta ${u.recuperaciones} veces o más: el código de recuperación puede estar circulando. Solo se muestra el número.`],
  filtro_contenido: () => ['Marcados por el filtro de contenido', 'Textos con contenido político-partidario o de estructuras criminales, todavía sin revisar.'],
  recibido_viejo: (u) => [`En Recibido hace más de ${u.recibido_dias} días`, 'Casos que nadie ha empezado a revisar.'],
  investigacion_sin_notas: (u) => [`En investigación sin notas en ${u.investigacion_dias} días`, 'Casos abiertos sin ninguna anotación reciente.'],
  sin_organizacion: () => ['Sin organización de seguimiento', 'Casos abiertos que todavía no tienen a quién le toca el seguimiento.'],
};

let datos = null;
let abierta = null;

function tarjeta(t) {
  const [titulo, texto] = TEXTOS[t.clave](datos.umbrales);
  const conCasos = t.casos !== null;
  const etiqueta = t.total === 0 ? 'Nada que revisar' : (conCasos ? (abierta === t.clave ? 'Ocultar casos' : 'Ver casos') : 'Solo el número, sin casos');
  return `
    <button type="button" class="cal-tarjeta ${t.total ? 'cal-hay' : 'cal-ok'}${abierta === t.clave ? ' cal-abierta' : ''}"
      data-cal="${t.clave}" ${t.total && conCasos ? '' : 'disabled'} aria-expanded="${abierta === t.clave}">
      <b>${t.total}</b>
      <span class="cal-titulo">${titulo}</span>
      <span class="cal-texto">${texto}</span>
      <span class="cal-accion">${etiqueta}</span>
    </button>`;
}

function lista(t) {
  const [titulo] = TEXTOS[t.clave](datos.umbrales);
  const filas = t.casos.map((c) => `
    <tr data-id="${c.id}" tabindex="0">
      <td><b>${esc(c.folio || '—')}</b></td>
      <td>${esc(c.tipo)}</td>
      <td><span class="pill ${CLASE_ESTADO[c.estado] || 'p-i'}">${ETIQ_ESTADO[c.estado] || esc(c.estado)}</span></td>
      <td>${fechaHora(c.fecha_registro)}</td>
      <td class="sub2">${esc(c.detalle || '')}</td>
    </tr>`).join('');
  return `
    <div class="cal-lista">
      <h3>${titulo}: ${t.total} caso${t.total === 1 ? '' : 's'}${t.total > t.casos.length ? ` (se muestran los ${t.casos.length} más recientes)` : ''}</h3>
      <div class="cal-tabla"><table class="tabla-accion">
        <thead><tr><th>Folio</th><th>Tipo</th><th>Estado</th><th>Llegó</th><th>Detalle</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
    </div>`;
}

function pintar() {
  const cont = document.getElementById('s-calidad');
  if (!cont) return;
  cont.innerHTML = GRUPOS.map((g) => {
    const delGrupo = datos.tarjetas.filter((t) => t.grupo === g.id);
    if (!delGrupo.length) return '';
    const abiertaAqui = delGrupo.find((t) => t.clave === abierta);
    return `
      <div class="cal-grupo">
        <h3 class="cal-grupo-titulo">${g.titulo}</h3>
        <div class="cal-tarjetas">${delGrupo.map(tarjeta).join('')}</div>
        ${abiertaAqui ? lista(abiertaAqui) : ''}
      </div>`;
  }).join('');

  cont.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
    abierta = abierta === b.dataset.cal ? null : b.dataset.cal;
    pintar();
  }));
  const abrir = (fila) => abrirFichaCaso(fila.dataset.id, { alCambiar: cargarCalidad });
  cont.querySelectorAll('tr[data-id]').forEach((fila) => {
    fila.addEventListener('click', () => abrir(fila));
    fila.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(fila); });
  });
}

export async function cargarCalidad() {
  const r = await obtenerCalidadDatos();
  if (!esVistaActiva('salud')) return;
  const cont = document.getElementById('s-calidad');
  if (!cont) return;
  if (!r.ok) {
    cont.innerHTML = `<p class="error-carga">No se pudieron cargar las revisiones: ${esc(r.error)}</p>`;
    return;
  }
  datos = r.data;
  pintar();
}

export function esqueletoCalidad() {
  abierta = null;
  return `
    <div class="caja">
      <h2>Anomalías para revisar</h2>
      <p class="sub">El sistema revisa los datos y señala lo que conviene mirar. Ninguna revisión cambia nada: la decisión es de una persona y queda en la bitácora del caso.</p>
      <div id="s-calidad"><p class="cargando">Revisando los datos…</p></div>
    </div>`;
}
