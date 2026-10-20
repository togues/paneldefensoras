/* =====================================================================
   Arranque del panel. Antes de mostrar cualquier vista, exige sesión
   real (data/sesion.js, lib/PanelAuth.php del API) — reemplaza a la
   llave fija de desarrollo con la que arrancó esto.

   Un solo shell (barra lateral + contenido), igual que
   diseno/tablero_completo.html, con carga diferida por vista.
   ===================================================================== */
import { log } from './core/logger.js';
import { cerrarSesion } from './data/api-client.js';
import * as sesion from './data/sesion.js';
import { montar as montarLogin } from './pantalla-login.js';

const VISTAS_LISTAS = {
  resumen: () => import('./vistas/resumen.js'),
  mapa: () => import('./vistas/mapa.js'),
  casos: () => import('./vistas/casos.js'),
  analisis: () => import('./vistas/analisis.js'),
  salud: () => import('./vistas/salud.js'),
  config: () => import('./vistas/config.js'),
  respaldos: () => import('./vistas/respaldos.js')
};
const NOMBRE_VISTA = {};

const raiz = document.getElementById('contenido');
const pantallaLogin = document.getElementById('pantalla-login');
const appShell = document.getElementById('app-shell');
const cargadas = {};
let navEnlazada = false;

function pintarEnConstruccion(nombre) {
  raiz.innerHTML = `
    <div class="head"><div><h1>${NOMBRE_VISTA[nombre] || nombre}</h1></div></div>
    <div class="nota-demo"><b>Todavía no está conectada.</b> Se construye siguiendo el mismo orden que se acordó.</div>`;
}

async function montarVista(nombre) {
  document.querySelectorAll('.lat a[data-v]').forEach((a) => {
    a.classList.toggle('on', a.dataset.v === nombre);
  });

  if (!VISTAS_LISTAS[nombre]) {
    pintarEnConstruccion(nombre);
    return;
  }
  if (!cargadas[nombre]) cargadas[nombre] = await VISTAS_LISTAS[nombre]();
  await cargadas[nombre].montar(raiz);
}

function pintarUsuarioPie() {
  const usuario = sesion.usuarioActual();
  document.getElementById('usuario-pie').innerHTML = `
    <b>${usuario?.nombre || 'Sesión activa'}</b>
    ${usuario?.rol ? `${usuario.rol} · ` : ''}<a id="cerrar-sesion"><svg class="i"><use href="#i-salir"/></svg>Cerrar sesión</a>`;
  document.getElementById('cerrar-sesion').addEventListener('click', async () => {
    await cerrarSesion();
    sesion.borrar();
    mostrarLogin();
  });
}

function enlazarNav() {
  if (navEnlazada) return;
  navEnlazada = true;
  document.querySelectorAll('.lat a[data-v]').forEach((a) => {
    a.addEventListener('click', () => {
      montarVista(a.dataset.v);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function mostrarShell() {
  pantallaLogin.hidden = true;
  pantallaLogin.innerHTML = '';
  appShell.hidden = false;
  enlazarNav();
  pintarUsuarioPie();
  montarVista('resumen');
}

function mostrarLogin() {
  appShell.hidden = true;
  pantallaLogin.hidden = false;
  montarLogin(pantallaLogin, mostrarShell);
}

// Si cualquier petición al API devuelve que la sesión venció o no
// sirve más, se vuelve a pedir login en vez de dejar la pantalla
// mostrando errores sueltos en cada vista.
window.addEventListener('panel:sesion-invalida', () => {
  sesion.borrar();
  mostrarLogin();
});

log('panel: arranque');
if (sesion.haySesion()) {
  mostrarShell();
} else {
  mostrarLogin();
}
