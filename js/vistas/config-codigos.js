/* =====================================================================
   Configuración → Códigos de registro (migración 012,
   docs/decision-08-codigo-de-registro.md).

   Un código es una palabra o frase ("ÁGUILA VERDE") que REDNA reparte
   en una capacitación o una gira para controlar quién se registra en
   la app. Vale entre dos fechas y no dice nada de la persona ni de su
   comunidad. Un código ya creado no se puede volver a crear nunca,
   aunque haya vencido: por eso lo vencido y lo revocado quedan en un
   historial de solo lectura, sin "extender".
   ===================================================================== */
import { obtenerCodigos, crearCodigo, revocarCodigo, actualizarVigenciaCodigo } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { esVistaActiva } from '../main.js';
import { esc } from '../core/graficas.js';

const DIAS_POR_DEFECTO = 7;

// Día calendario de El Salvador, no el del equipo de quien mira.
function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/El_Salvador' });
}
function fechaInputSV(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }) : '';
}
function hoySV() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
}
function sumarDias(fechaYMD, dias) {
  const d = new Date(fechaYMD + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
// "-06:00" fijo: El Salvador no tiene horario de verano. "Hasta" es
// inclusive: el código sirve todo ese día, hasta las 23:59:59.
const inicioDeDiaSV = (ymd) => ymd + 'T00:00:00-06:00';
const finDeDiaSV = (ymd) => ymd + 'T23:59:59-06:00';

/** vigente | programado | vencido | revocado — el texto lo dice una sola vez. */
function situacion(c) {
  const ahora = new Date();
  if (!c.activo) return { grupo: 'historial', pill: 'p-n', etiqueta: 'Dado de baja', texto: c.fecha_revocacion ? `el ${fechaCorta(c.fecha_revocacion)}` : '' };
  if (c.vigente_hasta && new Date(c.vigente_hasta) < ahora) return { grupo: 'historial', pill: 'p-i', etiqueta: 'Vencido', texto: `el ${fechaCorta(c.vigente_hasta)}` };
  if (c.vigente_desde && new Date(c.vigente_desde) > ahora) {
    return { grupo: 'vigentes', pill: 'p-a', etiqueta: 'Programado', texto: `empieza el ${fechaCorta(c.vigente_desde)}${c.vigente_hasta ? ' · vence el ' + fechaCorta(c.vigente_hasta) : ''}` };
  }
  return { grupo: 'vigentes', pill: 'p-c', etiqueta: 'Sirve ahora', texto: c.vigente_hasta ? `hasta el ${fechaCorta(c.vigente_hasta)}` : '<span class="cod-sin-fin">sin fecha de vencimiento: sirve hasta que lo dé de baja</span>' };
}

function personas(n) {
  return n === 1 ? '1 persona registrada' : `${n} personas registradas`;
}

export function esqueletoCodigos() {
  const hoy = hoySV();
  return `
    <div class="caja" id="cfg-codigos-caja">
      <h2>Códigos de registro ${botonAyuda('config-codigos')}</h2>
      <p class="sub">La palabra o frase que una persona escribe para registrarse en la app. Vale solo entre las fechas que elija.</p>

      <form id="cod-form" class="cod-form">
        <div class="campo-grupo cod-campo-codigo">
          <label for="cod-texto">Código</label>
          <div class="cod-fila-codigo">
            <input id="cod-texto" class="campo-filtro" maxlength="40" autocomplete="off" placeholder="Ej.: Águila verde">
            <button type="button" class="btn ghost chico" id="cod-azar">Inventar uno</button>
          </div>
          <small class="cod-ayuda">Entre 6 y 40 letras o números. No importan las mayúsculas ni las tildes. No puede ser uno que ya se usó.</small>
        </div>
        <div class="campo-grupo">
          <label for="cod-desde">Sirve desde</label>
          <input type="date" id="cod-desde" class="campo-filtro" value="${hoy}" min="${hoy}" required>
        </div>
        <div class="campo-grupo">
          <label for="cod-hasta">Hasta (inclusive)</label>
          <input type="date" id="cod-hasta" class="campo-filtro" value="${sumarDias(hoy, DIAS_POR_DEFECTO)}" min="${hoy}" required>
        </div>
        <button class="btn" type="submit" id="cod-crear">Crear código</button>
      </form>
      <div id="cod-error" class="cod-error" hidden></div>
      <div id="cod-recien" class="cod-recien" hidden></div>

      <h3 class="cod-titulo">Sirven ahora o están programados</h3>
      <div id="cod-vigentes"><p class="cargando">Cargando…</p></div>

      <details class="cod-historial" id="cod-historial-caja">
        <summary>Historial: vencidos y dados de baja <span id="cod-historial-n"></span></summary>
        <p class="sub2">Ya no sirven para registrarse y no se pueden volver a crear.</p>
        <div id="cod-historial"></div>
      </details>
    </div>`;
}

function filaVigente(c) {
  const s = situacion(c);
  return `
    <div class="cod-item" data-codigo-id="${c.id}">
      <div class="cod-item-cuerpo">
        <div class="cod-item-titulo"><b class="codigo-mono">${esc(c.codigo)}</b><span class="pill ${s.pill}">${s.etiqueta}</span></div>
        <small>${s.texto} · ${personas(c.personas_registradas)}</small>
      </div>
      <div class="cod-item-acciones">
        <button type="button" class="btn ghost chico" data-copiar="${esc(c.codigo)}">Copiar</button>
        <button type="button" class="btn ghost chico" data-fechas="${c.id}">Cambiar fechas</button>
        <button type="button" class="btn ghost chico cod-baja" data-baja="${c.id}" data-codigo="${esc(c.codigo)}">Dar de baja</button>
      </div>
      <form class="cod-editor" data-editor="${c.id}" hidden>
        <label>Desde <input type="date" class="campo-filtro" data-desde value="${fechaInputSV(c.vigente_desde)}"></label>
        <label>Hasta <input type="date" class="campo-filtro" data-hasta value="${fechaInputSV(c.vigente_hasta)}" required></label>
        <button type="submit" class="btn chico">Guardar fechas</button>
        <button type="button" class="btn ghost chico" data-cancelar>Cancelar</button>
      </form>
    </div>`;
}

function filaHistorial(c) {
  const s = situacion(c);
  return `
    <div class="cod-item cod-item--historial">
      <div class="cod-item-cuerpo">
        <div class="cod-item-titulo"><b class="codigo-mono">${esc(c.codigo)}</b><span class="pill ${s.pill}">${s.etiqueta}</span></div>
        <small>${s.texto} · ${personas(c.personas_registradas)}</small>
      </div>
    </div>`;
}

function pintar(codigos) {
  const vigentes = codigos.filter((c) => situacion(c).grupo === 'vigentes');
  const historial = codigos.filter((c) => situacion(c).grupo === 'historial');
  document.getElementById('cod-vigentes').innerHTML = vigentes.map(filaVigente).join('')
    || '<p class="sub2 cod-vacio">Ningún código sirve en este momento: nadie puede registrarse. Cree uno arriba antes de la próxima capacitación.</p>';
  document.getElementById('cod-historial').innerHTML = historial.map(filaHistorial).join('') || '<p class="sub2">Todavía no hay códigos vencidos ni dados de baja.</p>';
  document.getElementById('cod-historial-n').textContent = `(${historial.length})`;

  document.querySelectorAll('#cod-vigentes [data-copiar]').forEach((b) => b.addEventListener('click', () => copiar(b)));
  document.querySelectorAll('#cod-vigentes [data-fechas]').forEach((b) => b.addEventListener('click', () => {
    const editor = document.querySelector(`[data-editor="${b.dataset.fechas}"]`);
    editor.hidden = !editor.hidden;
  }));
  document.querySelectorAll('#cod-vigentes .cod-editor').forEach((f) => {
    f.querySelector('[data-cancelar]').addEventListener('click', () => { f.hidden = true; f.reset(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desde = f.querySelector('[data-desde]').value;
      const hasta = f.querySelector('[data-hasta]').value;
      if (desde && hasta < desde) { alert('La fecha final no puede ser anterior a la inicial.'); return; }
      const r = await actualizarVigenciaCodigo(f.dataset.editor, { vigente_desde: desde ? inicioDeDiaSV(desde) : null, vigente_hasta: finDeDiaSV(hasta) });
      if (r.ok) await cargarCodigos();
      else alert('No se pudieron guardar las fechas: ' + r.error);
    });
  });
  document.querySelectorAll('#cod-vigentes [data-baja]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`¿Dar de baja el código ${b.dataset.codigo}?\n\nDesde ya nadie más podrá registrarse con él, y no se puede volver a crear. Quien ya se registró sigue igual.`)) return;
    b.disabled = true;
    const r = await revocarCodigo(b.dataset.baja);
    if (r.ok) await cargarCodigos();
    else { b.disabled = false; alert('No se pudo dar de baja: ' + r.error); }
  }));
}

async function copiar(boton) {
  try {
    await navigator.clipboard.writeText(boton.dataset.copiar);
    const original = boton.textContent;
    boton.textContent = 'Copiado';
    setTimeout(() => { boton.textContent = original; }, 1200);
  } catch {
    alert('No se pudo copiar. El código es: ' + boton.dataset.copiar);
  }
}

export async function cargarCodigos() {
  const r = await obtenerCodigos();
  if (!esVistaActiva('config')) return;
  if (!r.ok) {
    document.getElementById('cod-vigentes').innerHTML = `<p class="error-carga">No se pudieron cargar los códigos: ${esc(r.error)}</p>`;
    return;
  }
  pintar(r.data.codigos);
}

export function enlazarCodigos() {
  const form = document.getElementById('cod-form');
  const error = document.getElementById('cod-error');
  const recien = document.getElementById('cod-recien');

  async function crear(texto) {
    error.hidden = true;
    recien.hidden = true;
    const desde = document.getElementById('cod-desde').value;
    const hasta = document.getElementById('cod-hasta').value;
    if (!desde || !hasta) { error.textContent = 'Elija desde y hasta qué día sirve el código.'; error.hidden = false; return; }
    if (hasta < desde) { error.textContent = 'La fecha final no puede ser anterior a la inicial.'; error.hidden = false; return; }
    const boton = document.getElementById('cod-crear');
    boton.disabled = true;
    const r = await crearCodigo({ codigo: texto, vigente_desde: inicioDeDiaSV(desde), vigente_hasta: finDeDiaSV(hasta) });
    boton.disabled = false;
    if (!r.ok) { error.textContent = r.error; error.hidden = false; return; }
    document.getElementById('cod-texto').value = '';
    recien.innerHTML = `Listo. El código es <b class="codigo-mono">${esc(r.data.codigo)}</b> y sirve del ${fechaCorta(inicioDeDiaSV(desde))} al ${fechaCorta(finDeDiaSV(hasta))}.
      <button type="button" class="btn ghost chico" data-copiar="${esc(r.data.codigo)}">Copiar</button>`;
    recien.querySelector('[data-copiar]').addEventListener('click', (e) => copiar(e.currentTarget));
    recien.hidden = false;
    await cargarCodigos();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = document.getElementById('cod-texto').value.trim();
    if (!texto) { error.textContent = 'Escriba una palabra o frase, o toque "Inventar uno".'; error.hidden = false; return; }
    crear(texto);
  });
  // Sin texto: el servidor inventa uno que nunca se usó ("CEIBA ALTA 47").
  document.getElementById('cod-azar').addEventListener('click', () => crear(''));
}
