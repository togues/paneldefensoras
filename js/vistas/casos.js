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
import { obtenerCasos, obtenerCaso, obtenerCatalogos, actualizarCaso, publicarCaso, obtenerEvidenciaUrl, eliminarEvidencia } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarLeaflet } from '../core/cargador-librerias.js';

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
      <td><span class="pill ${CLASE_ESTADO[c.estado] || 'p-i'}">${ETIQ_ESTADO[c.estado] || c.estado}</span>${anomaloChip}</td>
    </tr>`;
}

function leerFiltrosSinPaginar() {
  const filtros = {};
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
  ['c-comunidad', 'c-departamento', 'c-prioridad', 'c-desde', 'c-hasta'].forEach((idCampo) => {
    document.getElementById(idCampo).addEventListener('change', irAPagina1YCargar);
  });
  document.getElementById('c-limpiar').addEventListener('click', () => {
    document.getElementById('c-buscar').value = '';
    document.getElementById('c-comunidad').value = '';
    document.getElementById('c-departamento').value = '';
    document.getElementById('c-prioridad').value = '';
    document.getElementById('c-desde').value = '';
    document.getElementById('c-hasta').value = '';
    document.querySelectorAll('.filtro[data-e]').forEach((f) => f.classList.remove('act'));
    document.querySelector('.filtro[data-e="todos"]').classList.add('act');
    filtroEstado = 'todos';
    irAPagina1YCargar();
  });
}

async function cargarComunidades() {
  // esqueleto() recrea el <select> vacío cada vez que se vuelve a esta
  // vista: lo que se cachea es la LISTA (un solo pedido a /catalogos
  // por sesión), no si ya se llenó el select — si no, la segunda visita
  // a Casos deja el filtro de comunidad solo con "Todas".
  if (!comunidadesCache) {
    const r = await obtenerCatalogos();
    comunidadesCache = r.ok
      ? (r.data.comunidades || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      : []; // sin bloquear el resto de la vista si /catalogos falla
  }
  const select = document.getElementById('c-comunidad');
  select.insertAdjacentHTML('beforeend', comunidadesCache.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join(''));
}

// Mismo criterio que cargarComunidades(): territorio del HECHO, nunca
// dispositivo.departamento_id (eso es otro dato, demográfico — ver
// bd/migraciones/009). Mismo catálogo de 14 que ya usa la app.
async function cargarDepartamentos() {
  if (!departamentosCache) {
    const r = await obtenerCatalogos();
    departamentosCache = r.ok
      ? (r.data.departamentos || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      : [];
  }
  const select = document.getElementById('c-departamento');
  select.insertAdjacentHTML('beforeend', departamentosCache.map((d) => `<option value="${d.id}">${d.nombre}</option>`).join(''));
}

async function abrirDetalle(id) {
  liberarUrlsFotos();
  liberarMapaDetalleExacto();
  const overlay = document.getElementById('overlay');
  const detalle = document.getElementById('detalle');
  detalle.innerHTML = '<p class="cargando">Cargando el caso…</p>';
  overlay.classList.add('on');

  const r = await obtenerCaso(id);
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

  const publicarBloque = c.publicado
    ? '<div class="caja"><h2>Muro público</h2><p class="sub2">Este caso ya está publicado.</p></div>'
    : esAdministrador
      ? `<div class="caja">
          <h2>Publicar al muro público</h2>
          <p class="sub2">El resumen lo redacta REDNA, nunca es el relato original.</p>
          <textarea class="campo" id="c-resumen-publico" placeholder="Resumen para el muro público…"></textarea>
          <div id="c-publicar-error" style="display:none;padding:8px 0" class="error-carga"></div>
          <button class="btn ghost" style="width:100%" id="c-publicar">Publicar</button>
        </div>`
      : '<div class="caja"><h2>Muro público</h2><p class="sub2">Publicar requiere rol administrador.</p></div>';

  detalle.innerHTML = `
    <div class="det-head">
      <div><h2>Caso ${c.folio || '—'}</h2><p>Recibido ${formatoFecha(c.fecha_registro)}</p></div>
      <button class="cerrar" id="c-cerrar" aria-label="Cerrar"><svg class="i"><use href="#i-cerrar"/></svg></button>
    </div>
    <div class="grid2">
      <div>
        <div class="caja" style="margin-bottom:14px">
          <h2>Lo que se reportó</h2>
          <div class="relato">"${c.descripcion || 'Sin descripción.'}"</div>
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
          <textarea class="campo" id="c-nota" placeholder="Anote lo actuado… (obligatorio para descartar)"></textarea>
          <div id="c-gestion-error" style="display:none" class="error-carga"></div>
          <button class="btn" style="width:100%" id="c-guardar">Guardar cambios</button>
        </div>
        ${publicarBloque}
        <div class="caja"><h2>Bitácora</h2>${bitacora}</div>
        <p class="sub2" style="margin-top:14px">El relato original nunca se edita. Toda interpretación va en las notas de seguimiento, para conservar el valor probatorio del registro.</p>
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

    if (Object.keys(cambios).length === 0) {
      error.textContent = 'No hay nada que guardar: cambie el estado o escriba una nota.';
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

    await abrirDetalle(id); // re-pinta con la bitácora y el estado ya actualizados
    cargarTabla(); // refleja el cambio en la fila de fondo sin cerrar el detalle
  });

  document.getElementById('c-publicar')?.addEventListener('click', async () => {
    const boton = document.getElementById('c-publicar');
    const error = document.getElementById('c-publicar-error');
    const resumen = document.getElementById('c-resumen-publico').value.trim();
    error.style.display = 'none';

    if (!resumen) {
      error.textContent = 'El resumen no puede quedar vacío.';
      error.style.display = 'block';
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Publicando…';
    const r = await publicarCaso(id, resumen);
    boton.disabled = false;
    boton.textContent = 'Publicar';

    if (!r.ok) {
      error.textContent = r.error;
      error.style.display = 'block';
      return;
    }

    await abrirDetalle(id);
    cargarTabla();
  });
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
 * llegó esperando a las demás) y la pone tanto en su miniatura como
 * guardada para el lightbox — así "ver completa" no vuelve a pedirla.
 */
async function cargarMiniaturasEvidencia(ids) {
  await Promise.all(ids.map(async (idFoto) => {
    const boton = document.querySelector(`.fotito[data-foto="${idFoto}"]`);
    if (!boton) return; // el detalle pudo cerrarse antes de que llegara
    const r = await obtenerEvidenciaUrl(idFoto);
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

function abrirFotoCompleta(url) {
  const lightbox = document.getElementById('foto-lightbox');
  lightbox.querySelector('img').src = url;
  lightbox.classList.add('on');
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
  cargarTabla();
}

function enlazarLightboxFotos() {
  document.getElementById('detalle').addEventListener('click', (e) => {
    const borrarBoton = e.target.closest('[data-borrar-foto]');
    if (borrarBoton) {
      borrarFoto(borrarBoton);
      return;
    }
    const verBoton = e.target.closest('.fotito[data-foto-url]');
    if (verBoton) abrirFotoCompleta(verBoton.dataset.fotoUrl);
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

let overlayEnlazado = false;

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  filtroEstado = 'todos';
  paginaActual = 1;
  enlazarFiltrosEstado();
  enlazarBarraFiltros();
  enlazarExportar();
  if (!overlayEnlazado) {
    enlazarOverlay();
    enlazarLightboxFotos();
    overlayEnlazado = true;
  }
  await cargarComunidades();
  await cargarDepartamentos();
  await cargarTabla();
}
