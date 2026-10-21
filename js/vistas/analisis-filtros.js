/* =====================================================================
   Barra de filtros del tablero de Análisis — al estilo Power BI /
   Metabase: cada cambio refresca TODO el tablero de una vez (la vista
   recibe un solo aviso por cambio, aunque la cascada toque varios
   campos).

   - Período con atajos (30/90 días, 6/12 meses, este año) o rango a
     mano; "a mano" recién muestra las fechas al elegirlo.
   - Cascada: la comunidad ofrece solo las del departamento elegido;
     el tipo de hecho, solo los de la familia elegida. Elegir una
     comunidad (o un tipo) completa su departamento (o su familia).
   - Filtro cruzado: alternar(campo, valor) lo usan los gráficos — un
     clic agrega ese filtro, otro clic sobre lo mismo lo quita.
   - Los filtros sobreviven a cambiar de vista durante la sesión
     (sessionStorage), nunca más allá: no es un dato a conservar.

   Los nombres de los campos son los de la API (lib/FiltrosReporte.php),
   los mismos que entiende Casos.
   ===================================================================== */
import { NOMBRE_FAMILIA, ETIQ_ESTADO, esc, hoySV, sumarDias, diaLegible } from '../core/graficas.js';

const LLAVE = 'panel_analisis_filtros';
const PERIODOS = [
  ['30', '30 días'],
  ['90', '90 días'],
  ['180', '6 meses'],
  ['365', '12 meses'],
  ['anio', 'Este año'],
  ['rango', 'Elegir fechas'],
];
const VACIO = { periodo: '180', desde: '', hasta: '', departamento_id: '', comunidad_id: '', familia: '', tipo_vulneracion_id: '', estado: '' };

let estado = { ...VACIO };
let opciones = { departamentos: [], comunidades: [], tipos: [] };
let alCambiar = () => {};
let alEmpezar = () => {};
let temporizador = null;

function guardar() {
  try { sessionStorage.setItem(LLAVE, JSON.stringify(estado)); } catch { /* modo privado: solo no se recuerda */ }
}

function leerGuardado() {
  try {
    const crudo = JSON.parse(sessionStorage.getItem(LLAVE) || 'null');
    if (crudo && typeof crudo === 'object') estado = { ...VACIO, ...crudo };
  } catch { estado = { ...VACIO }; }
}

/** Lo que se manda a la API (y a Casos): solo los campos con valor. */
export function parametros() {
  const hoy = hoySV();
  let desde;
  let hasta = hoy;
  if (estado.periodo === 'rango') {
    desde = estado.desde;
    hasta = estado.hasta || hoy;
  } else if (estado.periodo === 'anio') {
    desde = hoy.slice(0, 4) + '-01-01';
  } else {
    desde = sumarDias(hoy, -(Number(estado.periodo) - 1));
  }
  const p = { desde, hasta };
  for (const campo of ['departamento_id', 'comunidad_id', 'familia', 'tipo_vulneracion_id', 'estado']) {
    if (estado[campo]) p[campo] = estado[campo];
  }
  if (!p.desde) delete p.desde;
  return p;
}

export function nombreTipo(id) {
  return opciones.tipos.find((t) => String(t.id) === String(id))?.nombre || '';
}

function nombreDe(lista, id) {
  return lista.find((x) => String(x.id) === String(id))?.nombre || id;
}

// ---- Reglas de la cascada ----

function aplicarCascada(campoCambiado) {
  if (campoCambiado === 'comunidad_id' && estado.comunidad_id) {
    const co = opciones.comunidades.find((c) => String(c.id) === String(estado.comunidad_id));
    if (co?.departamento_id) estado.departamento_id = String(co.departamento_id);
  }
  if (campoCambiado === 'departamento_id' && estado.comunidad_id) {
    const co = opciones.comunidades.find((c) => String(c.id) === String(estado.comunidad_id));
    if (estado.departamento_id && String(co?.departamento_id) !== String(estado.departamento_id)) estado.comunidad_id = '';
  }
  if (campoCambiado === 'tipo_vulneracion_id' && estado.tipo_vulneracion_id) {
    const t = opciones.tipos.find((x) => String(x.id) === String(estado.tipo_vulneracion_id));
    if (t) estado.familia = t.familia;
  }
  if (campoCambiado === 'familia' && estado.tipo_vulneracion_id) {
    const t = opciones.tipos.find((x) => String(x.id) === String(estado.tipo_vulneracion_id));
    if (estado.familia && t?.familia !== estado.familia) estado.tipo_vulneracion_id = '';
  }
}

function avisar() {
  guardar();
  pintarControles();
  // En el MISMO instante del clic, no cuando sale el pedido: si no, por
  // un momento el chip ya dice el filtro nuevo y los números todavía son
  // los viejos, sin ninguna señal de que van a cambiar.
  alEmpezar();
  clearTimeout(temporizador);
  // Un solo pedido aunque la cascada haya tocado varios campos, o
  // alguien cambie dos filtros seguidos.
  temporizador = setTimeout(() => alCambiar(parametros()), 120);
}

/** Filtro cruzado desde un gráfico: mismo valor = quitarlo. */
export function alternar(campo, valor) {
  estado[campo] = String(estado[campo]) === String(valor) ? '' : String(valor);
  aplicarCascada(campo);
  avisar();
}

/** Varios filtros a la vez (p. ej. comunidad + tipo desde "hechos repetidos"). */
export function fijar(campos) {
  for (const [campo, valor] of Object.entries(campos)) {
    estado[campo] = String(valor ?? '');
    aplicarCascada(campo);
  }
  avisar();
}

export function estaActivo(campo, valor) {
  return String(estado[campo]) === String(valor);
}

// ---- Pintado ----

function opcionesHtml(lista, valor, vacio) {
  return `<option value="">${vacio}</option>` + lista
    .map((x) => `<option value="${esc(x.id)}"${String(x.id) === String(valor) ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('');
}

function etiquetaPeriodo() {
  const p = parametros();
  return p.desde ? `${diaLegible(p.desde)} – ${diaLegible(p.hasta)}` : `Hasta ${diaLegible(p.hasta)}`;
}

function chips() {
  const lista = [];
  if (estado.departamento_id) lista.push(['departamento_id', 'Departamento: ' + nombreDe(opciones.departamentos, estado.departamento_id)]);
  if (estado.comunidad_id) lista.push(['comunidad_id', 'Comunidad: ' + nombreDe(opciones.comunidades, estado.comunidad_id)]);
  if (estado.familia) lista.push(['familia', 'Familia: ' + (NOMBRE_FAMILIA[estado.familia] || estado.familia)]);
  if (estado.tipo_vulneracion_id) lista.push(['tipo_vulneracion_id', 'Tipo: ' + nombreTipo(estado.tipo_vulneracion_id)]);
  if (estado.estado) lista.push(['estado', 'Estado: ' + (ETIQ_ESTADO[estado.estado] || estado.estado)]);
  return lista;
}

function pintarControles() {
  document.querySelectorAll('#af-periodo [data-periodo]').forEach((b) => {
    const activo = b.dataset.periodo === estado.periodo;
    b.classList.toggle('act', activo);
    b.setAttribute('aria-pressed', activo ? 'true' : 'false');
  });
  const rango = document.getElementById('af-rango');
  rango.hidden = estado.periodo !== 'rango';
  document.getElementById('af-desde').value = estado.desde;
  document.getElementById('af-hasta').value = estado.hasta;

  const comunidades = estado.departamento_id
    ? opciones.comunidades.filter((c) => String(c.departamento_id) === String(estado.departamento_id))
    : opciones.comunidades;
  const tipos = estado.familia ? opciones.tipos.filter((t) => t.familia === estado.familia) : opciones.tipos;
  document.getElementById('af-departamento').innerHTML = opcionesHtml(opciones.departamentos, estado.departamento_id, 'Todos');
  document.getElementById('af-comunidad').innerHTML = opcionesHtml(comunidades, estado.comunidad_id, estado.departamento_id ? 'Todas las del departamento' : 'Todas');
  document.getElementById('af-familia').innerHTML = opcionesHtml(Object.entries(NOMBRE_FAMILIA).map(([id, nombre]) => ({ id, nombre })), estado.familia, 'Todas');
  document.getElementById('af-tipo').innerHTML = opcionesHtml(tipos, estado.tipo_vulneracion_id, 'Todos');
  document.getElementById('af-estado').innerHTML = opcionesHtml(Object.entries(ETIQ_ESTADO).map(([id, nombre]) => ({ id, nombre })), estado.estado, 'Todos');

  const activos = chips();
  document.getElementById('af-chips').innerHTML = `<span class="tf-periodo">${esc(etiquetaPeriodo())}</span>` +
    activos.map(([campo, texto]) => `<span class="chip-filtro">${esc(texto)}<button type="button" data-quitar="${campo}" aria-label="Quitar filtro ${esc(texto)}">×</button></span>`).join('') +
    (activos.length || estado.periodo !== VACIO.periodo ? '<button type="button" class="enlace-boton" id="af-limpiar">Limpiar filtros</button>' : '');
}

export function esqueleto() {
  return `
    <div class="tablero-filtros" id="a-filtros">
      <div class="tf-fila">
        <div class="campo-grupo">
          <span class="tf-label" id="af-periodo-label">Período</span>
          <div class="segmentado" id="af-periodo" role="group" aria-labelledby="af-periodo-label">
            ${PERIODOS.map(([v, t]) => `<button type="button" data-periodo="${v}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="tf-rango" id="af-rango" hidden>
          <div class="campo-grupo"><label for="af-desde">Desde</label><input type="date" id="af-desde" class="campo-filtro"></div>
          <div class="campo-grupo"><label for="af-hasta">Hasta</label><input type="date" id="af-hasta" class="campo-filtro"></div>
        </div>
      </div>
      <div class="tf-fila">
        <div class="campo-grupo"><label for="af-departamento">Departamento</label><select id="af-departamento" class="campo-filtro"></select></div>
        <div class="campo-grupo"><label for="af-comunidad">Comunidad</label><select id="af-comunidad" class="campo-filtro"></select></div>
        <div class="campo-grupo"><label for="af-familia">Familia</label><select id="af-familia" class="campo-filtro"></select></div>
        <div class="campo-grupo"><label for="af-tipo">Tipo de hecho</label><select id="af-tipo" class="campo-filtro"></select></div>
        <div class="campo-grupo"><label for="af-estado">Estado</label><select id="af-estado" class="campo-filtro"></select></div>
      </div>
      <div class="tf-pie">
        <div class="tf-chips" id="af-chips" aria-live="polite"></div>
        <button type="button" class="btn chico" id="af-ver-casos">Ver estos casos</button>
      </div>
      <div class="tf-progreso" aria-hidden="true"></div>
    </div>`;
}

/**
 * Enlaza la barra (ya en el DOM). `alVerCasos` recibe los parámetros
 * actuales — la vista decide cómo llevar eso a Casos.
 */
export function montarBarra({ opciones: o, alCambiar: cb, alEmpezar: empezar = () => {}, alVerCasos }) {
  clearTimeout(temporizador);
  opciones = o;
  alCambiar = cb;
  alEmpezar = empezar;
  leerGuardado();
  pintarControles();

  document.getElementById('af-periodo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-periodo]');
    if (!b || b.dataset.periodo === estado.periodo) return;
    const previo = parametros();
    estado.periodo = b.dataset.periodo;
    if (estado.periodo === 'rango' && !estado.desde) {
      // Arranca el rango a mano con el período que ya se estaba viendo.
      estado.desde = previo.desde || sumarDias(hoySV(), -179);
      estado.hasta = previo.hasta;
    }
    avisar();
  });
  for (const id of ['af-desde', 'af-hasta']) {
    document.getElementById(id).addEventListener('change', (e) => {
      estado[id === 'af-desde' ? 'desde' : 'hasta'] = e.target.value;
      avisar();
    });
  }
  const selects = { 'af-departamento': 'departamento_id', 'af-comunidad': 'comunidad_id', 'af-familia': 'familia', 'af-tipo': 'tipo_vulneracion_id', 'af-estado': 'estado' };
  for (const [id, campo] of Object.entries(selects)) {
    document.getElementById(id).addEventListener('change', (e) => {
      estado[campo] = e.target.value;
      aplicarCascada(campo);
      avisar();
    });
  }
  document.getElementById('af-chips').addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) {
      estado[quitar.dataset.quitar] = '';
      avisar();
      return;
    }
    if (e.target.closest('#af-limpiar')) {
      estado = { ...VACIO };
      avisar();
    }
  });
  document.getElementById('af-ver-casos').addEventListener('click', () => alVerCasos(parametros()));
  return parametros();
}
