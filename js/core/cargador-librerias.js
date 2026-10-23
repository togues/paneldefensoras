/* =====================================================================
   Carga diferida de las librerías de terceros pesadas — Chart.js y
   Leaflet (+ Leaflet.markercluster) vivían como <script> normales en
   el <head> de index.html, cargando siempre, para las siete vistas
   del panel, aunque solo dos (Resumen y Análisis) necesitan Chart.js
   y solo dos (Mapa y la ubicación de una comunidad en Configuración)
   necesitan Leaflet.

   Un <script src> sin defer ni async BLOQUEA el parseo del HTML hasta
   que termina de bajar y ejecutarse — con cuatro de esos en fila
   (Chart.js, leaflet.css, leaflet.js, markercluster.js), medido con
   performance.getEntriesByType('resource') el 2026-10-20: entre 350 y
   480ms CADA UNO, siempre, para abrir hasta Casos o Configuración, que
   no usan ninguna de las dos. Encontrado después de que se reportó
   el panel "cargado" y con saltos visibles en conexiones lentas.

   Mismo criterio que ya aplica `main.js` para las vistas mismas
   (`import()` dinámico, una vez, con caché) — acá igual, pero para
   <script>/<link> de terceros en vez de módulos ES propios. */

const cargadas = {};

function cargarScript(src) {
  if (!cargadas[src]) {
    cargadas[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(el);
    });
  }
  return cargadas[src];
}

function cargarEstilo(href) {
  if (!cargadas[href]) {
    cargadas[href] = new Promise((resolve, reject) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('No se pudo cargar ' + href));
      document.head.appendChild(el);
    });
  }
  return cargadas[href];
}

export function cargarChartJs() {
  return cargarScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js');
}

export function cargarLeaflet() {
  return Promise.all([
    cargarEstilo('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'),
    cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'),
  ]);
}

// markercluster necesita que Leaflet (L) ya exista antes de cargarse.
export function cargarLeafletConClusters() {
  return cargarLeaflet().then(() => Promise.all([
    cargarEstilo('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css'),
    cargarEstilo('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css'),
    cargarScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'),
  ]));
}

// pdf-lib — arma el informe de seguimiento en el navegador
// (core/pdf-informe.js). ~520 KB: se baja solo cuando alguien genera un
// informe, nunca al abrir el panel.
export function cargarPdfLib() {
  return cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
}
