/* =====================================================================
   Vista Mapa: los casos en el territorio, con filtros, línea de tiempo,
   tres fondos, regla para medir y coordenadas del cursor. Rediseño
   pedido por Marco el 22 de octubre de 2026: con 500 casos, 500 puntos
   sin fecha ni tipo no dicen nada.

   Lo que devuelve GET /admin/mapa depende del rol (regla 5, decisión 06,
   docs/decision-06-coordenadas-exactas-mapa-admin.md): el administrador
   recibe el punto exacto cuando la persona lo marcó (`es_exacto`) y el
   centro de la comunidad como respaldo; cualquier otro rol, siempre el
   centro de la comunidad. Esta vista no decide permisos: solo dibuja lo
   que el servidor ya filtró, y dice en cada punto cuál de los dos es.

   Todo el filtrado ocurre aquí, sobre los puntos ya cargados: filtros de
   arriba (tipo, departamento, estado) y rango de fechas de la línea de
   tiempo. Los filtros reencuadran el mapa; la línea de tiempo no, para
   que al darle play los puntos aparezcan sin que el mapa salte.
   ===================================================================== */
import { obtenerMapa } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarLeafletConClusters } from '../core/cargador-librerias.js';
import { ETIQ_ESTADO, CLASE_ESTADO, esc } from '../core/graficas.js';
import { abrirFichaCaso } from './casos.js';
import { esVistaActiva } from '../main.js';

const TZ = 'America/El_Salvador';
const DIA = 86400000;

// Mismos tonos que el muro público, un punto más oscuros para que se lean
// sobre el fondo claro y sobre el satélite.
const FAMILIAS = [
  { id: 'persona', nombre: 'Contra personas', color: '#D2531C' },
  { id: 'territorio', nombre: 'Agua, tierra y medios de vida', color: '#2B76B9' },
  { id: 'gestion', nombre: 'Gestión', color: '#B98410' },
  { id: 'logro', nombre: 'Logro', color: '#2F8350' },
];
const COLOR_FAMILIA = Object.fromEntries(FAMILIAS.map((f) => [f.id, f.color]));
const NOMBRE_FAMILIA = Object.fromEntries(FAMILIAS.map((f) => [f.id, f.nombre]));
const COLOR_ESTADO = { recibido: '#A32B1E', en_investigacion: '#B0620A', cerrado: '#2D6A4F', descartado: '#6F7976' };
const PRECISION = { mes: 'mes aproximado', anio: 'año aproximado', semana: 'semana aproximada' };

// Esri sin clave: el gris claro deja resaltar los puntos; el satélite
// sirve para ver la mina, la represa o la obra. Los dos llevan los nombres
// en una capa aparte, entre el fondo y los puntos (panel 'nombres').
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const FONDOS = {
  Claro: () => L.layerGroup([
    L.tileLayer(ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap' }),
    L.tileLayer(ESRI + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'nombres' }),
  ]),
  Calles: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }),
  'Satélite': () => L.layerGroup([
    L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }),
    L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'nombres' }),
  ]),
};

const ICONO_REGLA = '<svg viewBox="0 0 24 24" class="i"><path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2"/></svg>';
const ICONO_PLAY = '<svg viewBox="0 0 24 24" class="i"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const ICONO_PAUSA = '<svg viewBox="0 0 24 24" class="i"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>';

let mapa = null;
let capaClusters = null;
let puntos = [];
let puedeVerExacto = false;
let filtros = null;
let colorPor = 'familia';
let modoFecha = 'llegada';
let bins = [];
let ultimoDia = 0; // la última fecha con casos: el rango no dice una fecha posterior
let rango = [0, 0];
let reproduciendo = null;
let medicion = null;

function filtrosVacios() {
  return { familias: new Set(), tipo: '', departamento: '', estado: '' };
}

/* ---------- Fechas y cubetas de la línea de tiempo ---------- */

function fechaDe(p) {
  const iso = modoFecha === 'llegada' ? p.fecha_registro : p.fecha_incidente;
  return iso ? new Date(iso).getTime() : null;
}

function fmtFecha(t, conDia = true) {
  return new Date(t).toLocaleDateString('es-SV', conDia
    ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }
    : { month: 'short', year: 'numeric', timeZone: TZ });
}

function inicioDeDia(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Día si el periodo cabe en unos tres meses, semana hasta dos años, mes
// después: así la barra nunca tiene ni 5 ni 900 columnas.
function armarCubetas() {
  const tiempos = puntos.map(fechaDe).filter((t) => t !== null);
  if (!tiempos.length) {
    bins = [];
    return;
  }
  const min = inicioDeDia(Math.min(...tiempos));
  const max = inicioDeDia(Math.max(...tiempos)) + DIA;
  ultimoDia = max - DIA;
  const dias = (max - min) / DIA;
  const unidad = dias <= 92 ? 'dia' : dias <= 730 ? 'semana' : 'mes';
  bins = [];
  let t = min;
  if (unidad === 'semana') t -= ((new Date(min).getDay() + 6) % 7) * DIA; // desde el lunes
  if (unidad === 'mes') t = new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1).getTime();
  while (t < max) {
    let fin;
    if (unidad === 'dia') fin = t + DIA;
    else if (unidad === 'semana') fin = t + 7 * DIA;
    else { const d = new Date(t); fin = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); }
    bins.push({ inicio: t, fin, unidad });
    t = fin;
  }
  rango = [0, bins.length - 1];
}

/* ---------- Filtrado ---------- */

function pasaFiltros(p) {
  if (filtros.familias.size && !filtros.familias.has(p.familia)) return false;
  if (filtros.tipo && String(p.tipo_vulneracion_id) !== filtros.tipo) return false;
  if (filtros.departamento && String(p.departamento_id) !== filtros.departamento) return false;
  if (filtros.estado && p.estado !== filtros.estado) return false;
  return true;
}

function enRango(p) {
  const t = fechaDe(p);
  if (t === null || !bins.length) return false;
  return t >= bins[rango[0]].inicio && t < bins[rango[1]].fin;
}

/* ---------- Esqueleto ---------- */

function opciones(lista, todos) {
  return `<option value="">${todos}</option>` + lista.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
}

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Mapa de incidencias ${botonAyuda('mapa')}</h1><p id="m-resumen"></p></div>
    </div>
    <div class="caja m-caja">
      <div class="barra-filtros m-filtros">
        <div class="campo-grupo m-familias-grupo">
          <span class="m-etiqueta">Tipo de hecho</span>
          <div class="m-familias" id="m-familias">${FAMILIAS.map((f) => `
            <button type="button" class="m-fam" data-fam="${f.id}" aria-pressed="false" style="--fam:${f.color}">
              <i></i>${f.nombre}<b data-cuenta="${f.id}">0</b></button>`).join('')}
          </div>
        </div>
        <div class="campo-grupo m-sel"><label for="m-tipo">Hecho</label><select id="m-tipo" class="campo-filtro"></select></div>
        <div class="campo-grupo m-sel"><label for="m-depto">Departamento</label><select id="m-depto" class="campo-filtro"></select></div>
        <div class="campo-grupo m-sel"><label for="m-estado">Estado</label><select id="m-estado" class="campo-filtro">
          ${opciones(Object.entries(ETIQ_ESTADO), 'Todos')}</select></div>
        <div class="m-filtros-pie">
          <span id="m-cuenta" class="m-cuenta" aria-live="polite"></span>
          <button type="button" class="btn ghost chico" id="m-limpiar" hidden>Quitar filtros</button>
        </div>
      </div>

      <div class="m-marco">
        <div id="r-mapa"></div>
        <div class="m-color" role="group" aria-label="Color de los puntos">
          <span>Color por</span>
          <button type="button" data-color="familia" class="act">Tipo</button>
          <button type="button" data-color="estado">Estado</button>
        </div>
        <div class="m-leyenda" id="m-leyenda"></div>
      </div>

      <div class="m-tiempo" id="m-tiempo">
        <div class="m-tiempo-cab">
          <button type="button" class="m-play" id="m-play" aria-label="Reproducir">${ICONO_PLAY}</button>
          <div class="m-tiempo-texto"><b id="m-rango"></b><span id="m-rango-sub"></span></div>
          <div class="m-modo" role="group" aria-label="Qué fecha usar">
            <button type="button" data-modo="llegada" class="act">Fecha de llegada</button>
            <button type="button" data-modo="hecho">Fecha del hecho</button>
          </div>
          <button type="button" class="btn ghost chico" id="m-todo" hidden>Todo el periodo</button>
        </div>
        <div class="m-barras" id="m-barras" aria-hidden="true"></div>
        <div class="m-deslizador">
          <input type="range" id="m-desde" min="0" max="0" value="0" aria-label="Desde">
          <input type="range" id="m-hasta" min="0" max="0" value="0" aria-label="Hasta">
        </div>
        <div class="m-ejes"><span id="m-eje-ini"></span><span id="m-eje-fin"></span></div>
      </div>
    </div>`;
}

function llenarSelects() {
  const tipos = new Map();
  const deptos = new Map();
  for (const p of puntos) {
    if (p.tipo_vulneracion_id !== null && (!filtros.familias.size || filtros.familias.has(p.familia))) {
      tipos.set(String(p.tipo_vulneracion_id), p.tipo_hecho);
    }
    if (p.departamento_id !== null) deptos.set(String(p.departamento_id), p.departamento);
  }
  const ordenar = (m) => [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  if (filtros.tipo && !tipos.has(filtros.tipo)) filtros.tipo = '';
  const selTipo = document.getElementById('m-tipo');
  selTipo.innerHTML = opciones(ordenar(tipos), 'Todos');
  selTipo.value = filtros.tipo;
  const selDepto = document.getElementById('m-depto');
  if (selDepto.options.length <= 1) selDepto.innerHTML = opciones(ordenar(deptos), 'Todos');
  selDepto.value = filtros.departamento;
}

/* ---------- Puntos y popup ---------- */

function colorDe(p) {
  return colorPor === 'familia' ? (COLOR_FAMILIA[p.familia] || '#6F7976') : (COLOR_ESTADO[p.estado] || '#6F7976');
}

function popup(p) {
  const ocurrio = p.fecha_incidente
    ? fmtFecha(new Date(p.fecha_incidente).getTime()) + (PRECISION[p.precision_fecha] ? ` <span class="m-pop-nota">(${PRECISION[p.precision_fecha]})</span>` : '')
    : '<span class="m-pop-nota">Sin fecha precisa</span>';
  const lugar = [p.comunidad, p.departamento].filter(Boolean).map(esc).join(' · ') || '—';
  const coord = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  return `
    <div class="m-pop" style="--fam:${COLOR_FAMILIA[p.familia] || '#6F7976'}">
      <div class="m-pop-cab"><span>${esc(NOMBRE_FAMILIA[p.familia] || p.familia)}</span>
        <span class="pill ${CLASE_ESTADO[p.estado] || 'p-i'}">${ETIQ_ESTADO[p.estado] || esc(p.estado)}</span></div>
      <div class="m-pop-cuerpo">
        <div class="m-pop-folio">${esc(p.folio || 'Sin folio')}${p.prioridad === 'alta' ? '<span class="m-pop-alta">Prioridad alta</span>' : ''}</div>
        <div class="m-pop-tipo">${esc(p.tipo_hecho || '')}</div>
        <dl>
          <dt>Lugar</dt><dd>${lugar}</dd>
          <dt>Ocurrió</dt><dd>${ocurrio}</dd>
          <dt>Llegó</dt><dd>${fmtFecha(new Date(p.fecha_registro).getTime())}</dd>
        </dl>
        <div class="m-pop-coord">
          <div><span class="m-pop-nota">${p.es_exacto ? 'Punto exacto del reporte' : 'Centro de la comunidad (sin punto marcado)'}</span>
            <code>${coord}</code></div>
          <button type="button" class="btn ghost chico" data-copiar="${coord}">Copiar</button>
        </div>
        <button type="button" class="btn chico m-pop-abrir" data-abrir="${p.id}">Abrir el caso</button>
      </div>
    </div>`;
}

function dibujarPuntos(reencuadrar) {
  const visibles = puntos.filter((p) => pasaFiltros(p) && enRango(p));
  const marcadores = visibles.map((p) => {
    const m = L.circleMarker([p.lat, p.lon], {
      radius: p.es_exacto ? 8 : 6.5,
      color: p.es_exacto ? '#fff' : colorDe(p),
      weight: p.es_exacto ? 2.5 : 2,
      fillColor: colorDe(p),
      fillOpacity: p.es_exacto ? 0.95 : 0.35,
      className: 'm-punto',
    });
    m.bindPopup(() => popup(p), { className: 'm-popup', maxWidth: 300, minWidth: 270, autoPanPadding: [24, 24] });
    m.bindTooltip(`${esc(p.folio || '')} · ${esc(p.tipo_hecho || '')}`, { direction: 'top', offset: [0, -6], className: 'm-tip' });
    return m;
  });
  capaClusters.clearLayers();
  capaClusters.addLayers(marcadores);

  if (reencuadrar && marcadores.length) {
    mapa.fitBounds(L.featureGroup(marcadores).getBounds().pad(0.2), { maxZoom: 12 });
  }
  actualizarCuenta(visibles.length);
}

function actualizarCuenta(n) {
  const conFecha = puntos.filter((p) => fechaDe(p) !== null).length;
  const total = puntos.length;
  document.getElementById('m-cuenta').textContent = `${n} de ${total} caso${total === 1 ? '' : 's'} en el mapa`;
  const hay = filtros.familias.size || filtros.tipo || filtros.departamento || filtros.estado;
  document.getElementById('m-limpiar').hidden = !hay;
  const sinFecha = total - conFecha;
  document.getElementById('m-rango-sub').textContent = modoFecha === 'hecho' && sinFecha
    ? ` · ${sinFecha} sin fecha precisa del hecho no se muestran`
    : '';
  for (const f of FAMILIAS) {
    const c = puntos.filter((p) => p.familia === f.id && enRango(p)
      && (!filtros.tipo || String(p.tipo_vulneracion_id) === filtros.tipo)
      && (!filtros.departamento || String(p.departamento_id) === filtros.departamento)
      && (!filtros.estado || p.estado === filtros.estado)).length;
    document.querySelector(`[data-cuenta="${f.id}"]`).textContent = c;
  }
}

function pintarLeyenda() {
  const items = colorPor === 'familia'
    ? FAMILIAS.map((f) => [f.color, f.nombre])
    : Object.entries(ETIQ_ESTADO).map(([k, t]) => [COLOR_ESTADO[k], t]);
  const forma = puedeVerExacto
    ? `<span class="m-ley-sep"></span>
       <span><i class="m-ley-pt" style="background:#171D1B;box-shadow:0 0 0 2px #fff,0 0 0 3px #171D1B"></i>Punto exacto</span>
       <span><i class="m-ley-pt" style="background:rgba(23,29,27,.3);border:2px solid #171D1B"></i>Centro de la comunidad</span>`
    : '<span class="m-ley-sep"></span><span class="m-ley-nota">Cada punto es el centro de su comunidad, nunca la coordenada exacta</span>';
  document.getElementById('m-leyenda').innerHTML =
    items.map(([c, t]) => `<span><i class="m-ley-pt" style="background:${c}"></i>${t}</span>`).join('') + forma;
}

/* ---------- Línea de tiempo ---------- */

function pintarBarras() {
  const cont = document.getElementById('m-barras');
  const desde = document.getElementById('m-desde');
  const hasta = document.getElementById('m-hasta');
  document.getElementById('m-tiempo').hidden = !bins.length;
  if (!bins.length) return;

  const porBin = bins.map(() => Object.fromEntries(FAMILIAS.map((f) => [f.id, 0])));
  for (const p of puntos) {
    if (!pasaFiltros(p)) continue;
    const t = fechaDe(p);
    if (t === null) continue;
    const i = bins.findIndex((b) => t >= b.inicio && t < b.fin);
    if (i >= 0 && porBin[i][p.familia] !== undefined) porBin[i][p.familia]++;
  }
  const max = Math.max(1, ...porBin.map((b) => Object.values(b).reduce((a, n) => a + n, 0)));
  cont.innerHTML = porBin.map((b, i) => {
    const total = Object.values(b).reduce((a, n) => a + n, 0);
    const dentro = i >= rango[0] && i <= rango[1];
    const pila = FAMILIAS.filter((f) => b[f.id]).map((f) =>
      `<i style="height:${(b[f.id] / max) * 100}%;background:${f.color}"></i>`).join('');
    return `<div class="m-barra${dentro ? '' : ' fuera'}" data-bin="${i}" title="${fmtBin(bins[i])}: ${total} caso${total === 1 ? '' : 's'}">${pila}</div>`;
  }).join('');

  desde.max = hasta.max = String(bins.length - 1);
  desde.value = String(rango[0]);
  hasta.value = String(rango[1]);
  document.getElementById('m-rango').textContent = rango[0] === rango[1]
    ? fmtBin(bins[rango[0]])
    : `${fmtFecha(bins[rango[0]].inicio)} – ${fmtFecha(Math.min(bins[rango[1]].fin - DIA, ultimoDia))}`;
  document.getElementById('m-eje-ini').textContent = fmtFecha(bins[0].inicio, bins[0].unidad !== 'mes');
  document.getElementById('m-eje-fin').textContent = fmtFecha(ultimoDia, bins[0].unidad !== 'mes');
  document.getElementById('m-todo').hidden = rango[0] === 0 && rango[1] === bins.length - 1;
}

function fmtBin(b) {
  if (b.unidad === 'dia') return fmtFecha(b.inicio);
  if (b.unidad === 'mes') return fmtFecha(b.inicio, false);
  return `Semana del ${fmtFecha(b.inicio)}`;
}

function cambiarRango(desde, hasta) {
  rango = [Math.max(0, Math.min(desde, hasta)), Math.min(bins.length - 1, Math.max(desde, hasta))];
  pintarBarras();
  dibujarPuntos(false);
}

function pararReproduccion() {
  if (!reproduciendo) return;
  clearInterval(reproduciendo);
  reproduciendo = null;
  const b = document.getElementById('m-play');
  if (b) { b.innerHTML = ICONO_PLAY; b.setAttribute('aria-label', 'Reproducir'); }
}

// Corre el final del rango desde el principio hasta el último día: los
// casos aparecen en el orden en que llegaron. El mapa no se reencuadra.
function reproducir() {
  if (reproduciendo) return pararReproduccion();
  if (!bins.length) return;
  // Con el rango hasta el final, arranca de cero; si estaba en pausa a
  // medio camino, sigue desde ahí.
  const desde = rango[0];
  let i = rango[1] === bins.length - 1 ? rango[0] : rango[1];
  cambiarRango(desde, i);
  const paso = Math.max(120, Math.min(600, 9000 / bins.length));
  const b = document.getElementById('m-play');
  b.innerHTML = ICONO_PAUSA;
  b.setAttribute('aria-label', 'Pausar');
  reproduciendo = setInterval(() => {
    if (!esVistaActiva('mapa') || !document.getElementById('m-play')) return pararReproduccion();
    i++;
    if (i > bins.length - 1) return pararReproduccion();
    cambiarRango(desde, i);
  }, paso);
}

/* ---------- Herramientas del mapa ---------- */

function controlCoordenadas() {
  const Control = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'm-coord');
      el.textContent = 'Mueva el cursor para ver la coordenada';
      mapa.on('mousemove', (e) => {
        el.textContent = `Lat ${e.latlng.lat.toFixed(5)} · Lon ${e.latlng.lng.toFixed(5)}`;
      });
      return el;
    },
  });
  return new Control();
}

function formatoDistancia(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function terminarMedicion(limpiar) {
  if (!medicion) return;
  mapa.off('click', medicion.alClic).off('mousemove', medicion.alMover).off('dblclick', medicion.alDoble);
  mapa.doubleClickZoom.enable();
  mapa.getContainer().classList.remove('m-midiendo');
  medicion.boton.classList.remove('act');
  medicion.guia.remove();
  if (limpiar) medicion.capa.remove();
  medicion.activa = false;
  if (limpiar) medicion = null;
}

function iniciarMedicion(boton) {
  if (medicion?.activa) return terminarMedicion(true);
  if (medicion) terminarMedicion(true);
  mapa.closePopup(); // una ficha abierta se tragaría los clics de la regla
  const capa = L.layerGroup().addTo(mapa);
  const linea = L.polyline([], { color: '#171D1B', weight: 3, dashArray: '6 6', interactive: false }).addTo(capa);
  const guia = L.polyline([], { color: '#171D1B', weight: 2, opacity: 0.5, dashArray: '3 6', interactive: false }).addTo(mapa);
  const etiqueta = L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'm-medida' });
  const vertices = [];
  const total = () => vertices.reduce((s, v, i) => (i ? s + mapa.distance(vertices[i - 1], v) : 0), 0);

  medicion = { activa: true, capa, guia, boton };
  medicion.alClic = (e) => {
    vertices.push(e.latlng);
    linea.setLatLngs(vertices);
    L.circleMarker(e.latlng, { radius: 4, color: '#171D1B', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(capa);
    etiqueta.setLatLng(e.latlng).setContent(vertices.length > 1 ? `Total: <b>${formatoDistancia(total())}</b>` : 'Toque el siguiente punto').addTo(capa);
  };
  medicion.alMover = (e) => {
    if (!vertices.length) return;
    const ultimo = vertices[vertices.length - 1];
    guia.setLatLngs([ultimo, e.latlng]);
    etiqueta.setLatLng(e.latlng).setContent(`${formatoDistancia(total() + mapa.distance(ultimo, e.latlng))}<br><span>Doble clic o Enter para terminar · Esc para borrar</span>`);
  };
  medicion.alDoble = () => {
    if (vertices.length > 1) etiqueta.setLatLng(vertices[vertices.length - 1]).setContent(`Total: <b>${formatoDistancia(total())}</b>`);
    terminarMedicion(false);
  };
  mapa.doubleClickZoom.disable();
  mapa.on('click', medicion.alClic).on('mousemove', medicion.alMover).on('dblclick', medicion.alDoble);
  mapa.getContainer().classList.add('m-midiendo');
  boton.classList.add('act');
}

function controlMedir() {
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const caja = L.DomUtil.create('div', 'leaflet-bar m-herr');
      const b = L.DomUtil.create('a', '', caja);
      b.href = '#';
      b.title = 'Medir distancia';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', 'Medir distancia');
      b.innerHTML = ICONO_REGLA;
      L.DomEvent.disableClickPropagation(caja);
      L.DomEvent.on(b, 'click', (e) => { L.DomEvent.preventDefault(e); iniciarMedicion(b); });
      return caja;
    },
  });
  return new Control();
}

function alTeclear(e) {
  if (!medicion || !esVistaActiva('mapa')) return;
  if (e.key === 'Escape') terminarMedicion(true);
  else if (e.key === 'Enter' && medicion.activa) medicion.alDoble();
}

/* ---------- Eventos ---------- */

function enlazar() {
  document.querySelectorAll('.m-fam').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.fam;
    if (filtros.familias.has(f)) filtros.familias.delete(f);
    else filtros.familias.add(f);
    b.setAttribute('aria-pressed', String(filtros.familias.has(f)));
    b.classList.toggle('act', filtros.familias.has(f));
    llenarSelects();
    pintarBarras();
    dibujarPuntos(true);
  }));
  const alCambiarSelect = (id, campo) => document.getElementById(id).addEventListener('change', (e) => {
    filtros[campo] = e.target.value;
    pintarBarras();
    dibujarPuntos(true);
  });
  alCambiarSelect('m-tipo', 'tipo');
  alCambiarSelect('m-depto', 'departamento');
  alCambiarSelect('m-estado', 'estado');

  document.getElementById('m-limpiar').addEventListener('click', () => {
    filtros = filtrosVacios();
    document.querySelectorAll('.m-fam').forEach((b) => { b.classList.remove('act'); b.setAttribute('aria-pressed', 'false'); });
    document.getElementById('m-estado').value = '';
    llenarSelects();
    pintarBarras();
    dibujarPuntos(true);
  });

  document.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    colorPor = b.dataset.color;
    document.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('act', x === b));
    pintarLeyenda();
    dibujarPuntos(false);
  }));

  document.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
    if (modoFecha === b.dataset.modo) return;
    pararReproduccion();
    modoFecha = b.dataset.modo;
    document.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('act', x === b));
    armarCubetas();
    pintarBarras();
    dibujarPuntos(true);
  }));

  const desde = document.getElementById('m-desde');
  const hasta = document.getElementById('m-hasta');
  desde.addEventListener('input', () => { pararReproduccion(); cambiarRango(Number(desde.value), Number(hasta.value)); });
  hasta.addEventListener('input', () => { pararReproduccion(); cambiarRango(Number(desde.value), Number(hasta.value)); });
  document.getElementById('m-barras').addEventListener('click', (e) => {
    const barra = e.target.closest('[data-bin]');
    if (!barra) return;
    pararReproduccion();
    const i = Number(barra.dataset.bin);
    cambiarRango(i, i);
  });
  document.getElementById('m-todo').addEventListener('click', () => { pararReproduccion(); cambiarRango(0, bins.length - 1); });
  document.getElementById('m-play').addEventListener('click', reproducir);

  mapa.on('popupopen', (e) => {
    const el = e.popup.getElement();
    el.querySelector('[data-abrir]')?.addEventListener('click', (ev) => {
      abrirFichaCaso(ev.currentTarget.dataset.abrir, { alCambiar: () => {} });
    });
    el.querySelector('[data-copiar]')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      try {
        await navigator.clipboard.writeText(b.dataset.copiar);
        b.textContent = 'Copiada';
      } catch {
        b.textContent = 'No se pudo';
      }
      setTimeout(() => { b.textContent = 'Copiar'; }, 1600);
    });
  });
  document.removeEventListener('keydown', alTeclear);
  document.addEventListener('keydown', alTeclear);
}

// Racimos sobrios: un círculo oscuro con el número, más grande cuanto más
// casos agrupa, en vez del verde-amarillo-naranja de la librería, que se
// confundía con los colores de tipo y de estado.
function iconoRacimo(racimo) {
  const n = racimo.getChildCount();
  const tam = n < 10 ? 34 : n < 50 ? 40 : n < 200 ? 48 : 56;
  return L.divIcon({ html: `<span>${n}</span>`, className: 'm-racimo', iconSize: [tam, tam] });
}

export async function montar(raiz) {
  pararReproduccion();
  medicion = null;
  filtros = filtrosVacios();
  colorPor = 'familia';
  modoFecha = 'llegada';
  raiz.innerHTML = esqueleto();
  raiz.insertAdjacentHTML('beforeend', '<p class="cargando" id="m-cargando">Cargando los casos del mapa…</p>');

  const [r] = await Promise.all([obtenerMapa(), cargarLeafletConClusters()]);
  if (!esVistaActiva('mapa')) return;
  document.getElementById('m-cargando')?.remove();

  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar el mapa: ${esc(r.error)} (${esc(r.code)}).</p>`);
    return;
  }

  puntos = r.data.puntos;
  puedeVerExacto = !!r.data.puede_ver_exacto;
  document.getElementById('m-resumen').textContent = `${puntos.length} casos con ubicación` +
    (r.data.sin_ubicacion ? ` · ${r.data.sin_ubicacion} sin ubicación (su comunidad no tiene punto guardado)` : '');

  mapa = L.map('r-mapa', { zoomControl: true, maxZoom: 19 }).setView([13.7, -88.9], 8);
  mapa.createPane('nombres');
  mapa.getPane('nombres').style.zIndex = 350;
  mapa.getPane('nombres').style.pointerEvents = 'none';
  const fondos = Object.fromEntries(Object.entries(FONDOS).map(([k, f]) => [k, f()]));
  fondos.Claro.addTo(mapa);
  L.control.layers(fondos, null, { position: 'topright' }).addTo(mapa);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapa);
  controlCoordenadas().addTo(mapa);
  controlMedir().addTo(mapa);

  capaClusters = L.markerClusterGroup({
    maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true, iconCreateFunction: iconoRacimo,
  });
  mapa.addLayer(capaClusters);

  armarCubetas();
  llenarSelects();
  pintarLeyenda();
  pintarBarras();
  enlazar();
  dibujarPuntos(true);
}
