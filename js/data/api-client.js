/* Cliente del API del panel — versión reducida del de la app comunitaria
   (app/js/data/api-client.js): mismo patrón de fetch con timeout y de
   envoltura {success, data}/{success:false, error, code}, sin nada de
   cola ni reintentos offline, porque el panel no los necesita (sí o sí
   en línea). */
import { runtime } from '../config/runtime.js';
import * as sesion from './sesion.js';

function buildUrl(path) {
  return runtime.apiBaseUrl.replace(/\/$/, '') + path;
}

function buildHeaders(extra) {
  const headers = { Accept: 'application/json', ...extra };
  if (runtime.appSecret) headers['X-App-Secret'] = runtime.appSecret;
  const token = sesion.token();
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function pedir(path, { method = 'GET', body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opciones = { method, headers: buildHeaders(body ? { 'Content-Type': 'application/json' } : {}), signal: controller.signal };
    if (body !== undefined) opciones.body = JSON.stringify(body);

    const respuesta = await fetch(buildUrl(path), opciones);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!cuerpo) return { ok: false, status: respuesta.status, code: 'RESPUESTA_INVALIDA', error: 'Respuesta inválida del servidor' };

    if (!respuesta.ok || cuerpo.success !== true) {
      // La sesión ya no sirve (venció por inactividad, o se cerró desde
      // otra pestaña): avisarle al shell para que vuelva a pedir login
      // en vez de dejar la pantalla mostrando errores sueltos.
      if (respuesta.status === 401 && (cuerpo.code === 'SESION_REQUERIDA' || cuerpo.code === 'SESION_INVALIDA')) {
        window.dispatchEvent(new CustomEvent('panel:sesion-invalida'));
      }
      return { ok: false, status: respuesta.status, code: cuerpo.code || 'ERROR', error: cuerpo.error || 'Error del servidor' };
    }
    return { ok: true, status: respuesta.status, data: cuerpo.data };
  } catch (e) {
    const code = e.name === 'AbortError' ? 'TIEMPO_AGOTADO' : 'SIN_CONEXION';
    return { ok: false, status: 0, code, error: 'No se pudo conectar con el servidor' };
  } finally {
    clearTimeout(timer);
  }
}

export function iniciarSesion(correo, clave) {
  return pedir('/auth/login', { method: 'POST', body: { correo, clave } });
}

export function cerrarSesion() {
  return pedir('/auth/logout', { method: 'POST' });
}

export function obtenerEstadisticas() {
  return pedir('/admin/estadisticas');
}

export function obtenerMapa() {
  return pedir('/admin/mapa');
}

export function obtenerCasos(filtros = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== '' && v !== null && v !== undefined) params.set(k, v);
  }
  const qs = params.toString();
  return pedir('/admin/casos' + (qs ? '?' + qs : ''));
}

export function obtenerCaso(id) {
  return pedir('/admin/casos/' + encodeURIComponent(id));
}

export function actualizarCaso(id, cambios) {
  return pedir('/admin/casos/' + encodeURIComponent(id), { method: 'PATCH', body: cambios });
}

export function publicarCaso(id, resumenPublico) {
  return pedir('/admin/casos/' + encodeURIComponent(id) + '/publicar', { method: 'POST', body: { resumen_publico: resumenPublico } });
}

// Reutiliza /catalogos (el mismo endpoint de la app comunitaria) para
// llenar el filtro de comunidad — no hace falta un endpoint nuevo solo
// para eso, y así el panel nunca inventa su propia lista.
export function obtenerCatalogos() {
  return pedir('/catalogos');
}

export function obtenerAnalisis() {
  return pedir('/admin/analisis');
}

export function obtenerSalud() {
  return pedir('/admin/salud');
}

export function marcarAnomaliaRevisada(id) {
  return pedir('/admin/anomalias/' + encodeURIComponent(id), { method: 'PATCH' });
}

export function obtenerParticipacion() {
  return pedir('/admin/participacion');
}

export function obtenerUsuarios() {
  return pedir('/admin/usuarios');
}

export function crearUsuario(datos) {
  return pedir('/admin/usuarios', { method: 'POST', body: datos });
}

export function actualizarUsuario(id, cambios) {
  return pedir('/admin/usuarios/' + encodeURIComponent(id), { method: 'PATCH', body: cambios });
}

export function obtenerComunidades() {
  return pedir('/admin/comunidades');
}

export function crearComunidad(datos) {
  return pedir('/admin/comunidades', { method: 'POST', body: datos });
}

export function actualizarComunidad(id, cambios) {
  return pedir('/admin/comunidades/' + encodeURIComponent(id), { method: 'PATCH', body: cambios });
}

export function generarCodigo(comunidadId) {
  return pedir('/admin/comunidades/' + encodeURIComponent(comunidadId) + '/codigos', { method: 'POST' });
}

export function revocarCodigo(id) {
  return pedir('/admin/codigos/' + encodeURIComponent(id), { method: 'PATCH' });
}

// Fija o extiende la ventana de vigencia de un código — nunca junto
// con revocar (ver la nota larga en admin/codigos.php).
export function actualizarVigenciaCodigo(id, cambios) {
  return pedir('/admin/codigos/' + encodeURIComponent(id), { method: 'PATCH', body: cambios });
}

export function obtenerRespaldos() {
  return pedir('/admin/respaldos');
}

export function generarRespaldo() {
  return pedir('/admin/respaldos', { method: 'POST' });
}

export function actualizarConfiguracionRespaldos(cambios) {
  return pedir('/admin/respaldos/configuracion', { method: 'PATCH', body: cambios });
}

/**
 * Descarga un respaldo. No es un <a href> normal: la descarga necesita
 * el header Authorization, que un enlace no puede mandar — mismo
 * motivo y mismo patrón que obtenerEvidenciaUrl(), pero acá el blob se
 * entrega de una vez con <a download> en vez de mostrarse en un <img>.
 */
export async function descargarRespaldo(id, nombreArchivo) {
  try {
    const respuesta = await fetch(buildUrl('/admin/respaldos/' + encodeURIComponent(id) + '/descargar'), { headers: buildHeaders() });
    if (!respuesta.ok) {
      if (respuesta.status === 401) window.dispatchEvent(new CustomEvent('panel:sesion-invalida'));
      return { ok: false };
    }
    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Trae una fotografía de evidencia como blob y devuelve una URL de
 * objeto lista para <img src>. No usa pedir(): la respuesta es la
 * imagen en sí, no {success, data}, y un <img> no puede mandar el
 * header Authorization por su cuenta — por eso se pide con fetch()
 * aparte y se arma la URL acá, autenticada, en vez de exponer un
 * enlace directo al archivo.
 */
/**
 * Borra una fotografía de evidencia — permanente, sin papelera (ver el
 * comentario largo en admin/evidencia.php). A diferencia de
 * obtenerEvidenciaUrl(), acá sí pasa por pedir(): la respuesta es
 * {success, data}, no el archivo en sí.
 */
export function eliminarEvidencia(id) {
  return pedir('/admin/evidencias/' + encodeURIComponent(id), { method: 'DELETE' });
}

export async function obtenerEvidenciaUrl(id) {
  try {
    const respuesta = await fetch(buildUrl('/admin/evidencias/' + encodeURIComponent(id)), { headers: buildHeaders() });
    if (!respuesta.ok) {
      if (respuesta.status === 401) window.dispatchEvent(new CustomEvent('panel:sesion-invalida'));
      return { ok: false };
    }
    const blob = await respuesta.blob();
    return { ok: true, url: URL.createObjectURL(blob) };
  } catch {
    return { ok: false };
  }
}
