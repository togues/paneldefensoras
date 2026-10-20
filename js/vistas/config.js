/* =====================================================================
   Vista Configuración — la primera sección real, "Personal del panel"
   y "Comunidades y códigos". No estaba en diseno/tablero_completo.html
   tal cual (esa maqueta solo tenía "Códigos de comunidad", sin gestión
   de cuentas del panel) — apareció al preguntarle Marco a REDNA cómo
   se registra su propio personal: la respuesta era "a mano, por SQL",
   un vacío real tanto del contrato como de la maqueta. Ver la nota
   larga en api/observatorio/admin/usuarios.php y
   api/observatorio/admin/comunidades.php.

   Todo esto es rol administrador únicamente — ver
   lib/PanelAuth.php::obRequireRolAdministrador(). Un operador ve un
   aviso, no la pantalla vacía ni rota.
   ===================================================================== */
import { obtenerUsuarios, crearUsuario, actualizarUsuario, obtenerComunidades, crearComunidad, generarCodigo, revocarCodigo } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';

let cantonesCache = [];

function formatoFecha(iso) {
  if (!iso) return 'nunca entró';
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esqueleto() {
  return `
    <div class="head"><div><h1>Configuración</h1><p>Personal del panel y comunidades habilitadas para reportar</p></div></div>

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
    </div>

    <div class="caja">
      <h2>Comunidades y códigos de enrolamiento ${botonAyuda('config-comunidades')}</h2>
      <p class="sub">El código es lo único que necesita alguien para enrolarse desde la app — se reparte en la capacitación. Revocar uno no afecta los reportes ya enviados con él.</p>
      <div id="cfg-comunidades"></div>
      <button class="btn ghost chico" id="cfg-mostrar-form-comunidad" style="margin-top:14px">Agregar comunidad nueva</button>
      <form id="cfg-form-comunidad" style="display:none;margin-top:14px;border-top:1px solid var(--outline-var);padding-top:14px">
        <div class="barra-filtros" style="margin-bottom:10px">
          <div class="campo-grupo" style="flex:1;min-width:180px"><label>Nombre de la comunidad</label><input class="campo-filtro" id="cfg-c-nombre" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Tipo</label>
            <select class="campo-filtro" id="cfg-c-tipo">
              <option value="adesco">ADESCO</option>
              <option value="comite">Comité</option>
              <option value="caserio">Caserío</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div class="campo-grupo" style="flex:1;min-width:220px"><label>Cantón</label><select class="campo-filtro" id="cfg-c-canton"></select></div>
        </div>
        <div id="cfg-c-error" style="display:none" class="error-carga"></div>
        <button class="btn chico" type="submit">Crear comunidad y generar código</button>
        <button class="btn ghost chico" type="button" id="cfg-c-cancelar">Cancelar</button>
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

function pintarComunidades(comunidades) {
  document.getElementById('cfg-comunidades').innerHTML = comunidades.map((co) => {
    const codigos = co.codigos.map((c) => `
      <div class="lista-item" style="padding-left:16px">
        <div class="li-t"><b class="codigo-mono">${c.codigo}</b><small>${c.activo ? 'Activo' : 'Revocado'}</small></div>
        ${c.activo ? `<span class="li-a" data-revocar="${c.id}">Revocar</span>` : ''}
      </div>`).join('');
    return `
      <div style="margin-bottom:6px" data-comunidad-bloque="${co.id}">
        <div class="lista-item">
          <div class="li-t"><b>${co.nombre}</b><small>${co.canton || '—'} · ${co.personas_inscritas} persona${co.personas_inscritas === 1 ? '' : 's'} inscrita${co.personas_inscritas === 1 ? '' : 's'}</small></div>
          <span class="li-a" data-generar="${co.id}">Generar código nuevo</span>
        </div>
        ${codigos}
      </div>`;
  }).join('') || '<p class="sub2">Sin comunidades todavía.</p>';

  document.querySelectorAll('[data-revocar]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.textContent = 'Revocando…';
      const r = await revocarCodigo(el.dataset.revocar);
      if (r.ok) await cargarComunidades();
    });
  });
  document.querySelectorAll('[data-generar]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.textContent = 'Generando…';
      const r = await generarCodigo(el.dataset.generar);
      if (r.ok) await cargarComunidades();
      else el.textContent = 'Generar código nuevo';
    });
  });
}

async function cargarUsuarios() {
  const r = await obtenerUsuarios();
  if (r.ok) pintarUsuarios(r.data.usuarios);
}

async function cargarComunidades() {
  const r = await obtenerComunidades();
  if (!r.ok) return;
  pintarComunidades(r.data.comunidades);
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
  document.getElementById('cfg-mostrar-form-comunidad').addEventListener('click', () => { formC.style.display = 'block'; });
  document.getElementById('cfg-c-cancelar').addEventListener('click', () => { formC.style.display = 'none'; formC.reset(); });
  formC.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('cfg-c-error');
    error.style.display = 'none';
    const r = await crearComunidad({
      nombre: document.getElementById('cfg-c-nombre').value.trim(),
      tipo: document.getElementById('cfg-c-tipo').value,
      canton_id: document.getElementById('cfg-c-canton').value,
    });
    if (!r.ok) {
      error.textContent = r.error;
      error.style.display = 'block';
      return;
    }
    formC.style.display = 'none';
    formC.reset();
    await cargarComunidades();
  });
}

export async function montar(raiz) {
  const usuario = sesion.usuarioActual();
  if (usuario?.rol !== 'administrador') {
    raiz.innerHTML = `
      <div class="head"><div><h1>Configuración</h1></div></div>
      <div class="nota-demo"><b>Esta sección es solo para administradores.</b> Si necesita crear una cuenta nueva o un código de comunidad, pídaselo a alguien con ese rol.</div>`;
    return;
  }

  raiz.innerHTML = esqueleto();
  enlazarFormularios();
  await cargarUsuarios();
  await cargarComunidades();
}
