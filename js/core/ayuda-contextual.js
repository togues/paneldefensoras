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
    texto: 'Lo que necesita atención hoy: casos sin revisar, los que llevan más de una semana esperando, la prioridad alta pendiente y las alertas abiertas. Toque un indicador para ir a Casos ya filtrado, o una fila de la bandeja para trabajar ese caso. Para análisis con filtros (fechas, territorio, tipo de hecho), use Análisis.',
    lista: ['La bandeja ordena primero la prioridad alta, después lo que más lleva esperando.', 'Una espera de más de 7 días se marca en rojo.']
  },
  mapa: {
    overline: 'Ayuda · Mapa',
    titulo: '¿Por qué varios puntos caen en el mismo lugar?',
    texto: 'En general, cada punto se ubica en el centro de la comunidad, no en el lugar exacto del hecho — en un caserío pequeño, una coordenada exacta puede señalar una vivienda. Solo el rol administrador ve además el punto exacto cuando la persona lo marcó (borde oscuro); el resto sigue viendo el centro de la comunidad. Varios reportes cercanos se agrupan en un círculo oscuro con el número: tóquelo para acercarse y verlos uno por uno.',
    lista: [
      'Arriba filtre por tipo de hecho (puede marcar varios), por hecho puntual, departamento o estado.',
      'Abajo, la línea de tiempo: arrastre los extremos, toque una barra para ver solo ese periodo, o dele play para ver los casos aparecer en el orden en que llegaron.',
      'Toque un punto para ver su ficha, copiar la coordenada o abrir el caso.',
      'La regla, debajo del zoom, mide distancias: toque punto por punto y doble clic (o Enter) para terminar; Esc la borra.',
      'El botón de capas, arriba a la derecha, cambia el fondo: claro, calles o satélite.'
    ]
  },
  galeria: {
    overline: 'Ayuda · Galería',
    titulo: '¿Para qué sirve la galería?',
    texto: 'Recorre la evidencia fotográfica de todos los casos, de la más reciente a la más vieja — al revés que en Casos: acá se parte de la foto. Toque cualquier foto para abrir la ficha completa del caso al que pertenece. Solo la ve un administrador, y nunca sale del panel: ni al muro público ni a ninguna exportación.',
    lista: ['Filtre por tipo de hecho, departamento o comunidad.', 'Las fotos se cargan a medida que baja, en versión liviana; la completa se ve al ampliarla desde la ficha.']
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
    lista: ['Descartar exige una nota: es el motivo por el que alguien más, después, va a entender por qué se cerró así.', 'Publicar parte del relato: corrija la ortografía y quite todo lo que identifique a alguien. El relato original no cambia.']
  },
  'casos-exportar': {
    overline: 'Ayuda · Exportar',
    titulo: '¿Qué se descarga exactamente?',
    texto: 'Los dos botones respetan los filtros que tenga puestos en ese momento y traen todos los casos que califican, no solo los que ve en pantalla.',
    lista: ['CSV: abre directo en Excel, con tildes y ñ correctas.', 'PDF: un informe ya diagramado, con espacio de firma — se genera con "Guardar como PDF" del navegador.']
  },
  analisis: {
    overline: 'Ayuda · Análisis',
    titulo: '¿Cómo uso los filtros del tablero?',
    texto: 'Cada filtro de arriba refresca todo el tablero de una vez. También puede filtrar tocando un gráfico: una barra de departamento, una porción de la dona, un tipo de hecho, un estado — y tocar lo mismo otra vez lo quita. "Ver estos casos" abre Casos con exactamente los mismos filtros.',
    lista: ['Al elegir un departamento, la lista de comunidades se reduce a las de ese departamento; lo mismo pasa con familia y tipo de hecho.', 'El total se compara con un período de la misma duración, justo antes del elegido.', 'Los tiempos de atención son medianas: un caso olvidado no distorsiona el número de todos los demás.', 'Participación (abajo) no responde a los filtros, a propósito: achicar el universo podría identificar a alguien.']
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
  'config-codigos': {
    overline: 'Ayuda · Códigos de registro',
    titulo: '¿Para qué sirve un código de registro?',
    texto: 'Es la palabra que una persona escribe una sola vez, al instalar la aplicación, para poder registrarse. Sirve para controlar quién entra: se reparte en una capacitación o una gira y vale solo entre las fechas que usted elija. No tiene nada que ver con el lugar: cada reporte dice dónde ocurrió.',
    lista: ['Para una gira con dos equipos en lugares distintos, cree un código para cada equipo.', 'Un código que ya se creó, aunque esté vencido o revocado, no se puede volver a crear: así nadie entra con un código viejo.', 'Dar de baja un código no afecta a quien ya se registró con él.']
  },
  respaldos: {
    overline: 'Ayuda · Respaldos',
    titulo: '¿Qué es exactamente un respaldo?',
    texto: 'Una copia cifrada de toda la base de datos del observatorio, para que la información nunca dependa de una sola copia en un solo servidor. Se descifra solo con la clave que guarda el equipo — sin ella, el archivo no sirve de nada, ni para quien lo robe ni para quien lo pierda.',
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
