/* =====================================================================
   Sesión de panel — guarda el token de PanelAuth.php y los datos del
   usuario en localStorage (a diferencia de app/, acá SÍ tiene sentido:
   esto es una herramienta interna del equipo, no el dispositivo
   anónimo de quien reporta, y conviene que el personal no tenga que
   volver a entrar cada vez que cierra el navegador — la sesión igual
   "caduca por inactividad" del lado del servidor, api_v1.md sección 2).
   ===================================================================== */
const LLAVE = 'panel_sesion';

function leer() {
  try {
    const crudo = localStorage.getItem(LLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

export function guardar(token, usuario) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify({ token, usuario }));
  } catch {
    /* modo privado o almacenamiento lleno: la sesión no persiste entre recargas, pero sigue funcionando en esta pestaña */
  }
}

export function borrar() {
  try {
    localStorage.removeItem(LLAVE);
  } catch {
    /* da igual */
  }
}

export function token() {
  return leer()?.token || null;
}

export function usuarioActual() {
  return leer()?.usuario || null;
}

export function haySesion() {
  return !!token();
}
