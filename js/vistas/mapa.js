/* =====================================================================
   Vista Mapa — puerto de la sección #v-mapa de
   diseno/tablero_completo.html a un mapa real.

   El mockup dibujaba un mapa decorativo (una imagen de fondo en SVG y
   puntos posicionados por porcentaje, sin coordenadas de verdad). Acá
   se cambió por Leaflet + Leaflet.markercluster (CDN, con el visto
   bueno de Marco), con coordenadas reales de GET /admin/mapa —
   siempre el CENTRO de la comunidad, nunca la coordenada exacta del
   reporte (regla 5 de CLAUDE.md; ver la nota larga en
   api/observatorio/admin/mapa.php). El agrupado (cluster) lo hace la
   librería de verdad en vez del cálculo a mano del mockup — y de paso
   resuelve que muchos reportes de una misma comunidad caen en el
   mismo punto exacto: un cluster real se puede "desarmar" (spiderfy)
   para verlos uno por uno, en vez de taparse entre sí.
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
      <div class="leyenda">
        <span><i class="pt" style="background:${COLOR_ESTADO.recibido}"></i> Sin revisar</span>
        <span><i class="pt" style="background:${COLOR_ESTADO.en_investigacion}"></i> En investigación</span>
        <span><i class="pt" style="background:${COLOR_ESTADO.cerrado}"></i> Cerrado</span>
        <span style="margin-left:auto;font-style:italic">Los puntos se ubican al centro de la comunidad, nunca en la coordenada exacta.</span>
      </div>
    </div>`;
}

function dibujarPuntos() {
  capaClusters.clearLayers();
  const filtrados = filtroActual === 'todos' ? puntosCargados : puntosCargados.filter((p) => p.familia === filtroActual);

  for (const p of filtrados) {
    const marcador = L.circleMarker([p.lat, p.lon], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: COLOR_ESTADO[p.estado] || '#6F7976',
      fillOpacity: 0.9
    });
    marcador.bindTooltip(`<b>${p.comunidad}</b><br>${p.folio} · ${ETIQ_ESTADO[p.estado] || p.estado}<br>${NOMBRE_FAMILIA[p.familia] || p.familia}`);
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
  filtroActual = 'todos';

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
