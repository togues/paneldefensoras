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

// Desde que las vistas con gráfica o mapa cargan Chart.js/Leaflet de
// forma diferida (core/cargador-librerias.js), su montar() queda "en
// vuelo" más tiempo que antes — si alguien navega a otra vista
// mientras tanto, esa espera termina igual y sigue intentando pintar
// en elementos que ya no existen (raiz.innerHTML los reemplazó), con
// un "Cannot set properties of null" en consola. Las vistas que
// cargan una librería así (resumen.js, analisis.js, mapa.js) importan
// esVistaActiva() y verifican, justo después de esperar, que siguen
// siendo la vista vigente antes de tocar el DOM. Encontrado con la
// propia prueba automatizada navegando más rápido de lo que un click
// humano normalmente lo haría, 2026-10-20.
let vistaActiva = null;
export function esVistaActiva(nombre) {
  return vistaActiva === nombre;
}

function pintarEnConstruccion(nombre) {
  raiz.innerHTML = `
    <div class="head"><div><h1>${NOMBRE_VISTA[nombre] || nombre}</h1></div></div>
    <div class="nota-demo"><b>Todavía no está conectada.</b> Se construye siguiendo el mismo orden que se acordó.</div>`;
}

async function montarVista(nombre) {
  vistaActiva = nombre;
  document.querySelectorAll('.lat a[data-v]').forEach((a) => {
    a.classList.toggle('on', a.dataset.v === nombre);
  });

  if (!VISTAS_LISTAS[nombre]) {
    pintarEnConstruccion(nombre);
    return;
  }
  if (!cargadas[nombre]) cargadas[nombre] = await VISTAS_LISTAS[nombre]();
  if (vistaActiva !== nombre) return; // se navegó a otra vista mientras se importaba esta
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
