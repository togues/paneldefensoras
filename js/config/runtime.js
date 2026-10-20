// Config pública de runtime del panel — mismo patrón que
// app/js/config/runtime.js. El panel es sí o sí en línea (Marco, al
// arrancar esto): no hay modo sin conexión que soportar acá, así que no
// hace falta la lógica de "isLocal" completa de la app comunitaria,
// solo el mismo default de apiBaseUrl same-origin para producción.
//
// La identificación de quién usa el panel ya NO va acá — eso es
// data/sesion.js (el token de PanelAuth.php, por persona). Acá solo
// queda appSecret, que identifica la aplicación, no a nadie.

const host = location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';

export const runtime = {
  apiBaseUrl: isLocal ? 'http://localhost:8080/api/v1' : location.origin + '/api/v1',
  appSecret: isLocal ? 'dev_secret_local' : ''
};

const override = window.__PANEL_RUNTIME_OVERRIDE__;
if (override && typeof override === 'object') {
  Object.assign(runtime, override);
}
