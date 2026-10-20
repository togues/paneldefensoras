/* Plantilla para runtime.local.js — mismo patrón que
   app/js/config/runtime.local.example.js. En el servidor:

     cp js/config/runtime.local.example.js js/config/runtime.local.js
     # editar appSecret (= API_SECRET del .env del API)

   runtime.local.js NO se versiona y se sube por FTP junto con el resto
   de panel/. Cargado como <script> clásico, antes que el módulo
   main.js — ver index.html.

   No hay una llave de "admin" que pegar acá: quién entra al panel se
   resuelve con correo y clave contra la tabla `usuario`
   (data/sesion.js, lib/PanelAuth.php del API), no con un valor fijo en
   este archivo. */
window.__PANEL_RUNTIME_OVERRIDE__ = {
  appSecret: 'PEGAR_AQUI_EL_MISMO_API_SECRET_DEL_ENV'
};
