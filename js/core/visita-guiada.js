/* =====================================================================
   Visita guiada del panel: recorre cada sección, ilumina la parte que
   importa y explica en una frase para qué sirve. Pedido del 21 de
   octubre de 2026.

   La primera vez que una persona entra se le ofrece con un aviso en la
   esquina (se recuerda por usuario en este navegador), y se repite desde
   "Visita guiada" en el menú. Los pasos de administrador se saltan para el rol operador.
   Si una regla cambia, se corrige aquí igual que en vistas/guia.js.
   ===================================================================== */
import * as sesion from '../data/sesion.js';

const PASOS = [
  {
    titulo: 'Bienvenida al panel',
    texto: 'En unos pasos le muestro cada sección y para qué sirve. Puede salir cuando quiera con Esc o con "Salir": la visita se repite desde "Visita guiada", en el menú.',
  },
  {
    objetivo: '.lat',
    titulo: 'El menú',
    texto: 'Desde aquí se cambia de sección. Lo que ve depende de su rol: algunas secciones son solo para administrador.',
  },
  {
    vista: 'resumen', objetivo: '#r-kpis',
    titulo: 'Resumen',
    texto: 'Lo que necesita atención hoy: casos sin revisar, prioridad alta y lo que llegó en los últimos días. Toque un número para ver esos casos.',
  },
  {
    vista: 'casos', objetivo: '#c-tabla tr[data-id]',
    titulo: 'Casos',
    texto: 'Todos los reportes. Filtre por estado, departamento, fechas o palabra. Toque una fila para abrir la ficha: el relato, las fotos, el estado, la bitácora y el texto para el muro.',
  },
  {
    vista: 'casos', objetivo: '.filtros',
    titulo: 'Estados de un caso',
    texto: 'Recibido, En investigación, Cerrado o Descartado, en cualquier orden. Descartar exige escribir el motivo. Lo que contó la persona nunca se edita.',
  },
  {
    vista: 'mapa', objetivo: '#r-mapa',
    titulo: 'Mapa',
    texto: 'Dónde ocurren los hechos. Filtre por tipo, departamento o estado, y con la línea de tiempo de abajo véalos aparecer en el orden en que llegaron. El punto exacto lo ve solo el administrador; nunca sale del panel.',
  },
  {
    vista: 'galeria', objetivo: '#g-grilla', soloAdmin: true,
    titulo: 'Galería',
    texto: 'Todas las fotos juntas, ya sin datos ocultos. Las fotos nunca se publican en el muro.',
  },
  {
    vista: 'analisis', objetivo: '#a-kpis',
    titulo: 'Análisis',
    texto: 'Tendencias por tipo de hecho, departamento y estado. Desde aquí el administrador genera el informe PDF para entregar en mano a una organización.',
  },
  {
    vista: 'salud', objetivo: '#s-calidad',
    titulo: 'Salud de datos',
    texto: 'El sistema señala lo que conviene mirar: posibles duplicados, fechas imposibles, textos marcados por el filtro y casos sin atender. No cambia nada: decide una persona.',
  },
  {
    vista: 'config', objetivo: '#cfg-codigos-caja', soloAdmin: true,
    titulo: 'Códigos de registro',
    texto: 'Antes de cada capacitación o gira se crea aquí el código que la gente escribe para registrarse en la app, con sus fechas de vigencia.',
  },
  {
    vista: 'respaldos', objetivo: '#r-lista', soloAdmin: true,
    titulo: 'Respaldos',
    texto: 'Copias cifradas de toda la base de datos. Se generan solas cada 7 días al abrir esta pantalla.',
  },
  {
    vista: 'guia', objetivo: '#guia-ciclo',
    titulo: 'Cómo funciona',
    texto: 'El recorrido completo de un reporte, del registro al muro público, y todas las reglas del observatorio en lenguaje llano.',
  },
  {
    titulo: 'Eso es todo',
    texto: 'Cuando tenga una duda, busque el signo de pregunta junto a cada título o vuelva a "Cómo funciona". La visita se repite desde el menú.',
  },
];

let irAVista = null;
let pasos = [];
let indice = 0;
let capa = null;
let tarjeta = null;
let foco = null;
let alTeclear = null;
let alCambiarTamano = null;

function claveVista() {
  return 'panel_visita_vista_' + (sesion.usuarioActual()?.id ?? 'anonimo');
}

function esperarObjetivo(objetivo) {
  const buscar = () => (typeof objetivo === 'function' ? objetivo() : document.querySelector(objetivo));
  return new Promise((resolver) => {
    const inicio = performance.now();
    (function intentar() {
      const el = buscar();
      if (el && el.getBoundingClientRect().height > 0) return resolver(el);
      const espera = performance.now() - inicio;
      if (espera > 4000 || (el && espera > 400)) return resolver(null);
      requestAnimationFrame(intentar);
    })();
  });
}

function ubicar(el) {
  const margen = 8;
  const ancho = Math.min(360, window.innerWidth - 32);
  tarjeta.style.width = ancho + 'px';
  if (!el) {
    foco.hidden = true;
    tarjeta.style.left = Math.max(16, (window.innerWidth - ancho) / 2) + 'px';
    tarjeta.style.top = Math.max(16, (window.innerHeight - tarjeta.offsetHeight) / 2) + 'px';
    return;
  }
  const r = el.getBoundingClientRect();
  const alto = Math.min(r.height, window.innerHeight - 2 * margen);
  foco.hidden = false;
  Object.assign(foco.style, {
    left: r.left - margen + 'px', top: r.top - margen + 'px',
    width: r.width + 2 * margen + 'px', height: alto + 2 * margen + 'px',
  });
  const altoTarjeta = tarjeta.offsetHeight;
  let left = r.right + 20;
  let top = r.top;
  if (left + ancho > window.innerWidth - 16) {
    left = Math.min(Math.max(16, r.left), window.innerWidth - ancho - 16);
    top = r.top + alto + margen + 14;
    if (top + altoTarjeta > window.innerHeight - 16) top = Math.max(16, r.top - altoTarjeta - margen - 14);
  }
  tarjeta.style.left = left + 'px';
  tarjeta.style.top = Math.min(Math.max(16, top), window.innerHeight - altoTarjeta - 16) + 'px';
}

async function mostrar(n) {
  indice = n;
  const paso = pasos[n];
  tarjeta.querySelector('.vg-contador').textContent = `Paso ${n + 1} de ${pasos.length}`;
  tarjeta.querySelector('.vg-titulo').textContent = paso.titulo;
  tarjeta.querySelector('.vg-texto').textContent = paso.texto;
  tarjeta.querySelector('[data-vg="anterior"]').hidden = n === 0;
  tarjeta.querySelector('[data-vg="siguiente"]').textContent = n === 0 ? 'Empezar' : (n === pasos.length - 1 ? 'Terminar' : 'Siguiente');
  tarjeta.querySelector('[data-vg="salir"]').textContent = n === 0 ? 'Ahora no' : 'Salir';
  tarjeta.querySelector('.vg-barra i').style.width = ((n + 1) / pasos.length) * 100 + '%';

  let el = null;
  if (paso.vista) await irAVista(paso.vista);
  if (indice !== n || !capa) return;
  if (paso.objetivo) {
    el = await esperarObjetivo(paso.objetivo);
    if (indice !== n || !capa) return;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }
  ubicar(el);
  tarjeta.focus();
  alCambiarTamano = () => ubicar(el);
}

function cerrar() {
  capa?.remove();
  capa = null;
  document.removeEventListener('keydown', alTeclear);
  window.removeEventListener('resize', alCambiarTamanoEnvoltura);
  try { localStorage.setItem(claveVista(), '1'); } catch { /* sin almacenamiento: se ofrecerá otra vez */ }
}

function alCambiarTamanoEnvoltura() {
  alCambiarTamano?.();
}

export function iniciarVisita(navegar) {
  if (capa) return;
  document.querySelector('.vg-aviso')?.remove();
  irAVista = navegar;
  const esAdmin = sesion.usuarioActual()?.rol === 'administrador';
  pasos = PASOS.filter((p) => esAdmin || !p.soloAdmin);

  capa = document.createElement('div');
  capa.className = 'vg-capa';
  capa.innerHTML = `
    <div class="vg-foco" hidden></div>
    <div class="vg-tarjeta" role="dialog" aria-modal="true" aria-labelledby="vg-titulo" tabindex="-1">
      <div class="vg-barra" aria-hidden="true"><i></i></div>
      <span class="vg-contador"></span>
      <h2 class="vg-titulo" id="vg-titulo"></h2>
      <p class="vg-texto"></p>
      <div class="vg-acciones">
        <button type="button" class="btn ghost chico" data-vg="salir">Salir</button>
        <span></span>
        <button type="button" class="btn ghost chico" data-vg="anterior">Anterior</button>
        <button type="button" class="btn chico" data-vg="siguiente">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(capa);
  foco = capa.querySelector('.vg-foco');
  tarjeta = capa.querySelector('.vg-tarjeta');

  const siguiente = () => (indice < pasos.length - 1 ? mostrar(indice + 1) : cerrar());
  const anterior = () => indice > 0 && mostrar(indice - 1);
  capa.querySelector('[data-vg="siguiente"]').addEventListener('click', siguiente);
  capa.querySelector('[data-vg="anterior"]').addEventListener('click', anterior);
  capa.querySelector('[data-vg="salir"]').addEventListener('click', cerrar);
  alTeclear = (e) => {
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowRight') siguiente();
    else if (e.key === 'ArrowLeft') anterior();
  };
  document.addEventListener('keydown', alTeclear);
  window.addEventListener('resize', alCambiarTamanoEnvoltura);
  mostrar(0);
}

export function ofrecerVisitaSiEsPrimeraVez(navegar) {
  let vista = false;
  try { vista = localStorage.getItem(claveVista()) === '1'; } catch { /* sin almacenamiento: se ofrece */ }
  if (vista || document.querySelector('.vg-aviso')) return;

  const aviso = document.createElement('div');
  aviso.className = 'vg-aviso';
  aviso.setAttribute('role', 'status');
  aviso.innerHTML = `
    <b>¿Primera vez en el panel?</b>
    <p>Una visita guiada le muestra cada sección en un par de minutos.</p>
    <div><button type="button" class="btn ghost chico" data-vg-aviso="no">No, gracias</button>
    <button type="button" class="btn chico" data-vg-aviso="si">Empezar la visita</button></div>`;
  document.body.appendChild(aviso);
  const recordar = () => { try { localStorage.setItem(claveVista(), '1'); } catch { /* se ofrecerá otra vez */ } };
  aviso.querySelector('[data-vg-aviso="no"]').addEventListener('click', () => { recordar(); aviso.remove(); });
  aviso.querySelector('[data-vg-aviso="si"]').addEventListener('click', () => { aviso.remove(); iniciarVisita(navegar); });
}
