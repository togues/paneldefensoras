/* =====================================================================
   Vista Configuración — tres bloques independientes, en orden de uso:
     1. Códigos de registro (vistas/config-codigos.js): lo que se toca
        antes de cada capacitación o gira.
     2. Comunidades: el catálogo de lugares que la persona elige en
        "¿Dónde fue?" al reportar, con su punto para el Mapa del panel.
        Desde la migración 012 NO tienen códigos: el código no dice de
        qué comunidad es nadie (docs/decision-08-codigo-de-registro.md).
     3. Personal del panel.

   Todo esto es rol administrador únicamente — ver
   lib/PanelAuth.php::obRequireRolAdministrador(). Un operador ve un
   aviso, no la pantalla vacía ni rota.
   ===================================================================== */
import { obtenerUsuarios, crearUsuario, actualizarUsuario, obtenerComunidades, crearComunidad, actualizarComunidad } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { cargarLeaflet } from '../core/cargador-librerias.js';
import { esVistaActiva } from '../main.js';
import { esc } from '../core/graficas.js';
import { esqueletoCodigos, enlazarCodigos, cargarCodigos } from './config-codigos.js';

let cantonesCache = [];
let comunidadesCache = [];

function formatoFecha(iso) {
  if (!iso) return 'nunca entró';
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Mismas 4 opciones que el formulario "Agregar comunidad nueva" —
// antes el de editar era una caja de texto libre, así que una
// comunidad ya creada se podía dejar con un valor mal escrito o con
// otra mayúscula que ya no calzara con nada (encontrado al revisar
// con Marco por qué una comunidad real mostraba "adesco" en vez de
// "ADESCO", 2026-10-20).
const TEXTO_TIPO_COMUNIDAD = { adesco: 'ADESCO', comite: 'Comité', caserio: 'Caserío', otro: 'Otro' };

// Si el valor guardado no es ninguno de los 4 (dato viejo de antes de
// este formulario, o cargado a mano por SQL), se agrega como opción
// aparte en vez de dejar que el <select> mienta mostrando "ADESCO"
// seleccionado por ser la primera de la lista sin que nada calzara.
function opcionesTipoComunidad(valorActual) {
  const conocidas = Object.keys(TEXTO_TIPO_COMUNIDAD)
    .map((v) => `<option value="${v}"${valorActual === v ? ' selected' : ''}>${TEXTO_TIPO_COMUNIDAD[v]}</option>`)
    .join('');
  if (valorActual && !TEXTO_TIPO_COMUNIDAD[valorActual]) {
    return conocidas + `<option value="${valorActual}" selected>${valorActual} (valor antiguo)</option>`;
  }
  return conocidas;
}

// Mapa Leaflet chico de un solo punto, para marcar dónde queda una
// comunidad — NUNCA un límite real (eso es bd/cartografia/, que
// además no va a cubrir "comunidad": ver la nota larga en
// admin/comunidades.php). Se inicializa perezoso, la primera vez que
// se revela el formulario que lo contiene — Leaflet necesita medir un
// contenedor con tamaño real, y mientras el formulario está `display:
// none` o `hidden` no lo tiene (mismo motivo documentado en
// vistas/mapa.js). El guard `_leaflet_id` evita el error "Map
// container is already initialized" si el mismo formulario se abre
// más de una vez sin que el contenedor se vuelva a crear de cero.
// Async porque Leaflet ya no viene cargado de entrada (ver
// core/cargador-librerias.js): Configuración no lo necesitaba hasta
// que se agregó este mapita, así que hay que esperar a que esté listo
// antes de usar `L`.
async function activarMapaUbicacion(contenedor, { latInicial, lonInicial, onCambio }) {
  if (contenedor._leaflet_id) return contenedor._controlUbicacion; // ya estaba activo, no se reinicia
  await cargarLeaflet();
  if (!esVistaActiva('config') || !document.body.contains(contenedor)) return null; // se navegó a otra vista mientras tanto
  const centro = latInicial != null ? [latInicial, lonInicial] : [13.7, -88.9];
  const mapa = L.map(contenedor).setView(centro, latInicial != null ? 13 : 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(mapa);

  let marcador = latInicial != null ? L.marker(centro, { draggable: true }).addTo(mapa) : null;
  if (marcador) marcador.on('dragend', () => { const p = marcador.getLatLng(); onCambio(p.lat, p.lng); });

  mapa.on('click', (e) => {
    if (marcador) {
      marcador.setLatLng(e.latlng);
    } else {
      marcador = L.marker(e.latlng, { draggable: true }).addTo(mapa);
      marcador.on('dragend', () => { const p = marcador.getLatLng(); onCambio(p.lat, p.lng); });
    }
    onCambio(e.latlng.lat, e.latlng.lng);
  });

  // Para el formulario de creación: tras guardar con éxito hay que
  // borrar el marcador que quedó puesto, si no el próximo "Nueva
  // comunidad" lo muestra todavía ahí aunque los campos ocultos ya
  // estén vacíos (formC.reset() limpia los <input>, no el mapa).
  contenedor._controlUbicacion = {
    quitarMarcador() { if (marcador) { mapa.removeLayer(marcador); marcador = null; } mapa.setView([13.7, -88.9], 8); },
  };
  return contenedor._controlUbicacion;
}

const AYUDA_PUNTO = 'El punto ubica la comunidad en el Mapa del panel. No se muestra en la app ni en el muro. Sin punto, sus reportes no aparecen en el mapa.';

function esqueleto() {
  return `
    <div class="head"><div><h1>Configuración</h1><p>Códigos de registro, comunidades y personal del panel</p></div></div>

    ${esqueletoCodigos()}

    <div class="caja">
      <div class="caja-cabecera">
        <div>
          <h2>Comunidades ${botonAyuda('config-comunidades')}</h2>
          <p class="sub">Los lugares que la persona elige en "¿Dónde fue?" al hacer un reporte.</p>
        </div>
        <button class="btn chico" id="cfg-mostrar-form-comunidad">Agregar comunidad</button>
      </div>
      <form id="cfg-form-comunidad" class="com-form" hidden>
        <div class="barra-filtros">
          <div class="campo-grupo" style="flex:1;min-width:180px"><label for="cfg-c-nombre">Nombre de la comunidad</label><input class="campo-filtro" id="cfg-c-nombre" required></div>
          <div class="campo-grupo" style="min-width:150px"><label for="cfg-c-tipo">Tipo</label>
            <select class="campo-filtro" id="cfg-c-tipo">
              ${Object.entries(TEXTO_TIPO_COMUNIDAD).map(([v, texto]) => `<option value="${v}">${texto}</option>`).join('')}
            </select>
          </div>
          <div class="campo-grupo" style="flex:1;min-width:220px"><label for="cfg-c-canton">Cantón</label><select class="campo-filtro" id="cfg-c-canton"></select></div>
        </div>
        <label class="com-etiqueta">Punto en el mapa (opcional): toque el mapa para marcar el centro aproximado</label>
        <div class="mapa-mini" id="cfg-c-mapa"></div>
        <p class="mapa-mini-ayuda" id="cfg-c-ubicacion-texto">${AYUDA_PUNTO}</p>
        <input type="hidden" id="cfg-c-lat">
        <input type="hidden" id="cfg-c-lon">
        <div id="cfg-c-error" hidden class="cod-error"></div>
        <div class="com-botones">
          <button class="btn chico" type="submit">Guardar comunidad</button>
          <button class="btn ghost chico" type="button" id="cfg-c-cancelar">Cancelar</button>
        </div>
      </form>
      <div class="campo-grupo com-buscar">
        <label for="cfg-com-buscar">Buscar</label>
        <input type="search" id="cfg-com-buscar" class="campo-filtro" placeholder="Nombre de la comunidad o cantón…">
      </div>
      <div id="cfg-comunidades"><p class="cargando">Cargando…</p></div>
    </div>

    <div class="caja">
      <h2>Personal del panel ${botonAyuda('config-usuarios')}</h2>
      <p class="sub">Quién puede entrar al panel y con qué rol. Una cuenta desactivada no puede iniciar sesión, pero su nombre sigue en la bitácora de los casos que ya gestionó.</p>
      <div id="cfg-usuarios"></div>
      <button class="btn ghost chico" id="cfg-mostrar-form-usuario" style="margin-top:14px">Agregar persona al panel</button>
      <form id="cfg-form-usuario" style="display:none;margin-top:14px;border-top:1px solid var(--outline-var);padding-top:14px">
        <div class="barra-filtros" style="margin-bottom:10px">
          <div class="campo-grupo" style="flex:1;min-width:160px"><label>Nombre</label><input class="campo-filtro" id="cfg-u-nombre" required></div>
          <div class="campo-grupo" style="flex:1;min-width:180px"><label>Correo</label><input class="campo-filtro" type="email" id="cfg-u-correo" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Clave inicial</label><input class="campo-filtro" type="text" id="cfg-u-clave" placeholder="mínimo 8 caracteres" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Rol</label>
            <select class="campo-filtro" id="cfg-u-rol">
              <option value="operador">Operador</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </div>
        <div id="cfg-u-error" style="display:none" class="error-carga"></div>
        <button class="btn chico" type="submit">Crear cuenta</button>
        <button class="btn ghost chico" type="button" id="cfg-u-cancelar">Cancelar</button>
      </form>
    </div>`;
}

function pintarUsuarios(usuarios) {
  const yo = sesion.usuarioActual();
  document.getElementById('cfg-usuarios').innerHTML = usuarios.map((u) => `
    <div class="lista-item">
      <div class="li-t">
        <b>${u.nombre}${u.id === yo?.id ? ' (usted)' : ''}</b>
        <small>${u.correo} · ${u.rol} · Último acceso: ${formatoFecha(u.ultimo_acceso)}</small>
      </div>
      <span class="li-a" data-usuario-toggle="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Reactivar'}</span>
    </div>`).join('') || '<p class="sub2">Sin cuentas todavía.</p>';

  document.querySelectorAll('[data-usuario-toggle]').forEach((el) => {
    el.addEventListener('click', async () => {
      const activo = el.dataset.activo === 'true';
      el.textContent = 'Guardando…';
      const r = await actualizarUsuario(el.dataset.usuarioToggle, { activo: !activo });
      if (r.ok) await cargarUsuarios();
      else el.textContent = activo ? 'Desactivar' : 'Reactivar';
    });
  });
}

function filaComunidad(co) {
  const tipoTexto = TEXTO_TIPO_COMUNIDAD[co.tipo] || co.tipo || 'Sin tipo';
  const reportes = co.reportes === 1 ? '1 reporte' : `${co.reportes} reportes`;
  const punto = co.lat != null ? 'con punto en el mapa' : '<span class="com-sin-punto">sin punto en el mapa</span>';
  return `
    <div class="com-item${co.activo ? '' : ' inactiva'}" data-comunidad-bloque="${co.id}">
      <div class="com-item-fila">
        <div class="com-item-cuerpo">
          <div class="com-item-titulo"><b>${esc(co.nombre)}</b><span class="pill p-a">${esc(tipoTexto)}</span>${co.activo ? '' : '<span class="pill p-n">Desactivada</span>'}</div>
          <small>Cantón ${esc(co.canton || '—')} · ${reportes} · ${punto}</small>
        </div>
        ${co.activo
          ? `<button type="button" class="btn ghost chico" data-mostrar-editar-comunidad="${co.id}">Editar</button>`
          : `<button type="button" class="btn ghost chico" data-comunidad-toggle="${co.id}" data-activo="false" data-nombre="${esc(co.nombre)}">Reactivar</button>`}
      </div>
      ${co.activo ? `
        <div class="com-editor" data-editor-comunidad="${co.id}" hidden>
          <div class="barra-filtros">
            <div class="campo-grupo" style="flex:1;min-width:200px"><label>Nombre</label><input class="campo-filtro" type="text" data-com-nombre="${co.id}" value="${esc(co.nombre)}"></div>
            <div class="campo-grupo" style="min-width:150px"><label>Tipo</label><select class="campo-filtro" data-com-tipo="${co.id}">${opcionesTipoComunidad(co.tipo)}</select></div>
          </div>
          <label class="com-etiqueta">Punto en el mapa: toque el mapa para marcarlo o moverlo</label>
          <div class="mapa-mini" data-mapa-comunidad="${co.id}"></div>
          <p class="mapa-mini-ayuda" data-ubicacion-texto="${co.id}">${AYUDA_PUNTO}</p>
          <input type="hidden" data-ubic-lat="${co.id}" value="${co.lat ?? ''}">
          <input type="hidden" data-ubic-lon="${co.id}" value="${co.lon ?? ''}">
          <div class="com-botones">
            <button type="button" class="btn chico" data-guardar-comunidad="${co.id}">Guardar cambios</button>
            <button type="button" class="btn ghost chico" data-cerrar-editor="${co.id}">Cancelar</button>
            ${co.lat != null ? `<button type="button" class="btn ghost chico" data-quitar-ubicacion="${co.id}">Quitar el punto</button>` : ''}
          </div>
          <div class="zona-peligro">
            <div><b>Desactivar comunidad</b><small>Deja de aparecer en la app para elegir. Los reportes que ya la tienen no cambian. Se puede reactivar.</small></div>
            <button type="button" class="btn chico peligro" data-comunidad-toggle="${co.id}" data-activo="true" data-nombre="${esc(co.nombre)}">Desactivar</button>
          </div>
        </div>` : ''}
    </div>`;
}

function pintarComunidades(comunidades) {
  document.getElementById('cfg-comunidades').innerHTML = comunidades.map(filaComunidad).join('')
    || (comunidadesCache.length ? '<p class="sub2">Ninguna comunidad calza con la búsqueda.</p>' : '<p class="sub2">Todavía no hay comunidades. Agregue la primera.</p>');

  document.querySelectorAll('[data-mostrar-editar-comunidad]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.mostrarEditarComunidad;
      const editor = document.querySelector(`[data-editor-comunidad="${id}"]`);
      editor.hidden = !editor.hidden;
      el.textContent = editor.hidden ? 'Editar' : 'Cerrar';
      if (editor.hidden) return;
      const co = comunidades.find((c) => String(c.id) === id);
      await activarMapaUbicacion(document.querySelector(`[data-mapa-comunidad="${id}"]`), {
        latInicial: co?.lat ?? null,
        lonInicial: co?.lon ?? null,
        onCambio: (lat, lon) => {
          document.querySelector(`[data-ubic-lat="${id}"]`).value = lat;
          document.querySelector(`[data-ubic-lon="${id}"]`).value = lon;
          document.querySelector(`[data-ubicacion-texto="${id}"]`).textContent = `Punto marcado: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Se guarda al tocar "Guardar cambios".`;
        },
      });
    });
  });
  document.querySelectorAll('[data-cerrar-editor]').forEach((el) => {
    el.addEventListener('click', () => pintarComunidades(comunidadesFiltradas(document.getElementById('cfg-com-buscar').value)));
  });
  document.querySelectorAll('[data-quitar-ubicacion]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.quitarUbicacion;
      document.querySelector(`[data-ubic-lat="${id}"]`).value = 'quitar';
      document.querySelector(`[data-ubic-lon="${id}"]`).value = 'quitar';
      document.querySelector(`[data-ubicacion-texto="${id}"]`).textContent = 'El punto se quita al tocar "Guardar cambios". Sin punto, sus reportes no aparecen en el Mapa.';
      document.querySelector(`[data-mapa-comunidad="${id}"]`)._controlUbicacion?.quitarMarcador();
      el.remove();
    });
  });
  document.querySelectorAll('[data-guardar-comunidad]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.guardarComunidad;
      const nombre = document.querySelector(`[data-com-nombre="${id}"]`).value.trim();
      const tipo = document.querySelector(`[data-com-tipo="${id}"]`).value.trim();
      // El punto solo viaja si de verdad se tocó: "quitar" lo borra, un
      // número lo fija o lo mueve, vacío no pisa el que ya tenía.
      const ubicLat = document.querySelector(`[data-ubic-lat="${id}"]`).value;
      const ubicLon = document.querySelector(`[data-ubic-lon="${id}"]`).value;
      let cambiosUbicacion = {};
      if (ubicLat === 'quitar') cambiosUbicacion = { lat: null, lon: null };
      else if (ubicLat !== '' && ubicLon !== '') cambiosUbicacion = { lat: Number(ubicLat), lon: Number(ubicLon) };
      el.disabled = true;
      el.textContent = 'Guardando…';
      const r = await actualizarComunidad(id, { nombre, tipo, ...cambiosUbicacion });
      if (r.ok) await cargarComunidades();
      else { el.disabled = false; el.textContent = 'Guardar cambios'; alert('No se pudo guardar: ' + r.error); }
    });
  });
  document.querySelectorAll('[data-comunidad-toggle]').forEach((el) => {
    el.addEventListener('click', async () => {
      const activo = el.dataset.activo === 'true';
      if (activo && !confirm(`¿Desactivar "${el.dataset.nombre}"?\n\nDeja de aparecer en la app para elegirla al reportar. Los reportes que ya la tienen no cambian. Se puede reactivar después.`)) return;
      el.disabled = true;
      const r = await actualizarComunidad(el.dataset.comunidadToggle, { activo: !activo });
      if (r.ok) await cargarComunidades();
      else { el.disabled = false; alert('No se pudo guardar: ' + r.error); }
    });
  });
}

async function cargarUsuarios() {
  const r = await obtenerUsuarios();
  if (!esVistaActiva('config')) return; // se navegó a otra vista mientras tanto
  if (r.ok) pintarUsuarios(r.data.usuarios);
}

function comunidadesFiltradas(filtro) {
  const q = filtro.trim().toLowerCase();
  if (!q) return comunidadesCache;
  return comunidadesCache.filter((co) =>
    co.nombre.toLowerCase().includes(q)
    || (co.canton || '').toLowerCase().includes(q));
}

async function cargarComunidades() {
  const r = await obtenerComunidades();
  if (!esVistaActiva('config')) return; // se navegó a otra vista mientras tanto
  if (!r.ok) return;
  comunidadesCache = r.data.comunidades;
  pintarComunidades(comunidadesFiltradas(document.getElementById('cfg-com-buscar')?.value || ''));
  cantonesCache = r.data.cantones_disponibles;
  const select = document.getElementById('cfg-c-canton');
  select.innerHTML = cantonesCache.map((c) => `<option value="${c.id}">${c.canton} — ${c.municipio}, ${c.departamento}</option>`).join('');
}

function enlazarFormularios() {
  const formU = document.getElementById('cfg-form-usuario');
  document.getElementById('cfg-mostrar-form-usuario').addEventListener('click', () => { formU.style.display = 'block'; });
  document.getElementById('cfg-u-cancelar').addEventListener('click', () => { formU.style.display = 'none'; formU.reset(); });
  formU.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('cfg-u-error');
    error.style.display = 'none';
    const r = await crearUsuario({
      nombre: document.getElementById('cfg-u-nombre').value.trim(),
      correo: document.getElementById('cfg-u-correo').value.trim(),
      clave: document.getElementById('cfg-u-clave').value,
      rol: document.getElementById('cfg-u-rol').value,
    });
    if (!r.ok) {
      error.textContent = r.error;
      error.style.display = 'block';
      return;
    }
    formU.style.display = 'none';
    formU.reset();
    await cargarUsuarios();
  });

  const formC = document.getElementById('cfg-form-comunidad');
  document.getElementById('cfg-mostrar-form-comunidad').addEventListener('click', async () => {
    formC.hidden = false;
    // Recién visible: ahora sí tiene tamaño real para que Leaflet lo mida.
    await activarMapaUbicacion(document.getElementById('cfg-c-mapa'), {
      latInicial: null,
      lonInicial: null,
      onCambio: (lat, lon) => {
        document.getElementById('cfg-c-lat').value = lat;
        document.getElementById('cfg-c-lon').value = lon;
        document.getElementById('cfg-c-ubicacion-texto').textContent = `Punto marcado: ${lat.toFixed(4)}, ${lon.toFixed(4)}.`;
      },
    });
  });
  document.getElementById('cfg-c-cancelar').addEventListener('click', () => { formC.hidden = true; formC.reset(); });
  formC.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('cfg-c-error');
    error.hidden = true;
    const lat = document.getElementById('cfg-c-lat').value;
    const lon = document.getElementById('cfg-c-lon').value;
    const r = await crearComunidad({
      nombre: document.getElementById('cfg-c-nombre').value.trim(),
      tipo: document.getElementById('cfg-c-tipo').value,
      canton_id: document.getElementById('cfg-c-canton').value,
      ...(lat && lon ? { lat: Number(lat), lon: Number(lon) } : {}),
    });
    if (!r.ok) {
      error.textContent = r.error;
      error.hidden = false;
      return;
    }
    formC.hidden = true;
    formC.reset();
    document.getElementById('cfg-c-ubicacion-texto').textContent = AYUDA_PUNTO;
    document.getElementById('cfg-c-mapa')._controlUbicacion?.quitarMarcador();
    await cargarComunidades();
  });

  // Filtra la lista ya cargada, en el cliente — sin volver a pedirle
  // nada al servidor, igual que cualquier otra búsqueda chica de este
  // panel.
  document.getElementById('cfg-com-buscar').addEventListener('input', (e) => {
    pintarComunidades(comunidadesFiltradas(e.target.value));
  });
}

export async function montar(raiz) {
  const usuario = sesion.usuarioActual();
  if (usuario?.rol !== 'administrador') {
    raiz.innerHTML = `
      <div class="head"><div><h1>Configuración</h1></div></div>
      <div class="nota-demo"><b>Esta sección es solo para administradores.</b> Si necesita una cuenta nueva o un código de registro, pídaselo a alguien con ese rol.</div>`;
    return;
  }

  raiz.innerHTML = esqueleto();
  enlazarCodigos();
  enlazarFormularios();
  // Sin esperar: el mapita de ubicación recién hace falta si la
  // persona abre "Nueva comunidad" o "Editar" — probablemente unos
  // segundos después de que esta vista ya esté en pantalla. Pedirlo
  // ahora, de fondo, evita que el primer clic en el mapa se sienta
  // "muerto" mientras Leaflet todavía está bajando del CDN.
  cargarLeaflet();
  await Promise.all([cargarCodigos(), cargarComunidades(), cargarUsuarios()]);
}
