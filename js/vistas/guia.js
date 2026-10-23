/* =====================================================================
   Vista "Cómo funciona" — las reglas de negocio del observatorio en
   lenguaje llano, para que el personal las consulte desde el
   panel. Pedido del 21 de octubre de 2026.

   Cada regla se verificó contra el código ese día (no contra lo que
   decían los documentos). Si una regla cambia en el código, se cambia
   aquí en el mismo commit: esta página no puede prometer algo que el
   sistema no hace. Cualquier rol con sesión la ve.
   ===================================================================== */

const REVISADO = '21 de octubre de 2026';

// Ciclo de vida de un reporte, de la cuenta al muro. Cada etapa usa un
// color del muro público; entre etapas van los controles que hay que
// pasar. Verificado contra el código el 21 de octubre de 2026.
const ETAPAS = [
  {
    color: 'naranja', icono: 'persona', quien: 'La persona, en la app',
    titulo: '1. Crea su cuenta',
    pasos: [
      'Escribe el código de registro que le dio el equipo (por ejemplo, CEIBA).',
      'Elige un alias de una lista. No escribe su nombre: no hay dónde guardarlo.',
      'Si quiere, dice su sexo, su departamento y su organización. Solo sirven para contar participación en grupos de 5 o más.',
      'Recibe su código de recuperación. Es lo único que recupera la cuenta.',
    ],
  },
  {
    control: 'Para entrar',
    reglas: ['El código de registro tiene que estar vigente', 'Hasta 100 registros por hora desde una misma conexión, para que alcance en un taller'],
  },
  {
    color: 'azul', icono: 'telefono', quien: 'La persona, en la app',
    titulo: '2. Reporta un hecho',
    pasos: [
      'Elige la categoría y el tipo de hecho.',
      '¿Dónde fue?: el departamento, y si quiere un punto en el mapa y una seña del lugar.',
      'Cuándo ocurrió y qué pasó, escrito o dictado. No se graba la voz.',
      'Hasta 5 fotos. El teléfono les borra los datos ocultos (modelo, fecha, GPS).',
      'Todo queda cifrado en el teléfono. Sin señal, espera y se envía solo cuando vuelve.',
    ],
  },
  {
    control: 'Antes de enviar',
    reglas: ['Filtro de la app: con partidos, figuras políticas o pandillas no deja enviar', 'Con "gobierno" o "alcalde" solo avisa'],
  },
  {
    color: 'negro', icono: 'servidor', quien: 'El servidor, solo',
    titulo: '3. Llega al observatorio',
    pasos: [
      'Comprueba que viene de la app y de un teléfono registrado.',
      'Si el teléfono lo envía dos veces, se guarda una sola.',
      'Vuelve a revisar las fotos y rechaza la que todavía tenga datos ocultos.',
      'Le pone folio con el código del departamento (SV11-2026-0008) y lo deja en Recibido.',
      'Prioridad alta si el tipo de hecho es grave; media en los demás.',
    ],
  },
  {
    control: 'Segunda revisión',
    reglas: ['El filtro corre otra vez: lo que pasó se marca como anómalo, nunca se borra', 'Nadie recibe avisos automáticos'],
  },
  {
    color: 'ambar', icono: 'panel', quien: 'El equipo, en el panel (cualquier rol)',
    titulo: '4. Se revisa y se acompaña',
    pasos: [
      'Cambia el estado: Recibido, En investigación, Cerrado o Descartado (descartar exige el motivo).',
      'Anota lo actuado y asigna la organización de seguimiento. Todo queda en la bitácora con quién y cuándo.',
      'Salud de datos señala lo que conviene mirar: duplicados, fechas imposibles, casos sin atender.',
      'Lo que contó la persona nunca se edita: queda como evidencia.',
    ],
  },
  {
    control: 'Para publicar',
    reglas: [
      'Solo el rol administrador publica',
      'El texto arranca con el relato: se corrige y se quita todo lo que identifique a alguien',
      'Filtro estricto del muro: "dictadura", partidos o figuras políticas no dejan publicar',
      'Teléfonos, correos, "régimen de excepción" o "ministro" piden confirmar que se revisó',
    ],
  },
  {
    color: 'verde', icono: 'muro', quien: 'Cualquier persona, en internet',
    titulo: '5. Sale en el muro público',
    pasos: [
      'Se ve el tipo de hecho, la categoría, el cantón o el departamento, el mes y el año, y el texto revisado.',
      'Se puede leer completo y bajar en ficha PDF. No hay botones para compartir en redes sociales.',
      'El texto se puede corregir después desde el panel; queda en la bitácora.',
    ],
    nunca: 'Nunca sale: el alias, el folio, la comunidad, el punto exacto, las fotos, el relato original ni nada de quién reportó.',
  },
];

const ICONOS_CICLO = {
  persona: '<circle cx="12" cy="7.6" r="3.8"/><path d="M5 20.4a7 7 0 0 1 14 0"/>',
  telefono: '<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.2"/><path d="M10.5 17.6h3"/>',
  servidor: '<rect x="4" y="4" width="16" height="6.4" rx="1.6"/><rect x="4" y="13.6" width="16" height="6.4" rx="1.6"/><path d="M7.6 7.2h.01M7.6 16.8h.01"/>',
  panel: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M8 9h8M8 13h5"/>',
  muro: '<circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c2.4 2.6 3.6 5.5 3.6 8.8s-1.2 6.2-3.6 8.8c-2.4-2.6-3.6-5.5-3.6-8.8s1.2-6.2 3.6-8.8z"/>',
};

function diagramaCiclo() {
  const etapa = (e) => `
    <li class="ciclo-etapa" data-color="${e.color}">
      <span class="ciclo-disco" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONOS_CICLO[e.icono]}</svg></span>
      <div class="ciclo-tarjeta">
        <span class="ciclo-quien">${e.quien}</span>
        <h3>${e.titulo}</h3>
        <ul>${e.pasos.map((x) => `<li>${x}</li>`).join('')}</ul>
        ${e.nunca ? `<p class="ciclo-nunca">${e.nunca}</p>` : ''}
      </div>
    </li>`;
  const control = (c) => `
    <li class="ciclo-control">
      <span class="ciclo-rombo" aria-hidden="true"></span>
      <div><b>Control · ${c.control}</b><ul>${c.reglas.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    </li>`;
  return `
    <section class="caja guia-cap" id="guia-ciclo">
      <h2>Del registro al muro: el recorrido de un reporte</h2>
      <p class="sub">Cinco etapas, con los controles que hay que pasar entre una y otra. Un reporte puede quedarse en la etapa 4 para siempre: publicar es una decisión, no un paso obligatorio.</p>
      <div class="ciclo-franja" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <ol class="ciclo">${ETAPAS.map((x) => (x.control ? control(x) : etapa(x))).join('')}</ol>
    </section>`;
}

const CAPITULOS = [
  {
    id: 'anonimato',
    titulo: 'Anonimato de quien reporta',
    intro: 'El sistema está hecho para que nadie, ni siquiera el equipo que lo administra, pueda saber quién envió un reporte.',
    reglas: [
      'No existe ningún lugar donde guardar nombre, documento, correo, teléfono ni edad de quien reporta. No es una opción apagada: la base de datos no tiene esos campos.',
      'Cada persona tiene un alias que elige de una lista (por ejemplo, RÍO CLARO). No lo escribe, para que no ponga su nombre por costumbre.',
      'Al registrarse puede decir, si quiere, su sexo, su departamento y en qué organización participa. Esos datos solo se usan para contar cuánta gente participa y nunca se muestran junto a un caso.',
      'En Análisis, la participación solo se muestra en grupos de 5 personas o más. Con menos, una combinación como "mujer + Asociación de Mujeres + un departamento" podría señalar a alguien.',
    ],
  },
  {
    id: 'codigo-registro',
    titulo: 'Código de registro',
    intro: 'Es la palabra que una persona escribe una sola vez para poder registrarse en la app. Sirve para controlar quién entra.',
    reglas: [
      'Una o dos palabras, de 4 a 20 letras o números (por ejemplo, CEIBA). Se crea en Configuración → Códigos de registro.',
      'Se guarda en mayúsculas y sin tildes, y así se dicta. Si la persona escribe "ceiba" o "CÉIBA", la app lo acepta igual.',
      'Sirve solo entre las fechas que se eligen. "Hasta" incluye todo ese día, hasta las 11:59 de la noche, hora de El Salvador. Pasada esa fecha deja de servir solo.',
      'Un código nunca se repite: si ya se usó, aunque esté vencido o dado de baja, no se puede volver a crear.',
      'Dar de baja un código impide que alguien más se registre con él. Quien ya se registró sigue igual.',
      'No tiene nada que ver con el lugar: no dice de qué comunidad ni de qué departamento es la persona.',
      'Para una gira con equipos en lugares distintos, se crea un código para cada equipo.',
    ],
  },
  {
    id: 'recuperacion',
    titulo: 'Código de recuperación y clave del teléfono',
    intro: 'Al registrarse, la app le muestra a la persona un código de recuperación, por ejemplo CEIBA-4471-MONTE. Es lo único que recupera su cuenta si cambia de teléfono o lo pierde.',
    reglas: [
      'Para recuperar la cuenta, en la bienvenida de la app toca "Ya tengo una cuenta: recuperarla" y escribe su código de recuperación. No necesita un código de registro.',
      'Al recuperar, vuelven su alias y su departamento. La app le entrega un código de recuperación nuevo y el anterior deja de servir: si alguien más tenía el papel con el código viejo, ya no puede usarlo.',
      'Recupera la cuenta, no los reportes: los reportes anteriores no aparecen en el teléfono nuevo. Si alguien obliga a la persona a entregar su código, no ve lo que denunció. Los reportes siguen completos en el panel.',
      'El servidor solo guarda el código de recuperación de forma que puede comprobarlo, pero no leerlo. Si la persona lo pierde, nadie puede volver a dárselo.',
      'Se permiten 5 intentos de recuperación por hora desde una misma conexión.',
      'La clave de 4 números para abrir la app es opcional. Todo lo que la app guarda en el teléfono va cifrado, con clave o sin ella. Hoy no hay límite de intentos fallidos y no se borra nada, para no destruir la evidencia si le quitan el teléfono a alguien. Está pendiente de definirse.',
    ],
  },
  {
    id: 'ubicacion',
    titulo: 'Dónde ocurrió: departamento, punto en el mapa y cartografía',
    intro: 'Cada reporte dice por sí mismo dónde ocurrió el hecho. No hereda nada de quien lo envía: alguien de San Salvador puede reportar lo que pasa en Sonsonate.',
    reglas: [
      'En "¿Dónde fue?", la app propone el departamento que la persona eligió al registrarse y le deja cambiarlo por cualquiera de los 14.',
      'Marcar el punto exacto en el mapa es opcional. Sirve cuando el hecho ocurre en un sitio preciso, como una obra o una fuente de agua. En reportes contra personas, la app recomienda no marcar la casa de nadie.',
      'El punto exacto se ve en el detalle de cada caso, para cualquier rol. En el Mapa general, solo el rol administrador ve los puntos exactos.',
      'El punto exacto nunca sale del panel: no aparece en el muro público, ni en la exportación CSV, ni en el informe PDF.',
      'La división territorial es departamento, municipio y cantón. Hoy se trabaja con los 14 departamentos. Cuando se cargue la cartografía de El Salvador, se sumarán los municipios.',
      'El folio de cada caso empieza con el código de su departamento (por ejemplo, SV11-2026-0001). "SD" quiere decir que el reporte llegó sin departamento.',
    ],
  },
  {
    id: 'fotos',
    titulo: 'Fotografías',
    intro: 'Las fotos se limpian antes de salir del teléfono, para que no delaten a quien las tomó.',
    reglas: [
      'Hasta 5 fotos por reporte, de hasta 5 MB cada una (JPEG, PNG o WEBP).',
      'El teléfono redibuja cada foto antes de guardarla. Eso borra los datos ocultos (EXIF): el modelo del teléfono, la fecha y la ubicación GPS. El servidor vuelve a revisar y rechaza cualquier foto que todavía los tenga, y la base de datos tampoco la acepta.',
      'Cualquier rol puede ver y eliminar las fotos de un caso. Eliminar es permanente, y queda anotado en la bitácora del caso.',
      'La Galería, con todas las fotos juntas, es solo para el rol administrador.',
      'Las fotos nunca se publican en el muro ni salen en el informe PDF.',
    ],
  },
  {
    id: 'casos',
    titulo: 'Casos: estados, prioridad y bitácora',
    intro: 'Cada reporte que llega es un caso que el equipo revisa y acompaña.',
    reglas: [
      'Estados: Recibido, En investigación, Cerrado y Descartado. Se puede pasar de uno a otro en cualquier orden. Para descartar hay que escribir el motivo.',
      'La prioridad la fija el sistema al recibir el caso: alta si el tipo de hecho está marcado como grave y media en los demás. Hoy no se cambia desde el panel.',
      'Lo que contó la persona nunca se edita, ni desde el panel ni por otra vía. Así conserva su valor como prueba.',
      'Toda interpretación va en la bitácora del caso: cada cambio de estado y cada nota queda con quién la hizo y cuándo.',
      'Algunas notas las pone el sistema solo, por ejemplo al eliminar una foto, al publicar o al asignar el seguimiento. Esas no salen en el informe PDF.',
      'La organización de seguimiento (por ejemplo, la Junta de Agua) es una decisión del equipo sobre el caso. No es la organización de quien reportó. Cualquier rol la asigna caso por caso; asignarla a muchos casos a la vez es solo del administrador.',
      'El sistema marca como "anómalo" un caso con caracteres raros o con contenido bloqueado por el filtro. Esos casos se revisan en Salud de datos.',
      'Solo el administrador puede borrar un caso, escribiendo su folio para confirmar. Se borra para siempre, con sus fotos, su bitácora y su publicación en el muro; solo los respaldos ya generados lo conservan hasta que vencen.',
    ],
  },
  {
    id: 'filtro',
    titulo: 'Filtro de contenido',
    intro: 'El observatorio no es un espacio político-partidario ni un canal para hablar de estructuras criminales.',
    reglas: [
      'La app no deja enviar un relato con nombres de partidos o de figuras político-partidarias, ni con referencias a pandillas. Con palabras como "gobierno" o "alcalde" solo avisa, porque pueden ser legítimas.',
      'Si algo pasa el filtro, el servidor no lo rechaza: marca el caso como anómalo para que una persona lo revise.',
      'El filtro nunca cancela ni bloquea la cuenta de nadie.',
    ],
  },
  {
    id: 'muro',
    titulo: 'Muro público',
    intro: 'El muro muestra hacia afuera lo que el equipo decide hacer público.',
    reglas: [
      'Nada se publica solo: cada publicación la aprueba una persona con rol administrador.',
      'El texto para el muro arranca con el relato de la persona. El administrador corrige la ortografía, quita nombres, caseríos, teléfonos o cualquier dato que identifique a alguien, y puede agregar líneas. El relato original no cambia: queda como evidencia.',
      'Antes de publicar, el filtro revisa el texto con una lista más estricta que la de la app: con partidos, figuras políticas, pandillas o palabras como "dictadura", "tiranía" o "presos políticos" (también escritas "D1CTADURA" o "d.i.c.t.a.d.u.r.a") no deja publicar; con "régimen de excepción", "gobierno", "ministro", "elecciones", un teléfono o un correo pide confirmar que se revisó.',
      'El muro muestra el tipo de hecho, el cantón, el departamento, el mes y el año, y el texto revisado. Nunca muestra la comunidad, el punto exacto ni las fotos.',
      'El texto de un caso ya publicado se puede corregir desde su ficha; el cambio queda en la bitácora. Todavía no hay forma de quitar un caso del muro.',
    ],
  },
  {
    id: 'seguimiento',
    titulo: 'Seguimiento: no hay avisos automáticos',
    intro: 'El seguimiento de los casos es manual: lo decide y lo hace el equipo coordinador.',
    reglas: [
      'El sistema no avisa solo a nadie. Ningún reporte dispara un mensaje a la red ni a otras organizaciones.',
      'Un hecho grave llega marcado como prioridad alta, para revisarlo primero. Eso es lo que la app le dice a la persona.',
      'El equipo revisa cada caso, decide a qué organización le toca el seguimiento y, si corresponde, le entrega en mano el informe PDF con sus casos.',
    ],
  },
  {
    id: 'anomalias',
    titulo: 'Anomalías para revisar',
    intro: 'En Salud de datos, el sistema revisa los datos y señala lo que conviene mirar. No cambia nada: una persona decide.',
    reglas: [
      'Datos inconsistentes: reportes sin departamento, fecha del hecho posterior al día en que llegó el reporte, posibles duplicados (mismo tipo y departamento, fechas a menos de 2 días y relato parecido), relato vacío o de menos de 20 caracteres, y punto en el mapa fuera de El Salvador.',
      'Uso sospechoso: más de 5 reportes de un mismo teléfono en 24 horas, cuentas recuperadas 3 veces o más, y textos marcados por el filtro de contenido. Las dos primeras las ve solo el administrador, y nunca dicen quién envió nada.',
      'Casos sin atender: en Recibido hace más de 7 días, en investigación sin ninguna nota en 15 días, y casos abiertos sin organización de seguimiento.',
      'Cada tarjeta muestra cuántos casos encontró. Al tocarla aparece la lista, y cada caso se abre en su ficha.',
    ],
  },
  {
    id: 'salidas',
    titulo: 'Exportación e informe PDF',
    intro: 'Todo lo que sale del panel en un archivo queda fuera del control del sistema. Por eso sale con lo mínimo.',
    reglas: [
      'La exportación CSV de Casos lleva folio, territorio, tipo, fecha, prioridad, estado y si está marcado como anómalo. No lleva el relato ni las coordenadas.',
      'El informe PDF de seguimiento, en Análisis, es para entregar en mano a una organización. Lo genera solo el administrador, con hasta 500 casos.',
      'El informe no lleva relato, lugar, entidad mencionada, coordenadas, fotos ni el nombre de quien escribió cada nota. Tampoco lleva metadatos: ni programa, ni fecha, ni autor.',
      '"Lo actuado" son las notas internas del equipo. La vista previa las muestra todas y tiene un interruptor para sacarlas: revíselas antes de entregar el documento.',
    ],
  },
  {
    id: 'respaldos',
    titulo: 'Respaldos',
    intro: 'La información no puede depender de una sola copia en un solo servidor.',
    reglas: [
      'Un respaldo es una copia cifrada de toda la base de datos. Sin la clave que guarda el equipo, el archivo no sirve para nada.',
      'Es "automático" de esta forma: cada vez que alguien abre la pantalla de Respaldos, si el último tiene 7 días o más, se genera uno nuevo. Se guardan los últimos 10.',
      'Solo el rol administrador genera y descarga respaldos, y cada descarga queda anotada.',
    ],
  },
  {
    id: 'roles',
    titulo: 'Roles del panel',
    intro: 'Hay dos roles: administrador y operador.',
    reglas: [
      'Cualquier rol: ver y gestionar casos (estado, notas, organización de seguimiento), ver y eliminar fotos de un caso, Mapa, Resumen, Análisis y Salud de datos.',
      'Solo administrador: publicar al muro, Galería, informe PDF, asignar seguimiento en lote, participación por grupos, códigos de registro, personal del panel y respaldos.',
      'Una cuenta del panel nunca se borra, solo se desactiva. Así la bitácora de quién hizo qué queda completa.',
    ],
  },
  {
    id: 'senal',
    titulo: 'Sin señal y límites de intentos',
    intro: 'La app está hecha para zonas con poca conexión.',
    reglas: [
      'Se puede reportar sin señal: el reporte queda guardado y cifrado en el teléfono y se envía solo cuando vuelve la conexión, o cuando la persona abre la app.',
      'Un reporte nunca se duplica, aunque el teléfono lo envíe dos veces.',
      'Registrarse: 5 intentos por hora desde una misma conexión. En una capacitación donde todos usan el mismo wifi, la sexta persona tendría que esperar una hora o usar sus datos móviles.',
      'Recuperar cuenta: 5 intentos por hora desde una misma conexión. Entrar al panel: 10 intentos por hora.',
    ],
  },
];

function capitulo(c) {
  return `
    <section class="caja guia-cap" id="guia-${c.id}">
      <h2>${c.titulo}</h2>
      <p class="sub">${c.intro}</p>
      <ul class="guia-reglas">${c.reglas.map((r) => `<li>${r}</li>`).join('')}</ul>
    </section>`;
}

export function montar(raiz) {
  raiz.innerHTML = `
    <div class="head"><div><h1>Cómo funciona</h1><p>Las reglas del observatorio, para consultar cuando haga falta. Revisado el ${REVISADO}.</p></div></div>
    <nav class="caja guia-indice" aria-label="Capítulos">
      <a href="#guia-ciclo" data-ir="ciclo"><span>0</span>Del registro al muro</a>
      ${CAPITULOS.map((c, i) => `<a href="#guia-${c.id}" data-ir="${c.id}"><span>${i + 1}</span>${c.titulo}</a>`).join('')}
    </nav>
    ${diagramaCiclo()}
    ${CAPITULOS.map(capitulo).join('')}`;

  // El enrutado del panel no usa el hash: se desplaza a mano para no
  // cambiar de vista al tocar un capítulo.
  raiz.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('guia-' + a.dataset.ir).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
