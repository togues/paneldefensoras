/* =====================================================================
   Vista Configuración — dos bloques independientes, en orden de uso:
     1. Códigos de registro (vistas/config-codigos.js): lo que se toca
        antes de cada capacitación o gira. No tienen nada que ver con
        ubicación ni comunidad (docs/decision-08-codigo-de-registro.md).
     2. Personal del panel.

   Ya no hay sección de Comunidades (migración 012): la comunidad no es
   una unidad territorial; el reporte guarda su departamento.

   Todo esto es rol administrador únicamente — ver
   lib/PanelAuth.php::obRequireRolAdministrador(). Un operador ve un
   aviso, no la pantalla vacía ni rota.
   ===================================================================== */
import { obtenerUsuarios, crearUsuario, actualizarUsuario } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { esVistaActiva } from '../main.js';
import { esqueletoCodigos, enlazarCodigos, cargarCodigos } from './config-codigos.js';

function formatoFecha(iso) {
  if (!iso) return 'nunca entró';
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esqueleto() {
  return `
    <div class="head"><div><h1>Configuración</h1><p>Códigos de registro y personal del panel</p></div></div>

    ${esqueletoCodigos()}

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

async function cargarUsuarios() {
  const r = await obtenerUsuarios();
  if (!esVistaActiva('config')) return; // se navegó a otra vista mientras tanto
  if (r.ok) pintarUsuarios(r.data.usuarios);
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
  await Promise.all([cargarCodigos(), cargarUsuarios()]);
}
