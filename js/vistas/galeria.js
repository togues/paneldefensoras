/* =====================================================================
   Vista Galería — la evidencia fotográfica de todos los casos, para
   recorrerla como galería: de la foto al caso (al revés que en Casos).
   Pedido del cliente (ACUA) en reunión, transmitido por Marco el
   2026-10-20. Solo administrador: el servidor ya lo exige
   (api/admin/galeria.php); acá además la vista avisa en vez de quedar
   vacía, igual que Configuración.

   Rendimiento — pensado para conexiones lentas y para cuando haya
   cientos de fotos, no las nueve de hoy:
   - La API devuelve solo metadatos; cada imagen se pide aparte, en
     versión miniatura (~10-40 KB en vez del original de hasta 5 MB).
   - Una miniatura recién se pide cuando su cuadro está por entrar en
     pantalla (IntersectionObserver), nunca toda la galería de golpe.
   - Como mucho MAX_SIMULTANEAS pedidos de imagen a la vez, para no
     ahogar una conexión mala con decenas de descargas paralelas.
   - Las miniaturas ya bajadas quedan en memoria durante la sesión:
     cambiar un filtro o volver a esta vista no las vuelve a pedir.
   - Paginado con "Cargar más" (agrega, no reemplaza), 24 por vez.

   Tocar una foto abre la MISMA ficha de caso de la vista Casos
   (abrirFichaCaso, exportada de casos.js) — no una segunda versión.
   ===================================================================== */
import { obtenerGaleria, obtenerCatalogos, obtenerEvidenciaUrl } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { esVistaActiva } from '../main.js';
import { abrirFichaCaso } from './casos.js';

const POR_PAGINA = 24;
const MAX_SIMULTANEAS = 4;
const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
const CLASE_ESTADO = { recibido: 'p-n', en_investigacion: 'p-i', cerrado: 'p-c', descartado: 'p-i' };
const FAMILIAS = [
  ['', 'Todas'],
  ['persona', 'Contra personas'],
  ['territorio', 'Agua y tierra'],
  ['gestion', 'Gestión'],
  ['logro', 'Logros'],
];

// Persisten entre visitas a la vista (ver nota de arriba).
const miniaturas = new Map(); // id de evidencia -> URL de objeto
let catalogo = null;

const filtros = { familia: '', departamento_id: '', comunidad_id: '' };
let paginasCargadas = 0;
let total = 0;
let observador = null;
let enVuelo = 0;
const pendientes = [];

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/El_Salvador' });
}

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Galería de evidencias ${botonAyuda('galeria')}</h1><p id="g-resumen">&nbsp;</p></div>
    </div>
    <div class="gal-filtros">
      <div class="filtros" id="g-familias">
        ${FAMILIAS.map(([v, t]) => `<button type="button" class="filtro${v === filtros.familia ? ' act' : ''}" data-familia="${v}">${t}</button>`).join('')}
      </div>
      <div class="barra-filtros">
        <div class="campo-grupo"><label for="g-departamento">Departamento</label>
          <select id="g-departamento" class="campo-filtro"><option value="">Todos</option></select></div>
        <div class="campo-grupo"><label for="g-comunidad">Comunidad</label>
          <select id="g-comunidad" class="campo-filtro"><option value="">Todas</option></select></div>
      </div>
    </div>
    <div class="gal-grilla" id="g-grilla" aria-live="polite"></div>
    <div class="gal-mas" id="g-mas"></div>`;
}

function cuadro(f) {
  return `
    <button type="button" class="gal-foto" data-evidencia="${f.id}" data-caso="${f.reporte_id}"
            aria-label="Abrir el caso ${esc(f.folio)}, ${esc(f.comunidad || 'sin comunidad')}">
      <span class="gal-img cargando-foto"></span>
      <span class="gal-pie">
        <span class="gal-pie-fila"><b>${esc(f.folio)}</b><span class="pill ${CLASE_ESTADO[f.estado] || 'p-i'}">${ETIQ_ESTADO[f.estado] || esc(f.estado)}</span></span>
        <small>${esc(f.tipo_hecho)}</small>
        <small>${esc(f.comunidad || 'Sin comunidad')} · ${fechaCorta(f.fecha_carga)}</small>
      </span>
    </button>`;
}

// ---- Carga de miniaturas: perezosa y con tope de pedidos simultáneos ----

function pintarMiniatura(boton, url) {
  const img = boton.querySelector('.gal-img');
  img.style.backgroundImage = `url("${url}")`;
  img.classList.remove('cargando-foto');
}

async function cargarMiniatura(boton) {
  const id = Number(boton.dataset.evidencia);
  let url = miniaturas.get(id);
  if (!url) {
    const r = await obtenerEvidenciaUrl(id, { miniatura: true });
    if (!r.ok) {
      const img = boton.querySelector('.gal-img');
      img.classList.remove('cargando-foto');
      img.classList.add('gal-img-error');
      return;
    }
    url = r.url;
    miniaturas.set(id, url);
  }
  if (boton.isConnected) pintarMiniatura(boton, url);
}

function bombear() {
  while (enVuelo < MAX_SIMULTANEAS && pendientes.length) {
    const boton = pendientes.shift();
    if (!boton.isConnected) continue; // la grilla cambió mientras esperaba turno
    enVuelo++;
    cargarMiniatura(boton).finally(() => { enVuelo--; bombear(); });
  }
}

function observar(botones) {
  if (!observador) {
    observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        observador.unobserve(e.target);
        pendientes.push(e.target);
      }
      bombear();
    }, { rootMargin: '300px 0px' });
  }
  for (const b of botones) {
    const url = miniaturas.get(Number(b.dataset.evidencia));
    if (url) pintarMiniatura(b, url); // ya bajada antes: al instante, sin pedir nada
    else observador.observe(b);
  }
}

// ---- Datos ----

function pintarResumen() {
  const mostradas = document.querySelectorAll('#g-grilla .gal-foto').length;
  document.getElementById('g-resumen').textContent = total
    ? `${total} fotografía${total === 1 ? '' : 's'}${mostradas < total ? ` · mostrando ${mostradas}` : ''}`
    : 'Sin fotografías';
  const mas = document.getElementById('g-mas');
  mas.innerHTML = mostradas < total
    ? `<button type="button" class="btn ghost" id="g-cargar-mas">Cargar ${Math.min(POR_PAGINA, total - mostradas)} más</button>`
    : '';
  document.getElementById('g-cargar-mas')?.addEventListener('click', cargarSiguiente);
}

async function pedirPagina(pagina) {
  return obtenerGaleria({ ...filtros, pagina, por_pagina: POR_PAGINA });
}

async function cargarSiguiente() {
  const boton = document.getElementById('g-cargar-mas');
  if (boton) { boton.disabled = true; boton.textContent = 'Cargando…'; }
  const r = await pedirPagina(paginasCargadas + 1);
  if (!esVistaActiva('galeria')) return;
  if (!r.ok) {
    if (boton) { boton.disabled = false; boton.textContent = 'Reintentar'; }
    return;
  }
  paginasCargadas++;
  total = r.data.total;
  const grilla = document.getElementById('g-grilla');
  grilla.insertAdjacentHTML('beforeend', r.data.fotos.map(cuadro).join(''));
  observar([...grilla.querySelectorAll('.gal-foto:not([data-vista])')].map((b) => { b.dataset.vista = '1'; return b; }));
  pintarResumen();
}

/**
 * Vuelve a pedir lo que ya estaba a la vista (las mismas páginas), sin
 * volver a bajar ninguna miniatura y sin perder el desplazamiento —
 * para después de cambiar algo desde la ficha de un caso (estado,
 * publicar, borrar una foto).
 */
async function refrescar() {
  const paginas = Math.max(1, paginasCargadas);
  const respuestas = await Promise.all(Array.from({ length: paginas }, (_, i) => pedirPagina(i + 1)));
  if (!esVistaActiva('galeria') || respuestas.some((r) => !r.ok)) return;
  total = respuestas[0].data.total;
  const grilla = document.getElementById('g-grilla');
  grilla.innerHTML = respuestas.flatMap((r) => r.data.fotos).map(cuadro).join('') || vacio();
  observar([...grilla.querySelectorAll('.gal-foto')].map((b) => { b.dataset.vista = '1'; return b; }));
  pintarResumen();
}

function vacio() {
  return '<p class="sub2 gal-vacio">No hay fotografías con ese filtro.</p>';
}

async function recargarDesdeCero() {
  paginasCargadas = 0;
  total = 0;
  pendientes.length = 0;
  observador?.disconnect();
  const grilla = document.getElementById('g-grilla');
  grilla.innerHTML = Array.from({ length: 8 }, () => '<span class="gal-foto gal-fantasma"><span class="gal-img cargando-foto"></span></span>').join('');
  const r = await pedirPagina(1);
  if (!esVistaActiva('galeria')) return;
  if (!r.ok) {
    grilla.innerHTML = `<p class="error-carga">No se pudo cargar la galería: ${esc(r.error)} (${esc(r.code)}).</p>`;
    document.getElementById('g-resumen').textContent = '';
    return;
  }
  paginasCargadas = 1;
  total = r.data.total;
  grilla.innerHTML = r.data.fotos.map(cuadro).join('') || vacio();
  observar([...grilla.querySelectorAll('.gal-foto')].map((b) => { b.dataset.vista = '1'; return b; }));
  pintarResumen();
}

// ---- Filtros ----

function llenarSelect(id, items, valor) {
  const select = document.getElementById(id);
  select.insertAdjacentHTML('beforeend', items.map((i) => `<option value="${i.id}"${String(i.id) === String(valor) ? ' selected' : ''}>${esc(i.nombre)}</option>`).join(''));
}

async function cargarCatalogo() {
  if (!catalogo) {
    const r = await obtenerCatalogos();
    const ordenar = (lista) => (lista || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    catalogo = r.ok ? { departamentos: ordenar(r.data.departamentos), comunidades: ordenar(r.data.comunidades) } : { departamentos: [], comunidades: [] };
  }
  if (!esVistaActiva('galeria')) return;
  llenarSelect('g-departamento', catalogo.departamentos, filtros.departamento_id);
  llenarSelect('g-comunidad', catalogo.comunidades, filtros.comunidad_id);
}

function enlazarFiltros() {
  document.getElementById('g-familias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-familia]');
    if (!b || b.classList.contains('act')) return;
    document.querySelectorAll('#g-familias .filtro').forEach((x) => x.classList.toggle('act', x === b));
    filtros.familia = b.dataset.familia;
    recargarDesdeCero();
  });
  document.getElementById('g-departamento').addEventListener('change', (e) => {
    filtros.departamento_id = e.target.value;
    recargarDesdeCero();
  });
  document.getElementById('g-comunidad').addEventListener('change', (e) => {
    filtros.comunidad_id = e.target.value;
    recargarDesdeCero();
  });
  document.getElementById('g-grilla').addEventListener('click', (e) => {
    const foto = e.target.closest('.gal-foto[data-caso]');
    if (foto) abrirFichaCaso(foto.dataset.caso, { alCambiar: refrescar });
  });
}

export async function montar(raiz) {
  if (sesion.usuarioActual()?.rol !== 'administrador') {
    raiz.innerHTML = `
      <div class="head"><div><h1>Galería de evidencias</h1></div></div>
      <div class="nota-demo"><b>Esta sección es solo para administradores.</b> Las fotografías de un caso se siguen viendo desde su ficha, en Casos.</div>`;
    return;
  }
  raiz.innerHTML = esqueleto();
  enlazarFiltros();
  await Promise.all([cargarCatalogo(), recargarDesdeCero()]);
}
