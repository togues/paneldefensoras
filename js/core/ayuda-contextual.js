/* =====================================================================
   Ayuda contextual del panel: un botón "?" junto a cada pantalla o
   acción puntual (mapa, filtros, exportar, publicar/descartar,
   cuentas, comunidades...), que abre una tarjeta pequeña y animada con
   una overline + una explicación breve — en el lugar donde hace falta,
   no en un manual aparte.

   Mismo espíritu que app/js/features/reportar/ayuda-contextual.js
   ("¿cuál elijo?"), pero adaptado a un panel de escritorio: acá cabe
   una tarjeta central pequeña en vez de una pantalla completa nueva
   (`fullscreen-overlay.js` de la app), y el contenido es fijo —no sale
   del catálogo— porque explica la herramienta, no una categoría de
   reporte.

   Uso: import { boton } from '.../ayuda-contextual.js'; y
   `${boton('mapa')}` en cualquier plantilla. El clic se captura por
   delegación en <body>, registrada una sola vez al cargar el módulo
   —ninguna vista necesita enlazarla a mano.
   ===================================================================== */

const CONTENIDOS = {
  login: {
    overline: 'Ayuda · Ingreso',
    titulo: '¿Cómo entro al panel?',
    texto: 'El acceso es con una cuenta real, dada de alta por quien administra el panel — no hay registro abierto para cualquiera. Si todavía no tiene cuenta, pídale a un administrador que le cree una desde Configuración → Personal del panel.'
  },
  resumen: {
    overline: 'Ayuda · Resumen',
    titulo: '¿Qué estoy viendo acá?',
    texto: 'Un vistazo rápido del estado del observatorio: cuántos casos esperan revisión, cómo viene el mes, y qué necesita atención ya (alertas activas, casos recientes). Para trabajar un caso en concreto, use Casos.'
  },
  mapa: {
    overline: 'Ayuda · Mapa',
    titulo: '¿Por qué varios puntos caen en el mismo lugar?',
    texto: 'Cada punto se ubica en el centro de la comunidad, nunca en el lugar exacto del hecho — es a propósito: en un caserío pequeño, una coordenada exacta puede señalar una vivienda. Por eso varios reportes de la misma comunidad se agrupan (racimo); tóquelo para desarmarlo y ver uno por uno.',
    lista: ['Filtre por familia con los chips de arriba del mapa.', 'La rueda del mouse hace zoom directo, sin pasar por los controles.']
  },
  'casos-filtros': {
    overline: 'Ayuda · Buscar y filtrar',
    titulo: '¿Cómo combino varios filtros?',
    texto: 'Todos los filtros trabajan juntos, no uno a la vez: puede buscar por folio o texto, y al mismo tiempo limitar por comunidad, prioridad, estado y un rango de fechas. El buscador también encuentra por comunidad o por palabras del relato.'
  },
  'casos-detalle': {
    overline: 'Ayuda · Gestionar un caso',
    titulo: '¿Qué hago al abrir un caso?',
    texto: 'Vea el relato y la evidencia tal como se enviaron — el relato original nunca se edita, ni acá ni en ningún lado. Cambie el estado según en qué va el caso, y agregue una nota si hace falta dejar constancia de una decisión.',
    lista: ['Descartar exige una nota: es el motivo por el que alguien más, después, va a entender por qué se cerró así.', 'Publicar reescribe un resumen para el muro público — nunca puede quedar igual al relato original.']
  },
  'casos-exportar': {
    overline: 'Ayuda · Exportar',
    titulo: '¿Qué se descarga exactamente?',
    texto: 'Los dos botones respetan los filtros que tenga puestos en ese momento y traen todos los casos que califican, no solo los que ve en pantalla.',
    lista: ['CSV: abre directo en Excel, con tildes y ñ correctas.', 'PDF: un informe ya diagramado, con espacio de firma — se genera con "Guardar como PDF" del navegador.']
  },
  analisis: {
    overline: 'Ayuda · Análisis',
    titulo: '¿Qué tan definitivos son estos indicadores?',
    texto: 'Son indicadores de uso que la plataforma genera por sí sola (cuántos reportes, de qué tipo, en qué territorio). Los indicadores sociales del observatorio todavía no están definidos con REDNA — cuando se definan, se agregan acá.'
  },
  salud: {
    overline: 'Ayuda · Salud de datos',
    titulo: '¿Por qué algunos datos dicen "sin construir"?',
    texto: 'Esta pantalla es honesta a propósito: solo muestra lo que hoy se puede medir de verdad. Lo que todavía no tiene una pieza real detrás (por ejemplo, el último respaldo) lo dice así en vez de inventar un número.'
  },
  participacion: {
    overline: 'Ayuda · Participación',
    titulo: '¿Por qué no veo todos los grupos?',
    texto: 'Por protección: sexo y estructura organizativa nunca se muestran para un grupo de menos de cinco personas, porque en una comunidad pequeña esa combinación puede identificar a alguien. Si un departamento no llega a cinco en ningún grupo, esta pantalla lo avisa en vez de mostrar una tabla vacía.'
  },
  'config-usuarios': {
    overline: 'Ayuda · Personal del panel',
    titulo: '¿Cómo agrego a alguien de la ONG?',
    texto: 'Cree la cuenta con su nombre, correo y una clave temporal — la persona puede pedir que se la cambien después. El rol "operador" no puede publicar al muro ni administrar cuentas o comunidades; "administrador" sí.',
    lista: ['Nunca se borra una cuenta, solo se desactiva: así la bitácora de quién hizo qué se mantiene intacta.', 'Desactivar cierra de inmediato cualquier sesión abierta de esa persona.']
  },
  'config-comunidades': {
    overline: 'Ayuda · Comunidades y códigos',
    titulo: '¿Para qué sirve un código de comunidad?',
    texto: 'Es lo que alguien de esa comunidad escribe una sola vez, al instalar la aplicación, para entrar al sistema correcto — se reparte en las capacitaciones. Dar de alta una comunidad genera su primer código automáticamente.',
    lista: ['Puede generar códigos adicionales para la misma comunidad cuando haga falta repartir más.', 'Revocar un código no afecta a quien ya se inscribió con él antes — solo impide usarlo para entrar de nuevo.']
  },
  respaldos: {
    overline: 'Ayuda · Respaldos',
    titulo: '¿Qué es exactamente un respaldo?',
    texto: 'Una copia cifrada de toda la base de datos del observatorio, para que la información nunca dependa de una sola copia en un solo servidor. Se descifra solo con la clave que guarda REDNA — sin ella, el archivo no sirve de nada, ni para quien lo robe ni para quien lo pierda.',
    lista: ['"Automático" revisa cada vez que alguien abre esta pantalla si ya pasó una semana desde el último — no es un reloj corriendo en segundo plano.', 'Cada descarga queda anotada en la bitácora: un respaldo descargado sale de la plataforma y queda en un equipo que ya nadie controla ahí.', 'Solo administrador — descargar la base completa, aunque esté cifrada, no es una acción de todos los días.']
  }
};

let raizAyuda;

function pintar(clave) {
  const c = CONTENIDOS[clave];
  if (!c) return;
  raizAyuda.querySelector('#ayuda-tarjeta').innerHTML = `
    <button type="button" class="cerrar" data-ayuda-cerrar aria-label="Cerrar ayuda"><svg class="i"><use href="#i-cerrar"/></svg></button>
    <span class="ayuda-overline">${c.overline}</span>
    <h3>${c.titulo}</h3>
    <p>${c.texto}</p>
    ${c.lista ? `<ul>${c.lista.map((li) => `<li>${li}</li>`).join('')}</ul>` : ''}`;
}

function crearOverlay() {
  const div = document.createElement('div');
  div.id = 'ayuda-overlay';
  div.innerHTML = '<div id="ayuda-tarjeta"></div>';
  document.body.appendChild(div);
  return div;
}

function cerrar() {
  if (raizAyuda) raizAyuda.classList.remove('on');
}

export function boton(clave, titulo = 'Ayuda') {
  return `<button type="button" class="ayuda-boton" data-ayuda="${clave}" title="${titulo}" aria-label="${titulo}"><svg class="i"><use href="#i-ayuda"/></svg></button>`;
}

export function abrir(clave) {
  if (!raizAyuda) raizAyuda = crearOverlay();
  pintar(clave);
  raizAyuda.classList.add('on');
}

// Delegación única en document, registrada al importar el módulo por
// primera vez — así ninguna vista tiene que enlazar nada a mano. En
// fase de CAPTURA a propósito: el panel de Gestión de un caso
// (casos.js, #detalle) llama e.stopPropagation() en todo clic dentro
// suyo para que no le cierre el overlay del caso de fondo, y eso
// también se llevaba por delante un listener en fase de burbuja
// puesto en document. En captura, este handler corre de camino HACIA
// el botón, antes de que exista ese stopPropagation — no le afecta.
document.addEventListener('click', (e) => {
  const abrirBoton = e.target.closest('[data-ayuda]');
  if (abrirBoton) { abrir(abrirBoton.dataset.ayuda); return; }
  if (e.target.closest('[data-ayuda-cerrar]')) { cerrar(); return; }
  if (raizAyuda && e.target === raizAyuda) cerrar();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrar();
});
