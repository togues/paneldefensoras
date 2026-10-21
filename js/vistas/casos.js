/* =====================================================================
   Vista Casos — puerto de la sección #v-casos y el overlay de detalle
   (#overlay/#detalle) de diseno/tablero_completo.html, con datos reales
   de GET /admin/casos y GET /admin/casos/{id} en vez del arreglo CASOS
   fijo del mockup.

   El mockup traía chips de estado y unos "▾" decorativos sin función.
   Se le agregó un buscador de texto libre (folio, relato, comunidad),
   comunidad real (de /catalogos), prioridad y rango de fechas —
   pedido de Marco: "una tabla bien dinámica", combinando varios
   filtros a la vez (estado + prioridad + comunidad + mes, por ejemplo).

   El panel de "Gestión" (cambiar estado, agregar nota, descartar,
   publicar) también es nuevo — el mockup lo dibujaba pero su propio
   JavaScript nunca lo conectó a nada. Ya tiene sentido conectarlo
   porque ya hay sesión real (lib/PanelAuth.php): cada cambio queda en
   seguimiento_caso con el usuario que lo hizo, de verdad.

   "Exportar" del mockup tampoco hacía nada — pedido de Marco: bajar en
   CSV/Excel y un informe en PDF "bien diagramado... listo para
   firmarlo", respetando los filtros que estén puestos en ese momento,
   no solo la página visible. Ver exportarCsv()/exportarPdf() más abajo.
   ===================================================================== */
import { obtenerCasos, obtenerCaso, obtenerCatalogos, actualizarCaso, publicarCaso, obtenerEvidenciaUrl, eliminarEvidencia, asignarSeguimientoEnLote } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarLeaflet } from '../core/cargador-librerias.js';
import { esc } from '../core/graficas.js';

const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
const CLASE_ESTADO = { recibido: 'p-n', en_investigacion: 'p-i', cerrado: 'p-c', descartado: 'p-i' };
const NOMBRE_FAMILIA = { persona: 'Persona', territorio: 'Territorio', gestion: 'Gestión', logro: 'Logro' };
const COLOR_FAMILIA = { persona: '#A32B1E', territorio: '#B0620A', gestion: '#5B4B8A', logro: '#2D6A4F' };

let filtroEstado = 'todos';
let paginaActual = 1;
let comunidadesCache = null;
let departamentosCache = null;
let temporizadorBusqueda = null;
const POR_PAGINA = 25;

// URLs de objeto (blob:) de las fotos del caso abierto — hay que
// revocarlas al cerrar o al abrir otro caso, si no la memoria del
// navegador se llena de imágenes que nadie está mirando ya.
let urlsFotosActuales = [];
function liberarUrlsFotos() {
  urlsFotosActuales.forEach((u) => URL.revokeObjectURL(u));
  urlsFotosActuales = [];
}

// El mapa chico del punto exacto (coordenada_exacta) se crea de nuevo
// cada vez que se abre un detalle — mismo gotcha de siempre con
// Leaflet: si no se destruye la instancia anterior con .remove()
// antes de crear otra sobre el mismo <div>, tira "Map container is
// already initialized".
let mapaDetalleExacto = null;

// Qué refrescar "de fondo" después de guardar, publicar o borrar una
// foto desde la ficha — en Casos es la tabla; desde la Galería
// (vistas/galeria.js, vía abrirFichaCaso) es la grilla de fotos. Antes
// esto era un cargarTabla() fijo, que desde otra vista revienta porque
// #c-tabla no existe.
let alCambiarDetalle = () => cargarTabla();
let overlayEnlazado = false;

// Filtros que llegan de OTRA vista (tablero de Análisis, indicadores
// del Resumen) — prefiltrarCasos() los deja acá y montar() los aplica.
// familia y tipo de hecho no tienen control propio en esta barra: se
// muestran como chips que se pueden quitar (filtrosExtra), para que la
// tabla muestre exactamente lo que contó el gráfico de origen.
let filtrosPendientes = null;
let totalActual = 0;
let organizacionesCache = null;
let catalogoPromesa = null;

// Un solo pedido a /catalogos por sesión, compartido por comunidades,
// departamentos y organizaciones.
function catalogo() {
  catalogoPromesa ||= obtenerCatalogos().then((r) => (r.ok ? r.data : {}));
  return catalogoPromesa;
}

function esAdmin() {
  return sesion.usuarioActual()?.rol === 'administrador';
}
let filtrosExtra = {};
let etiquetasExtra = {};

export function prefiltrarCasos(filtros) {
  filtrosPendientes = { ...filtros };
}
function liberarMapaDetalleExacto() {
  if (mapaDetalleExacto) {
    mapaDetalleExacto.remove();
    mapaDetalleExacto = null;
  }
}

function formatoFecha(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatoFechaLarga(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
}

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Casos registrados ${botonAyuda('casos-filtros', 'Ayuda con filtros')}</h1><p id="c-resumen"></p></div>
      <div class="acciones">
        <button class="btn ghost chico" id="c-abrir-asignar" hidden>Asignar seguimiento</button>
        <button class="btn ghost chico" id="c-exportar-csv">Exportar CSV</button>
        <button class="btn chico" id="c-exportar-pdf">Descargar informe PDF</button>
        <span style="align-self:center">${botonAyuda('casos-exportar', 'Ayuda para exportar')}</span>
      </div>
    </div>
    <div class="caja">
      <div class="barra-filtros">
        <div class="campo-grupo" style="flex:2;min-width:220px">
          <label for="c-buscar">Buscar</label>
          <input type="search" id="c-buscar" class="campo-filtro" placeholder="Folio, comunidad o una palabra del relato…">
        </div>
        <div class="campo-grupo" style="min-width:190px">
          <label for="c-comunidad">Comunidad</label>
          <select id="c-comunidad" class="campo-filtro"><option value="">Todas</option></select>
        </div>
        <div class="campo-grupo" style="min-width:170px">
          <label for="c-departamento">Departamento</label>
          <select id="c-departamento" class="campo-filtro"><option value="">Todos</option></select>
        </div>
        <div class="campo-grupo" style="min-width:130px">
          <label for="c-prioridad">Prioridad</label>
          <select id="c-prioridad" class="campo-filtro">
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div class="campo-grupo" style="min-width:170px">
          <label for="c-seguimiento">Seguimiento</label>
          <select id="c-seguimiento" class="campo-filtro"><option value="">Todos</option><option value="sin_asignar">Sin asignar</option></select>
        </div>
        <div class="campo-grupo" style="min-width:150px">
          <label for="c-desde">Desde</label>
          <input type="date" id="c-desde" class="campo-filtro">
        </div>
        <div class="campo-grupo" style="min-width:150px">
          <label for="c-hasta">Hasta</label>
          <input type="date" id="c-hasta" class="campo-filtro">
        </div>
        <button class="btn ghost chico" id="c-limpiar">Limpiar filtros</button>
      </div>
      <div class="filtros">
        <div class="filtro act" data-e="todos">Todos</div>
        <div class="filtro" data-e="recibido">Sin revisar</div>
        <div class="filtro" data-e="en_investigacion">En investigación</div>
        <div class="filtro" data-e="cerrado">Cerrados</div>
        <div class="filtro" data-e="descartado">Descartados</div>
        <div class="filtro" data-e="anomalo">Anómalos</div>
      </div>
      <div class="chips-filtro" id="c-extra" hidden></div>
      <div class="asignar-lote" id="c-asignar" hidden>
        <div class="campo-grupo">
          <label for="c-asignar-org">Asignar el seguimiento de los casos de este filtro a</label>
          <select id="c-asignar-org" class="campo-filtro"><option value="">— elija una organización —</option><option value="quitar">Quitar la asignación</option></select>
        </div>
        <button type="button" class="btn chico" id="c-asignar-confirmar" disabled>Asignar</button>
        <button type="button" class="btn ghost chico" id="c-asignar-cancelar">Cancelar</button>
        <p class="sub2" id="c-asignar-aviso"></p>
      </div>
      <table><thead><tr><th>Folio</th><th>Comunidad</th><th>Departamento</th><th>Tipo de hecho</th><th>Familia</th><th>Recibido</th><th>Prioridad</th><th>Estado</th></tr></thead>
      <tbody id="c-tabla"></tbody></table>
    </div>
    <div id="c-paginacion" class="acciones" style="justify-content:center;margin-top:8px"></div>`;
}

function filaCaso(c) {
  const anomaloChip = c.marcado_anomalo ? ' <span class="pill p-a">Anómalo</span>' : '';
  return `<tr data-id="${c.id}">
      <td class="folio">${c.folio || '—'}</td>
      <td>${c.comunidad || '—'}<div class="sub2">${c.canton || ''}</div></td>
      <td>${c.departamento || '—'}</td>
      <td>${c.tipo}</td>
      <td><span class="fam"><i style="background:${COLOR_FAMILIA[c.familia] || '#6F7976'}"></i>${NOMBRE_FAMILIA[c.familia] || c.familia}</span></td>
      <td class="sub2">${formatoFecha(c.fecha_registro)}</td>
      <td class="sub2">${c.prioridad}</td>
      <td><span class="pill ${CLASE_ESTADO[c.estado] || 'p-i'}">${ETIQ_ESTADO[c.estado] || c.estado}</span>${anomaloChip}${c.organizacion_seguimiento ? `<div class="sub2">→ ${c.organizacion_seguimiento}</div>` : ''}</td>
    </tr>`;
}

function leerFiltrosSinPaginar() {
  const filtros = { ...filtrosExtra };
  if (filtroEstado === 'anomalo') filtros.marcado_anomalo = 'true';
  else if (filtroEstado !== 'todos') filtros.estado = filtroEstado;

  const q = document.getElementById('c-buscar')?.value.trim();
  if (q) filtros.q = q;
  const comunidad = document.getElementById('c-comunidad')?.value;
  if (comunidad) filtros.comunidad_id = comunidad;
  const departamento = document.getElementById('c-departamento')?.value;
  if (departamento) filtros.departamento_id = departamento;
  const prioridad = document.getElementById('c-prioridad')?.value;
  if (prioridad) filtros.prioridad = prioridad;
  const seguimiento = document.getElementById('c-seguimiento')?.value;
  if (seguimiento) filtros.organizacion_seguimiento_id = seguimiento;
  const desde = document.getElementById('c-desde')?.value;
  if (desde) filtros.desde = desde;
  const hasta = document.getElementById('c-hasta')?.value;
  // "hasta" en un <input type="date"> es el DÍA, sin hora — hay que
  // llegar hasta el final de ese día o se pierden los casos de esa
  // misma fecha (fecha_registro con hora > 00:00:00 quedaría fuera).
  if (hasta) filtros.hasta = hasta + 'T23:59:59';

  return filtros;
}

function leerFiltros() {
  return { ...leerFiltrosSinPaginar(), pagina: paginaActual, por_pagina: POR_PAGINA };
}

function etiquetasFiltrosActivos() {
  const filtros = leerFiltrosSinPaginar();
  const etiquetas = [];
  if (filtros.estado) etiquetas.push('Estado: ' + (ETIQ_ESTADO[filtros.estado] || filtros.estado));
  if (filtros.marcado_anomalo) etiquetas.push('Solo anómalos');
  if (filtros.q) etiquetas.push(`Búsqueda: "${filtros.q}"`);
  if (filtros.comunidad_id) {
    const nombre = comunidadesCache?.find((c) => String(c.id) === String(filtros.comunidad_id))?.nombre;
    etiquetas.push('Comunidad: ' + (nombre || filtros.comunidad_id));
  }
  if (filtros.departamento_id) {
    const nombre = departamentosCache?.find((d) => String(d.id) === String(filtros.departamento_id))?.nombre;
    etiquetas.push('Departamento: ' + (nombre || filtros.departamento_id));
  }
  if (filtros.prioridad) etiquetas.push('Prioridad: ' + filtros.prioridad);
  if (filtros.organizacion_seguimiento_id) {
    const nombre = filtros.organizacion_seguimiento_id === 'sin_asignar'
      ? 'Sin asignar'
      : organizacionesCache?.find((o) => String(o.id) === String(filtros.organizacion_seguimiento_id))?.nombre;
    etiquetas.push('Seguimiento: ' + (nombre || filtros.organizacion_seguimiento_id));
  }
  for (const clave of Object.keys(filtrosExtra)) etiquetas.push(etiquetasExtra[clave] || clave);
  if (filtros.desde) etiquetas.push('Desde: ' + filtros.desde);
  if (filtros.hasta) etiquetas.push('Hasta: ' + filtros.hasta.slice(0, 10));
  return etiquetas.length ? etiquetas.join(' · ') : 'Sin filtros — todos los casos';
}

/**
 * Trae TODAS las filas que cumplen el filtro actual, no solo la página
 * visible — para exportar hace falta lo mismo que se está mirando, no
 * un recorte de 25.
 */
async function obtenerTodosLosCasosFiltrados() {
  const filtrosBase = leerFiltrosSinPaginar();
  const porPagina = 100; // el máximo que acepta GET /admin/casos
  let pagina = 1;
  let todos = [];
  for (;;) {
    const r = await obtenerCasos({ ...filtrosBase, pagina, por_pagina: porPagina });
    if (!r.ok) return { ok: false, error: r.error, code: r.code };
    todos = todos.concat(r.data.casos);
    if (todos.length >= r.data.total || r.data.casos.length === 0) break;
    pagina++;
  }
  return { ok: true, casos: todos };
}

async function cargarTabla() {
  document.getElementById('c-tabla').innerHTML = '<tr><td colspan="8" class="cargando">Cargando…</td></tr>';

  const r = await obtenerCasos(leerFiltros());
  if (!r.ok) {
    document.getElementById('c-tabla').innerHTML = `<tr><td colspan="8" class="error-carga">No se pudo cargar: ${r.error} (${r.code})</td></tr>`;
    return;
  }

  const { total, casos } = r.data;
  totalActual = total;
  actualizarAvisoAsignar();
  document.getElementById('c-resumen').textContent = `${total} reporte${total === 1 ? '' : 's'}`;
  document.getElementById('c-tabla').innerHTML = casos.length
    ? casos.map(filaCaso).join('')
    : '<tr><td colspan="8" class="vacio">No hay casos con ese filtro.</td></tr>';

  document.querySelectorAll('#c-tabla tr[data-id]').forEach((fila) => {
    fila.addEventListener('click', () => abrirDetalle(fila.dataset.id));
  });

  pintarPaginacion(total);
}

function pintarPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const cont = document.getElementById('c-paginacion');
  if (totalPaginas <= 1) {
    cont.innerHTML = '';
    return;
  }
  cont.innerHTML = `
    <button class="btn ghost chico" ${paginaActual <= 1 ? 'disabled' : ''} id="c-anterior">‹ Anterior</button>
    <span class="sub2" style="align-self:center">Página ${paginaActual} de ${totalPaginas}</span>
    <button class="btn ghost chico" ${paginaActual >= totalPaginas ? 'disabled' : ''} id="c-siguiente">Siguiente ›</button>`;
  document.getElementById('c-anterior')?.addEventListener('click', () => { paginaActual--; cargarTabla(); });
  document.getElementById('c-siguiente')?.addEventListener('click', () => { paginaActual++; cargarTabla(); });
}

function irAPagina1YCargar() {
  paginaActual = 1;
  cargarTabla();
}

// ---- Asignación del seguimiento en lote (solo administrador) ----
// Toma EXACTAMENTE los casos del filtro en pantalla (incluida la
// búsqueda por texto y los chips de familia/tipo), y le dice al
// servidor cuántos eran: si entre tanto cambiaron, no asigna nada.

function actualizarAvisoAsignar() {
  const aviso = document.getElementById('c-asignar-aviso');
  if (!aviso) return;
  const org = document.getElementById('c-asignar-org').value;
  document.getElementById('c-asignar-confirmar').disabled = !org || totalActual === 0;
  aviso.textContent = totalActual === 0
    ? 'El filtro actual no tiene casos.'
    : `Se aplicará a los ${totalActual} caso${totalActual === 1 ? '' : 's'} del filtro actual (${etiquetasFiltrosActivos()}). Cada uno queda anotado en su bitácora.`;
}

function enlazarAsignarLote() {
  const abrir = document.getElementById('c-abrir-asignar');
  const panel = document.getElementById('c-asignar');
  abrir.hidden = !esAdmin();
  abrir.addEventListener('click', () => { panel.hidden = !panel.hidden; actualizarAvisoAsignar(); });
  document.getElementById('c-asignar-cancelar').addEventListener('click', () => { panel.hidden = true; });
  document.getElementById('c-asignar-org').addEventListener('change', actualizarAvisoAsignar);
  document.getElementById('c-asignar-confirmar').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    const valor = document.getElementById('c-asignar-org').value;
    const quitar = valor === 'quitar';
    const nombre = quitar ? null : organizacionesCache.find((o) => String(o.id) === valor)?.nombre;
    const pregunta = quitar
      ? `¿Quitar la organización de seguimiento a los ${totalActual} casos de este filtro?`
      : `¿Asignar el seguimiento de los ${totalActual} casos de este filtro a ${nombre}?`;
    if (!confirm(pregunta)) return;
    boton.disabled = true;
    boton.textContent = 'Asignando…';
    const r = await asignarSeguimientoEnLote(leerFiltrosSinPaginar(), quitar ? null : Number(valor), totalActual);
    boton.textContent = 'Asignar';
    const aviso = document.getElementById('c-asignar-aviso');
    if (!r.ok) {
      aviso.textContent = r.error;
      if (r.code === 'CASOS_CAMBIARON') await cargarTabla();
      boton.disabled = false;
      return;
    }
    panel.hidden = true;
    document.getElementById('c-asignar-org').value = '';
    await cargarTabla();
    document.getElementById('c-resumen').textContent += ` · ${r.data.cambiados} asignado${r.data.cambiados === 1 ? '' : 's'}`;
  });
}

function pintarChipsExtra() {
  const cont = document.getElementById('c-extra');
  const claves = Object.keys(filtrosExtra);
  cont.hidden = claves.length === 0;
  cont.innerHTML = claves.map((c) => `
    <span class="chip-filtro">${etiquetasExtra[c] || c}
      <button type="button" data-quitar-extra="${c}" aria-label="Quitar este filtro">×</button></span>`).join('');
}

/**
 * Aplica lo que dejó prefiltrarCasos() desde otra vista. Comunidad y
 * departamento tienen que aplicarse DESPUÉS de llenar sus <select>.
 */
function aplicarFiltrosPendientes() {
  filtrosExtra = {};
  etiquetasExtra = {};
  const f = filtrosPendientes;
  filtrosPendientes = null;
  if (f) {
    if (f.estado || f.marcado_anomalo) {
      filtroEstado = f.marcado_anomalo ? 'anomalo' : f.estado;
      document.querySelectorAll('.filtro[data-e]').forEach((el) => el.classList.toggle('act', el.dataset.e === filtroEstado));
    }
    const campos = { comunidad_id: 'c-comunidad', departamento_id: 'c-departamento', prioridad: 'c-prioridad', organizacion_seguimiento_id: 'c-seguimiento', desde: 'c-desde', hasta: 'c-hasta' };
    for (const [clave, idCampo] of Object.entries(campos)) {
      if (f[clave]) document.getElementById(idCampo).value = String(f[clave]).slice(0, 10);
    }
    if (f.familia) { filtrosExtra.familia = f.familia; etiquetasExtra.familia = 'Familia: ' + (NOMBRE_FAMILIA[f.familia] || f.familia); }
    if (f.tipo_vulneracion_id) { filtrosExtra.tipo_vulneracion_id = f.tipo_vulneracion_id; etiquetasExtra.tipo_vulneracion_id = 'Tipo: ' + (f.etiquetaTipo || f.tipo_vulneracion_id); }
  }
  pintarChipsExtra();
}

function enlazarFiltrosEstado() {
  document.querySelectorAll('.filtro[data-e]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.filtro[data-e]').forEach((f) => f.classList.remove('act'));
      el.classList.add('act');
      filtroEstado = el.dataset.e;
      irAPagina1YCargar();
    });
  });
}

function enlazarBarraFiltros() {
  document.getElementById('c-buscar').addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(irAPagina1YCargar, 350);
  });
  ['c-comunidad', 'c-departamento', 'c-prioridad', 'c-seguimiento', 'c-desde', 'c-hasta'].forEach((idCampo) => {
    document.getElementById(idCampo).addEventListener('change', irAPagina1YCargar);
  });
  document.getElementById('c-limpiar').addEventListener('click', () => {
    document.getElementById('c-buscar').value = '';
    document.getElementById('c-comunidad').value = '';
    document.getElementById('c-departamento').value = '';
    document.getElementById('c-prioridad').value = '';
    document.getElementById('c-seguimiento').value = '';
    document.getElementById('c-desde').value = '';
    document.getElementById('c-hasta').value = '';
    document.querySelectorAll('.filtro[data-e]').forEach((f) => f.classList.remove('act'));
    document.querySelector('.filtro[data-e="todos"]').classList.add('act');
    filtroEstado = 'todos';
    filtrosExtra = {};
    etiquetasExtra = {};
    pintarChipsExtra();
    irAPagina1YCargar();
  });
  document.getElementById('c-extra').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar-extra]');
    if (!b) return;
    delete filtrosExtra[b.dataset.quitarExtra];
    delete etiquetasExtra[b.dataset.quitarExtra];
    pintarChipsExtra();
    irAPagina1YCargar();
  });
}

async function cargarComunidades() {
  // esqueleto() recrea el <select> vacío cada vez que se vuelve a esta
  // vista: lo que se cachea es la LISTA (un solo pedido a /catalogos
  // por sesión), no si ya se llenó el select — si no, la segunda visita
  // a Casos deja el filtro de comunidad solo con "Todas".
  if (!comunidadesCache) {
    const datos = await catalogo(); // sin bloquear el resto de la vista si /catalogos falla
    comunidadesCache = (datos.comunidades || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  const select = document.getElementById('c-comunidad');
  select.insertAdjacentHTML('beforeend', comunidadesCache.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join(''));
}

// Mismo criterio que cargarComunidades(): territorio del HECHO, nunca
// dispositivo.departamento_id (eso es otro dato, demográfico — ver
// bd/migraciones/009). Mismo catálogo de 14 que ya usa la app.
async function cargarDepartamentos() {
  if (!departamentosCache) {
    const datos = await catalogo();
    departamentosCache = (datos.departamentos || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  const select = document.getElementById('c-departamento');
  select.insertAdjacentHTML('beforeend', departamentosCache.map((d) => `<option value="${d.id}">${d.nombre}</option>`).join(''));
}

// Organización responsable del seguimiento (migración 011) — una
// decisión de REDNA sobre el caso, NUNCA la estructura de quien
// reporta (regla 2; ver docs/decision-07-informe-seguimiento.md). Usa
// el mismo catálogo de organizaciones.
async function asegurarOrganizaciones() {
  if (!organizacionesCache) {
    const datos = await catalogo();
    organizacionesCache = (datos.estructuras || []).map((e) => ({ id: e.id, nombre: e.nombre }));
  }
  return organizacionesCache;
}

async function cargarOrganizaciones() {
  await asegurarOrganizaciones();
  const opciones = organizacionesCache.map((o) => `<option value="${o.id}">${o.nombre}</option>`).join('');
  document.getElementById('c-seguimiento').insertAdjacentHTML('beforeend', opciones);
  document.getElementById('c-asignar-org')?.insertAdjacentHTML('beforeend', opciones);
}

async function abrirDetalle(id) {
  liberarUrlsFotos();
  liberarMapaDetalleExacto();
  const overlay = document.getElementById('overlay');
  const detalle = document.getElementById('detalle');
  detalle.innerHTML = '<p class="cargando">Cargando el caso…</p>';
  overlay.classList.add('on');

  const [r] = await Promise.all([obtenerCaso(id), asegurarOrganizaciones()]);
  if (!r.ok) {
    detalle.innerHTML = `<p class="error-carga">No se pudo cargar el caso: ${r.error} (${r.code})</p>`;
    return;
  }
  const c = r.data;

  const idsEvidencias = c.evidencias_ids || [];
  // Solo el admin ve la fotografía (api_v1.md 3.6: "evidencia no es
  // accesible por URL directa", nunca en el muro ni en ninguna otra
  // parte) — el botón de basura es un hijo APARTE del .fotito, no
  // anidado adentro: un <button> no puede contener otro <button>
  // válido en HTML, y acá hacen falta dos acciones independientes (ver
  // completa / eliminar) sobre la misma miniatura.
  const fotos = idsEvidencias.length > 0
    ? `<div class="caja"><h2>Evidencia · ${idsEvidencias.length} fotografía${idsEvidencias.length > 1 ? 's' : ''}</h2>
        <div class="fotitos">${idsEvidencias.map((idFoto) => `
          <div class="fotito-envoltura">
            <button type="button" class="fotito cargando-foto" data-foto="${idFoto}" aria-label="Ver fotografía completa"></button>
            <button type="button" class="fotito-borrar" data-borrar-foto="${idFoto}" aria-label="Eliminar esta fotografía" title="Eliminar esta fotografía">
              <svg class="i"><use href="#i-basura"/></svg>
            </button>
          </div>`).join('')}</div>
        <p class="sub2">Solo visible acá, para el panel — nunca en el muro público ni en ningún otro lugar. Metadatos EXIF eliminados al momento de la carga.</p></div>`
    : '<div class="caja"><h2>Evidencia</h2><p class="sub2">Sin fotografías adjuntas.</p></div>';

  const bitacora = c.seguimiento.length
    ? c.seguimiento.map((s) => {
        const etiqueta = s.estado_nuevo ? (ETIQ_ESTADO[s.estado_nuevo] || s.estado_nuevo) : null;
        const titulo = etiqueta ? `${etiqueta}${s.nota ? ' — ' + s.nota : ''}` : (s.nota || 'Sin detalle');
        return `<div class="bit"><b>${titulo}</b><span>${s.usuario} · ${formatoFecha(s.fecha)}</span></div>`;
      }).join('')
    : '<p class="sub2">Sin cambios registrados todavía.</p>';

  const usuario = sesion.usuarioActual();
  const esAdministrador = usuario?.rol === 'administrador';

  // Decisión 09: el texto del muro arranca con el relato de la persona y
  // el administrador lo corrige. reporte.descripcion no cambia (regla 6).
  const textoMuro = c.publicado ? (c.resumen_publico || '') : (c.descripcion || '');
  const publicarBloque = esAdministrador
    ? `<div class="caja">
        <h2>${c.publicado ? 'Texto publicado en el muro' : 'Publicar al muro público'}</h2>
        <p class="sub2">${c.publicado
          ? 'Este caso ya está en el muro. Puede corregir el texto: el cambio se ve en el muro al guardarlo y queda en la bitácora.'
          : 'Arranca con el relato de la persona. Corrija la ortografía, quite nombres, caseríos, teléfonos o cualquier dato que identifique a alguien, y agregue lo que haga falta. El relato original de arriba no cambia: queda como evidencia.'}</p>
        <textarea class="campo campo-muro" id="c-resumen-publico" rows="8" placeholder="Texto para el muro público…">${esc(textoMuro)}</textarea>
        <div id="c-revision" class="revision-muro" aria-live="polite"></div>
        <div id="c-publicar-error" style="display:none;padding:8px 0" class="error-carga"></div>
        <div class="acciones-muro">
          <button class="btn ghost" type="button" id="c-revisar">Revisar texto</button>
          <button class="btn" type="button" id="c-publicar">${c.publicado ? 'Guardar texto publicado' : 'Publicar'}</button>
        </div>
      </div>`
    : `<div class="caja"><h2>Muro público</h2><p class="sub2">${c.publicado ? 'Este caso ya está publicado.' : 'Publicar requiere rol administrador.'}</p></div>`;

  detalle.innerHTML = `
    <div class="det-head">
      <div><h2>Caso ${c.folio || '—'}</h2><p>Recibido ${formatoFecha(c.fecha_registro)}</p></div>
      <button class="cerrar" id="c-cerrar" aria-label="Cerrar"><svg class="i"><use href="#i-cerrar"/></svg></button>
    </div>
    <div class="grid2">
      <div>
        <div class="caja" style="margin-bottom:14px">
          <h2>Lo que se reportó</h2>
          <div class="relato">"${esc(c.descripcion || 'Sin descripción.')}"</div>
          <div class="dato"><b>Tipo de hecho</b><span>${c.tipo_hecho}</span></div>
          <div class="dato"><b>Cuándo ocurrió</b><span>${c.fecha_incidente ? formatoFechaLarga(c.fecha_incidente) : 'Sin precisar'}</span></div>
          <div class="dato"><b>Comunidad</b><span>${c.comunidad || '—'}</span></div>
          ${c.referencia_lugar ? `<div class="dato"><b>Seña del lugar</b><span>${c.referencia_lugar}</span></div>` : ''}
          <div class="dato"><b>Ubicación</b><span>${c.coordenada_exacta ? 'La persona marcó un punto exacto' : 'Mostrada a nivel de comunidad — sin punto marcado'}</span></div>
          ${c.coordenada_exacta ? '<div id="c-mapa-exacto"></div><p class="sub2">Punto exacto que marcó la persona al reportar — ver docs/decision-05-coordenada-exacta-panel.md. Nunca aparece en el mapa general ni en el muro público.</p>' : ''}
        </div>
        ${fotos}
      </div>
      <div>
        <div class="caja" style="margin-bottom:14px">
          <h2>Gestión ${botonAyuda('casos-detalle')}</h2>
          <div class="sel" style="cursor:default">
            <span>Estado</span>
            <select id="c-estado-nuevo" class="campo-filtro" style="border:none;padding:0;font-weight:700">
              ${Object.entries(ETIQ_ESTADO).map(([v, t]) => `<option value="${v}" ${v === c.estado ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="sel" style="cursor:default">
            <span>Seguimiento a cargo de</span>
            <select id="c-org-seguimiento" class="campo-filtro" style="border:none;padding:0;font-weight:700" aria-label="Organización responsable del seguimiento">
              <option value="">Sin asignar</option>
              ${organizacionesCache.map((o) => `<option value="${o.id}" ${String(o.id) === String(c.organizacion_seguimiento_id) ? 'selected' : ''}>${o.nombre}</option>`).join('')}
            </select>
          </div>
          <textarea class="campo" id="c-nota" placeholder="Anote lo actuado… (obligatorio para descartar)"></textarea>
          <div id="c-gestion-error" style="display:none" class="error-carga"></div>
          <button class="btn" style="width:100%" id="c-guardar">Guardar cambios</button>
        </div>
        ${publicarBloque}
        <div class="caja"><h2>Bitácora</h2>${bitacora}</div>
        <p class="sub2" style="margin-top:14px">El relato original nunca se edita: conserva su valor probatorio. Lo que se corrige es la versión para el muro, aparte.</p>
      </div>
    </div>`;

  // El manejador de "eliminar foto" vive en enlazarLightboxFotos(),
  // delegado y enlazado una sola vez (no acá adentro, que se repite en
  // cada abrirDetalle()) — necesita saber a qué caso refrescar después
  // de borrar, y por eso no puede capturar `id` por clausura como sí
  // hacen c-guardar/c-publicar.
  detalle.dataset.casoId = id;

  document.getElementById('c-cerrar').addEventListener('click', cerrarDetalle);
  cargarMiniaturasEvidencia(idsEvidencias);
  // Leaflet ya no viene cargado de entrada (core/cargador-librerias.js)
  // — la mayoría de los casos no tiene punto exacto, así que no vale
  // la pena pedirlo salvo que este caso en particular sí lo tenga.
  if (c.coordenada_exacta) {
    await cargarLeaflet();
    montarMapaDetalleExacto(c.coordenada_exacta);
  }

  document.getElementById('c-guardar').addEventListener('click', async () => {
    const boton = document.getElementById('c-guardar');
    const error = document.getElementById('c-gestion-error');
    error.style.display = 'none';

    const estadoNuevo = document.getElementById('c-estado-nuevo').value;
    const nota = document.getElementById('c-nota').value.trim();
    const cambios = {};
    if (estadoNuevo !== c.estado) cambios.estado = estadoNuevo;
    if (nota) cambios.nota = nota;
    const orgNueva = document.getElementById('c-org-seguimiento').value;
    if (orgNueva !== String(c.organizacion_seguimiento_id ?? '')) cambios.organizacion_seguimiento_id = orgNueva ? Number(orgNueva) : null;

    if (Object.keys(cambios).length === 0) {
      error.textContent = 'No hay nada que guardar: cambie el estado, la organización de seguimiento o escriba una nota.';
      error.style.display = 'block';
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Guardando…';
    const r = await actualizarCaso(id, cambios);
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';

    if (!r.ok) {
      error.textContent = r.error + (r.code === 'NOTA_REQUERIDA' ? '' : ` (${r.code})`);
      error.style.display = 'block';
      return;
    }

    await refrescarDetalleSiSigueAbierto(id); // re-pinta con la bitácora y el estado ya actualizados
    alCambiarDetalle(); // refleja el cambio de fondo sin cerrar el detalle
  });

  enlazarPublicar(id, c.publicado);
}

const NOMBRE_CATEGORIA = { politico: 'político', seguridad: 'pandillas o violencia', contacto: 'dato de contacto' };

function pintarRevision(cont, r) {
  const lista = (items) => items.map((h) => `<li><b>${esc(h.termino)}</b> · ${NOMBRE_CATEGORIA[h.categoria] || esc(h.categoria)}</li>`).join('');
  if (!r.bloqueos.length && !r.advertencias.length) {
    cont.innerHTML = '<p class="revision-ok">El filtro no encontró menciones políticas, de pandillas ni datos de contacto. Igual léalo completo antes de publicar.</p>';
    return;
  }
  cont.innerHTML = `
    ${r.bloqueos.length ? `<div class="revision-bloqueo"><p>Hay que quitar esto antes de publicar:</p><ul>${lista(r.bloqueos)}</ul></div>` : ''}
    ${r.advertencias.length ? `<div class="revision-aviso"><p>Revise si esto puede quedar en público:</p><ul>${lista(r.advertencias)}</ul>
      <label class="revision-confirmar"><input type="checkbox" id="c-advertencias-ok"> Lo revisé y puede publicarse así</label></div>` : ''}`;
}

function enlazarPublicar(id, yaPublicado) {
  const boton = document.getElementById('c-publicar');
  if (!boton) return;
  const campo = document.getElementById('c-resumen-publico');
  const revision = document.getElementById('c-revision');
  const error = document.getElementById('c-publicar-error');
  const etiqueta = boton.textContent;

  const mostrarError = (texto) => {
    error.textContent = texto;
    error.style.display = 'block';
  };

  async function revisar() {
    error.style.display = 'none';
    const texto = campo.value.trim();
    if (!texto) {
      mostrarError('El texto para el muro no puede quedar vacío.');
      return null;
    }
    const r = await publicarCaso(id, texto, { solo_revisar: true });
    if (!r.ok) {
      mostrarError(r.error);
      return null;
    }
    pintarRevision(revision, r.data);
    return r.data;
  }

  campo.addEventListener('input', () => { revision.innerHTML = ''; });
  document.getElementById('c-revisar').addEventListener('click', revisar);

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    boton.textContent = 'Revisando…';
    const hallado = await revisar();
    const confirmadas = document.getElementById('c-advertencias-ok')?.checked === true;
    if (!hallado || hallado.bloqueos.length || (hallado.advertencias.length && !confirmadas)) {
      if (hallado?.bloqueos.length) mostrarError('El texto tiene menciones que no pueden ir al muro.');
      else if (hallado?.advertencias.length) mostrarError('Marque "Lo revisé y puede publicarse así" o corrija el texto.');
      boton.disabled = false;
      boton.textContent = etiqueta;
      return;
    }

    boton.textContent = yaPublicado ? 'Guardando…' : 'Publicando…';
    const r = await publicarCaso(id, campo.value.trim(), { advertencias_revisadas: confirmadas });
    boton.disabled = false;
    boton.textContent = etiqueta;
    if (!r.ok) {
      mostrarError(r.error);
      return;
    }
    await refrescarDetalleSiSigueAbierto(id);
    alCambiarDetalle();
  });
}

// Re-pinta la ficha tras guardar/publicar SOLO si sigue abierta y es
// el mismo caso: si alguien la cerró mientras se guardaba, no se le
// vuelve a abrir encima (encontrado con probar-informe-pdf.mjs).
function refrescarDetalleSiSigueAbierto(id) {
  const abierta = document.getElementById('overlay').classList.contains('on');
  if (abierta && document.getElementById('detalle').dataset.casoId === String(id)) return abrirDetalle(id);
  return null;
}

function cerrarDetalle() {
  document.getElementById('overlay').classList.remove('on');
  liberarUrlsFotos();
  liberarMapaDetalleExacto();
}

/**
 * Mapa chico con un marcador en el punto exacto que la persona marcó
 * al reportar — ver docs/decision-05-coordenada-exacta-panel.md.
 * Quien llama a esta función (abrirDetalle) ya esperó
 * cargarLeaflet() antes — acá `window.L` siempre existe.
 */
function montarMapaDetalleExacto(coordenada) {
  const nodo = document.getElementById('c-mapa-exacto');
  if (!nodo || typeof window.L === 'undefined') return;

  // Mismo proveedor de tiles que vistas/mapa.js — con atribución, igual
  // que ahí (OpenStreetMap la exige).
  mapaDetalleExacto = window.L.map(nodo).setView([coordenada.lat, coordenada.lon], 15);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(mapaDetalleExacto);
  window.L.marker([coordenada.lat, coordenada.lon]).addTo(mapaDetalleExacto);

  // El <div> recién entró al DOM dentro del overlay — igual que en
  // app/js/features/ubicacion.js, Leaflet mide cero si se lo pide
  // antes de que el navegador termine de pintar el layout.
  setTimeout(() => mapaDetalleExacto?.invalidateSize(), 250);
}

/**
 * Trae cada fotografía por separado (no bloquea la primera que ya
 * llegó esperando a las demás), en versión MINIATURA (~10-40 KB en vez
 * del original de hasta 5 MB). La completa se pide recién al
 * ampliarla — ver abrirFotoCompleta().
 */
async function cargarMiniaturasEvidencia(ids) {
  await Promise.all(ids.map(async (idFoto) => {
    const boton = document.querySelector(`.fotito[data-foto="${idFoto}"]`);
    if (!boton) return; // el detalle pudo cerrarse antes de que llegara
    const r = await obtenerEvidenciaUrl(idFoto, { miniatura: true });
    if (!r.ok) {
      boton.classList.remove('cargando-foto');
      boton.classList.add('fotito-error');
      boton.disabled = true;
      return;
    }
    urlsFotosActuales.push(r.url);
    boton.classList.remove('cargando-foto');
    boton.style.backgroundImage = `url("${r.url}")`;
    boton.dataset.fotoUrl = r.url;
  }));
}

// Abre de inmediato con la miniatura (ya está en memoria) y la cambia
// por la completa cuando llega — se ve algo al instante en vez de una
// pantalla negra esperando hasta 5 MB por una conexión lenta.
async function abrirFotoCompleta(boton) {
  const lightbox = document.getElementById('foto-lightbox');
  const img = lightbox.querySelector('img');
  img.src = boton.dataset.fotoCompletaUrl || boton.dataset.fotoUrl;
  lightbox.classList.add('on');
  if (boton.dataset.fotoCompletaUrl) return;

  const r = await obtenerEvidenciaUrl(boton.dataset.foto);
  if (!r.ok) return; // se queda con la miniatura, que ya se ve
  urlsFotosActuales.push(r.url);
  boton.dataset.fotoCompletaUrl = r.url;
  // Solo si sigue abierta esta misma foto — pudo cerrarse o cambiarse.
  if (lightbox.classList.contains('on') && img.src === boton.dataset.fotoUrl) img.src = r.url;
}

function cerrarFotoCompleta() {
  document.getElementById('foto-lightbox').classList.remove('on');
}

/**
 * Permanente: sin papelera ni forma de deshacer (ver el comentario
 * largo en admin/evidencia.php). Por eso el aviso es explícito —pedido
 * de Marco— y no un simple "¿Eliminar?" distraído.
 */
async function borrarFoto(boton) {
  const idFoto = boton.dataset.borrarFoto;
  const confirmado = confirm(
    'Eliminar esta fotografía es permanente: no queda ningún respaldo, ni en el panel ni en ningún otro lugar.\n\n¿Continuar?'
  );
  if (!confirmado) return;

  boton.disabled = true;
  const r = await eliminarEvidencia(idFoto);
  if (!r.ok) {
    boton.disabled = false;
    alert('No se pudo eliminar la fotografía: ' + r.error);
    return;
  }

  const idCaso = document.getElementById('detalle').dataset.casoId;
  if (idCaso) await abrirDetalle(idCaso); // re-pinta sin la foto borrada y con la nota ya en la bitácora
  alCambiarDetalle();
}

function enlazarLightboxFotos() {
  document.getElementById('detalle').addEventListener('click', (e) => {
    const borrarBoton = e.target.closest('[data-borrar-foto]');
    if (borrarBoton) {
      borrarFoto(borrarBoton);
      return;
    }
    const verBoton = e.target.closest('.fotito[data-foto-url]');
    if (verBoton) abrirFotoCompleta(verBoton);
  });
  const lightbox = document.getElementById('foto-lightbox');
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) cerrarFotoCompleta(); });
  document.getElementById('foto-lightbox-cerrar').addEventListener('click', cerrarFotoCompleta);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarFotoCompleta(); });
}

function enlazarOverlay() {
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarDetalle(); });
  document.getElementById('detalle').addEventListener('click', (e) => e.stopPropagation());
}

function csvEscapar(valor) {
  const texto = String(valor ?? '');
  return /[",\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

async function exportarCsv(boton) {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Preparando…';

  const r = await obtenerTodosLosCasosFiltrados();

  boton.disabled = false;
  boton.textContent = original;

  if (!r.ok) {
    alert('No se pudo exportar: ' + r.error);
    return;
  }

  const encabezados = ['Folio', 'Comunidad', 'Cantón', 'Distrito', 'Municipio', 'Departamento', 'Tipo de hecho', 'Familia', 'Recibido', 'Prioridad', 'Estado', 'Marcado anómalo'];
  const filas = r.casos.map((c) => [
    c.folio, c.comunidad, c.canton, c.distrito, c.municipio, c.departamento,
    c.tipo, NOMBRE_FAMILIA[c.familia] || c.familia, formatoFechaLarga(c.fecha_registro), c.prioridad,
    ETIQ_ESTADO[c.estado] || c.estado, c.marcado_anomalo ? 'Sí' : 'No'
  ]);

  const csv = [encabezados, ...filas].map((fila) => fila.map(csvEscapar).join(',')).join('\r\n');
  // BOM UTF-8 al inicio: sin esto, Excel en Windows interpreta mal las
  // tildes y la ñ — las muestra como caracteres sueltos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `casos-observatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function filaInformePdf(c) {
  return `<tr>
    <td>${c.folio || '—'}</td>
    <td>${c.comunidad || '—'}<br><span class="chico">${c.canton || ''}</span></td>
    <td>${c.tipo}</td>
    <td>${NOMBRE_FAMILIA[c.familia] || c.familia}</td>
    <td>${formatoFechaLarga(c.fecha_registro)}</td>
    <td>${c.prioridad}</td>
    <td>${ETIQ_ESTADO[c.estado] || c.estado}</td>
  </tr>`;
}

/**
 * "Informe en PDF" es, de verdad, el diálogo nativo de imprimir del
 * navegador sobre un documento generado aparte — no una librería de
 * PDF. Cualquier navegador sabe "Guardar como PDF" desde ahí, y así se
 * evita cargar una librería pesada solo para esto. Se abre la ventana
 * ANTES del await: si se abre después, el navegador la trata como un
 * popup no pedido por la persona y la bloquea.
 */
async function abrirInformePdf(boton) {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert('El navegador bloqueó la ventana del informe. Habilite las ventanas emergentes para este sitio e intente de nuevo.');
    return;
  }
  ventana.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Generando informe…</title></head><body style="font-family:sans-serif;padding:40px;color:#3F4946">Generando informe…</body></html>');

  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Preparando…';
  const r = await obtenerTodosLosCasosFiltrados();
  boton.disabled = false;
  boton.textContent = original;

  if (!r.ok) {
    ventana.document.body.textContent = 'No se pudo generar el informe: ' + r.error;
    return;
  }

  const usuario = sesion.usuarioActual();
  const conteoPorEstado = {};
  for (const c of r.casos) conteoPorEstado[c.estado] = (conteoPorEstado[c.estado] || 0) + 1;
  const resumenHtml = Object.entries(conteoPorEstado)
    .map(([estado, n]) => `<div class="resumen-item"><b>${n}</b><span>${ETIQ_ESTADO[estado] || estado}</span></div>`)
    .join('');

  ventana.document.open();
  ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe de casos — Observatorio Comunitario</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #171D1B; padding: 32px 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .subtitulo { color: #3F4946; font-size: 13px; margin-bottom: 18px; }
  .meta { font-size: 12px; color: #3F4946; margin-bottom: 4px; }
  .resumen { display: flex; gap: 22px; flex-wrap: wrap; margin: 20px 0; padding: 14px 0; border-top: 1.5px solid #171D1B; border-bottom: 1.5px solid #171D1B; }
  .resumen-item b { display: block; font-size: 22px; }
  .resumen-item span { font-size: 11px; color: #3F4946; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 12px; }
  th { text-align: left; padding: 6px 5px; border-bottom: 1.5px solid #171D1B; font-size: 10px; text-transform: uppercase; }
  td { padding: 6px 5px; border-bottom: 1px solid #D3DAD8; vertical-align: top; }
  .chico { color: #3F4946; font-size: 10.5px; }
  .firma { margin-top: 60px; display: flex; gap: 60px; }
  .firma div { flex: 1; border-top: 1px solid #171D1B; padding-top: 6px; font-size: 11px; color: #3F4946; text-align: center; }
  @media print { body { padding: 0; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>Observatorio Comunitario de Vulneraciones de Derechos a Personas Defensoras</h1>
  <p class="subtitulo">Informe de casos</p>
  <p class="meta">Generado el ${new Date().toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${usuario ? ' por ' + usuario.nombre : ''}</p>
  <p class="meta">Filtros aplicados: ${etiquetasFiltrosActivos()}</p>
  <div class="resumen">
    <div class="resumen-item"><b>${r.casos.length}</b><span>Total de casos</span></div>
    ${resumenHtml}
  </div>
  <table>
    <thead><tr><th>Folio</th><th>Comunidad</th><th>Tipo de hecho</th><th>Familia</th><th>Recibido</th><th>Prioridad</th><th>Estado</th></tr></thead>
    <tbody>${r.casos.map(filaInformePdf).join('')}</tbody>
  </table>
  <div class="firma">
    <div>Elaborado por</div>
    <div>Revisado y autorizado por</div>
  </div>
</body>
</html>`);
  ventana.document.close();
  ventana.focus();
  ventana.print();
}

function enlazarExportar() {
  document.getElementById('c-exportar-csv').addEventListener('click', (e) => exportarCsv(e.currentTarget));
  document.getElementById('c-exportar-pdf').addEventListener('click', (e) => abrirInformePdf(e.currentTarget));
}

function enlazarOverlayUnaVez() {
  if (overlayEnlazado) return;
  enlazarOverlay();
  enlazarLightboxFotos();
  overlayEnlazado = true;
}

/**
 * La misma ficha de caso de esta vista, abierta desde otra (hoy, la
 * Galería). `alCambiar` es lo que esa otra vista quiere refrescar
 * después de guardar/publicar/borrar una foto desde la ficha.
 */
export function abrirFichaCaso(id, { alCambiar } = {}) {
  enlazarOverlayUnaVez();
  alCambiarDetalle = alCambiar || (() => {});
  return abrirDetalle(id);
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  filtroEstado = 'todos';
  paginaActual = 1;
  alCambiarDetalle = () => cargarTabla();
  enlazarFiltrosEstado();
  enlazarBarraFiltros();
  enlazarExportar();
  enlazarOverlayUnaVez();
  enlazarAsignarLote();
  await cargarComunidades();
  await cargarDepartamentos();
  await cargarOrganizaciones();
  aplicarFiltrosPendientes();
  await cargarTabla();
}
