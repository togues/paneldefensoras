/* =====================================================================
   Vista Mapa — puerto de la sección #v-mapa de
   diseno/tablero_completo.html a un mapa real.

   El mockup dibujaba un mapa decorativo (una imagen de fondo en SVG y
   puntos posicionados por porcentaje, sin coordenadas de verdad). Acá
   se cambió por Leaflet + Leaflet.markercluster (CDN, con el visto
   bueno de Marco), con coordenadas reales de GET /admin/mapa.

   Lo que devuelve ese endpoint depende del rol (regla 5 de CLAUDE.md,
   decisión 06 — ver docs/decision-06-coordenadas-exactas-mapa-admin.md
   y la nota larga en api/admin/mapa.php): para administrador, el
   punto exacto del reporte cuando existe (`es_exacto: true`), con el
   centro de la comunidad como respaldo; para cualquier otro rol,
   siempre el centro de la comunidad, nunca el punto exacto — el
   comportamiento original, sin cambios. `puedeVerExacto` (del campo
   `puede_ver_exacto` de la respuesta) controla la leyenda y el
   tooltip de cada punto, no decide nada de permisos: eso ya lo
   resolvió el servidor antes de responder.

   El agrupado (cluster) lo hace la librería de verdad en vez del
   cálculo a mano del mockup — y de paso resuelve que muchos reportes
   de una misma comunidad caen en el mismo punto (más todavía ahora
   que varios reportes sin punto propio comparten el centro de su
   comunidad): un cluster real se puede "desarmar" (spiderfy) para
   verlos uno por uno, en vez de taparse entre sí.
   ===================================================================== */
import { obtenerMapa } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';

const COLOR_ESTADO = { recibido: '#A32B1E', en_investigacion: '#B0620A', cerrado: '#2D6A4F', descartado: '#6F7976' };
const ETIQ_ESTADO = { recibido: 'Sin revisar', en_investigacion: 'En investigación', cerrado: 'Cerrado', descartado: 'Descartado' };
const NOMBRE_FAMILIA = { persona: 'Contra personas', territorio: 'Agua, tierra y medios de vida', gestion: 'Gestión', logro: 'Logro' };

let mapa = null;
let capaClusters = null;
let puntosCargados = [];
let filtroActual = 'todos';
let puedeVerExacto = false;

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Mapa de incidencias ${botonAyuda('mapa')}</h1><p id="m-resumen"></p></div>
    </div>
    <div class="filtros">
      <div class="filtro act" data-f="todos">Todos los hechos</div>
      <div class="filtro" data-f="persona">Contra personas</div>
      <div class="filtro" data-f="territorio">Agua y tierra</div>
    </div>
    <div class="caja">
      <div id="r-mapa"></div>
      <div class="leyenda" id="m-leyenda">
        <span><i class="pt" style="background:${COLOR_ESTADO.recibido}"></i> Sin revisar</span>
        <span><i class="pt" style="background:${COLOR_ESTADO.en_investigacion}"></i> En investigación</span>
        <span><i class="pt" style="background:${COLOR_ESTADO.cerrado}"></i> Cerrado</span>
      </div>
    </div>`;
}

// El texto y, para administrador, una segunda fila de leyenda que
// distingue un punto exacto de un centro de comunidad — mostrar los
// dos idénticos sería engañoso: uno es dónde ocurrió el hecho, el
// otro es "en algún lugar de esta comunidad". Ver
// docs/decision-06-coordenadas-exactas-mapa-admin.md.
function actualizarLeyenda() {
  const leyenda = document.getElementById('m-leyenda');
  if (puedeVerExacto) {
    leyenda.insertAdjacentHTML('beforeend', `
      <span style="margin-left:auto;display:flex;gap:14px;align-items:center">
        <span><i class="pt" style="background:#171D1B;border:2px solid #fff;box-shadow:0 0 0 2px #171D1B"></i> Punto exacto del reporte</span>
        <span><i class="pt" style="background:#171D1B;opacity:.45"></i> Centro de la comunidad (sin punto marcado)</span>
      </span>`);
  } else {
    leyenda.insertAdjacentHTML('beforeend', '<span style="margin-left:auto;font-style:italic">Los puntos se ubican al centro de la comunidad, nunca en la coordenada exacta.</span>');
  }
}

function dibujarPuntos() {
  capaClusters.clearLayers();
  const filtrados = filtroActual === 'todos' ? puntosCargados : puntosCargados.filter((p) => p.familia === filtroActual);

  for (const p of filtrados) {
    // Mismo color por estado en los dos casos — lo que cambia es el
    // borde, para que un punto exacto se distinga de un centro de
    // comunidad sin confundirse con el estado del caso.
    const marcador = L.circleMarker([p.lat, p.lon], {
      radius: p.es_exacto ? 9 : 7,
      color: p.es_exacto ? '#171D1B' : '#fff',
      weight: p.es_exacto ? 3 : 2,
      fillColor: COLOR_ESTADO[p.estado] || '#6F7976',
      fillOpacity: p.es_exacto ? 1 : 0.75
    });
    const etiquetaOrigen = puedeVerExacto ? (p.es_exacto ? '<br><i>Punto exacto</i>' : '<br><i>Centro de la comunidad</i>') : '';
    marcador.bindTooltip(`<b>${p.comunidad}</b><br>${p.folio} · ${ETIQ_ESTADO[p.estado] || p.estado}<br>${NOMBRE_FAMILIA[p.familia] || p.familia}${etiquetaOrigen}`);
    capaClusters.addLayer(marcador);
  }

  if (filtrados.length) {
    const grupo = L.featureGroup(capaClusters.getLayers());
    mapa.fitBounds(grupo.getBounds().pad(0.3), { maxZoom: 12 });
  }
}

function enlazarFiltros() {
  document.querySelectorAll('.filtro[data-f]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.filtro[data-f]').forEach((f) => f.classList.remove('act'));
      el.classList.add('act');
      filtroActual = el.dataset.f;
      dibujarPuntos();
    });
  });
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  raiz.insertAdjacentHTML('beforeend', '<p class="cargando" id="m-cargando">Cargando reportes georreferenciados…</p>');

  const r = await obtenerMapa();
  const cargando = document.getElementById('m-cargando');
  if (cargando) cargando.remove();

  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar el mapa: ${r.error} (${r.code}).</p>`);
    return;
  }

  puntosCargados = r.data.puntos;
  puedeVerExacto = !!r.data.puede_ver_exacto;
  filtroActual = 'todos';
  actualizarLeyenda();

  const resumen = document.getElementById('m-resumen');
  // No es "sin comunidad asignada" (eso es otra cosa, y casi nunca
  // pasa) — es que su comunidad SÍ está asignada pero todavía no
  // tiene un punto de referencia guardado (ver admin/comunidades.php,
  // el formulario de Configuración). Decía mal esto hasta que Marco
  // lo notó al ver el mapa vacío en producción, 2026-10-20.
  resumen.textContent = `${puntosCargados.length} reportes georreferenciados` +
    (r.data.sin_ubicacion ? ` · ${r.data.sin_ubicacion} con comunidad sin ubicación guardada` : '');

  // El contenedor recién quedó en el DOM: Leaflet necesita medir su
  // tamaño real, no puede iniciarse antes de que exista.
  //
  // scrollWheelZoom queda ENCENDIDO a propósito: apagarlo tiene sentido
  // en un mapa chico incrustado dentro de una página que se desplaza
  // (para que la rueda del mouse no "atrape" el scroll sin querer),
  // pero acá el mapa ES la pantalla completa del panel de escritorio —
  // esa razón no aplica y apagarlo solo estorba (Marco, al probarlo).
  mapa = L.map('r-mapa').setView([13.7, -88.9], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(mapa);

  capaClusters = L.markerClusterGroup({ maxClusterRadius: 50 });
  mapa.addLayer(capaClusters);

  enlazarFiltros();
  dibujarPuntos();

  if (!puntosCargados.length) {
    mapa.setView([13.7, -88.9], 8);
  }
}
