/* =====================================================================
   Lo que comparten Resumen y Análisis para pintar datos: nombres y
   colores de familia/estado, formato de fechas en hora de El Salvador,
   barras horizontales en HTML y gráficas Chart.js que se ACTUALIZAN en
   su lugar.

   Actualizar en vez de destruir y volver a crear es lo que evita el
   "salto" de pantalla al cambiar un filtro: el lienzo conserva su alto,
   y Chart.js anima de los valores viejos a los nuevos. Las barras de
   desglose son <button> en HTML (no Chart.js): livianas, accesibles con
   teclado y con lector de pantalla, y cada una puede ser un filtro.
   ===================================================================== */

export const NOMBRE_FAMILIA = { persona: 'Contra personas', territorio: 'Agua, tierra y medios de vida', gestion: 'Gestiones', logro: 'Logros' };
export const COLOR_FAMILIA = { persona: '#A32B1E', territorio: '#B0620A', gestion: '#5B4B8A', logro: '#2D6A4F' };
export const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
export const COLOR_ESTADO = { recibido: '#A32B1E', en_investigacion: '#B0620A', cerrado: '#2D6A4F', descartado: '#6F7976' };
export const CLASE_ESTADO = { recibido: 'p-n', en_investigacion: 'p-i', cerrado: 'p-c', descartado: 'p-i' };

const TZ = 'America/El_Salvador';

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Fecha AAAA-MM-DD (día, sin hora) → "20 oct 2026". */
export function diaLegible(ymd, opciones = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('es-SV', { ...opciones, timeZone: 'UTC' });
}

/** Marca de tiempo del servidor → fecha y hora en El Salvador. */
export function fechaHora(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

/** Hoy en El Salvador, AAAA-MM-DD. */
export function hoySV() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function sumarDias(ymd, dias) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Crea la gráfica la primera vez y, las siguientes, solo cambia sus
 * datos. Si el lienzo ya no es el mismo (la vista se volvió a montar),
 * descarta la instancia vieja.
 */
export function graficaEnLugar(anterior, canvas, config) {
  if (anterior && anterior.canvas === canvas) {
    anterior.data.labels = config.data.labels;
    // Mismos datasets por etiqueta: así Chart.js anima de un valor al
    // otro en vez de redibujar desde cero.
    const previos = new Map(anterior.data.datasets.map((d) => [d.label, d]));
    anterior.data.datasets = config.data.datasets.map((d) => {
      const viejo = previos.get(d.label);
      if (!viejo) return d;
      Object.assign(viejo, d);
      return viejo;
    });
    anterior.update();
    return anterior;
  }
  anterior?.destroy();
  return new Chart(canvas.getContext('2d'), config);
}

/**
 * Barras horizontales en HTML. `filas`: [{ clave, etiqueta, valor, color,
 * extra, activa }]. Con `alElegir`, cada barra es un botón que llama
 * alElegir(clave) — el filtro cruzado del tablero.
 */
export function pintarBarras(contenedor, filas, { alElegir, vacio = 'Sin datos para este filtro.', limite = 0 } = {}) {
  if (!filas.length) {
    contenedor.innerHTML = `<p class="sub2 tablero-vacio">${esc(vacio)}</p>`;
    return;
  }
  const max = Math.max(...filas.map((f) => f.valor), 1);
  const etiquetaTag = alElegir ? 'button' : 'div';
  // Con `limite`, el resto queda detrás de "Ver todos" — una lista de
  // 20 barras estira toda la fila del tablero. Una barra activa (filtro
  // elegido) nunca queda escondida.
  const plegar = limite && filas.length > limite && !filas.slice(limite).some((f) => f.activa);
  const mostradas = contenedor.dataset.expandida === '1' || !plegar ? filas : filas.slice(0, limite);
  contenedor.innerHTML = mostradas.map((f) => `
    <${etiquetaTag} class="barra${alElegir ? ' barra-filtro' : ''}${f.activa ? ' activa' : ''}"
      ${alElegir ? `type="button" data-clave="${esc(f.clave)}" aria-pressed="${f.activa ? 'true' : 'false'}" title="${f.activa ? 'Quitar este filtro' : 'Filtrar por ' + esc(f.etiqueta)}"` : ''}>
      <span class="bl"><span>${esc(f.etiqueta)}${f.extra ? ` <small class="sub2">${esc(f.extra)}</small>` : ''}</span><b>${f.valor}</b></span>
      <span class="bt"><i style="width:${(f.valor / max) * 100}%;background:${f.color || 'var(--primary)'}"></i></span>
    </${etiquetaTag}>`).join('') +
    (plegar ? `<button type="button" class="enlace-boton barras-mas" data-plegar>${mostradas.length < filas.length ? `Ver todos (${filas.length})` : 'Ver menos'}</button>` : '');
  contenedor.querySelector('[data-plegar]')?.addEventListener('click', () => {
    contenedor.dataset.expandida = contenedor.dataset.expandida === '1' ? '0' : '1';
    pintarBarras(contenedor, filas, { alElegir, vacio, limite });
  });
  if (alElegir) {
    contenedor.onclick = (e) => {
      const b = e.target.closest('[data-clave]');
      if (b) alElegir(b.dataset.clave);
    };
  }
}
