/* =====================================================================
   Vista previa y descarga del informe de seguimiento en PDF — se abre
   desde el tablero de Análisis con los filtros que estén activos (solo
   administrador). Ver core/pdf-informe.js y
   docs/decision-07-informe-seguimiento.md.

   La vista previa existe para que nadie entregue un documento sin
   haberlo visto: muestra exactamente qué casos y qué anotaciones van a
   salir del panel, y avisa si el informe no está acotado a una
   organización (el uso normal es "los casos que le tocan a la Junta de
   Agua de esta comunidad").
   ===================================================================== */
import { obtenerAnalisis, obtenerInforme } from '../data/api-client.js';
import { cargarPdfLib } from '../core/cargador-librerias.js';
import { construirInformePdf } from '../core/pdf-informe.js';
import { NOMBRE_FAMILIA, ETIQ_ESTADO, CLASE_ESTADO, esc, diaLegible } from '../core/graficas.js';

let datos = null;
let pedido = 0;

function modal() {
  let m = document.getElementById('informe-modal');
  if (!m) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="informe-modal" role="dialog" aria-modal="true" aria-labelledby="inf-titulo" hidden>
        <div class="modal-caja">
          <div class="det-head">
            <div><h2 id="inf-titulo">Informe de seguimiento (PDF)</h2><p>Vista previa de lo que va a salir del panel.</p></div>
            <button class="cerrar" type="button" id="inf-cerrar" aria-label="Cerrar"><svg class="i"><use href="#i-cerrar"/></svg></button>
          </div>
          <div id="inf-cuerpo"></div>
        </div>
      </div>`);
    m = document.getElementById('informe-modal');
    m.addEventListener('click', (e) => { if (e.target === m) cerrar(); });
    document.getElementById('inf-cerrar').addEventListener('click', cerrar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) cerrar(); });
  }
  return m;
}

function cerrar() {
  pedido++;
  document.getElementById('informe-modal').hidden = true;
  datos = null;
}

function pintarVistaPrevia({ parametros, filtrosTexto, opciones }) {
  const { tablero, casos } = datos;
  const k = tablero.kpis;
  const orgFiltro = parametros.organizacion_seguimiento_id;
  const orgPorDefecto = orgFiltro && orgFiltro !== 'sin_asignar'
    ? (opciones.organizaciones || []).find((o) => String(o.id) === String(orgFiltro))?.nombre || ''
    : '';
  const conNotas = casos.filter((c) => c.actuado.length).length;

  document.getElementById('inf-cuerpo').innerHTML = `
    ${!orgFiltro || orgFiltro === 'sin_asignar' ? `
      <div class="alerta amb"><b>Este informe no está acotado a una organización.</b>
        <p>Incluye casos ${orgFiltro === 'sin_asignar' ? 'que todavía nadie asignó' : 'de cualquier organización de seguimiento'}. Para entregarle a una organización solo lo que le toca, cierre esto y elija "Seguimiento" en los filtros del tablero.</p></div>` : ''}
    <div class="inf-fila">
      <div class="campo-grupo" style="flex:1">
        <label for="inf-destinatario">Para (aparece en la portada)</label>
        <input id="inf-destinatario" class="campo-filtro" value="${esc(orgPorDefecto)}" placeholder="Ej.: Junta de Agua de El Zapote" maxlength="120">
      </div>
    </div>
    <p class="sub2"><b>Período:</b> del ${diaLegible(tablero.periodo.desde)} al ${diaLegible(tablero.periodo.hasta)}${filtrosTexto.length ? ' · ' + filtrosTexto.map(esc).join(' · ') : ''}</p>
    <div class="kpis inf-kpis">
      <div class="kpi"><b>${k.total}</b><span>Casos</span></div>
      <div class="kpi"><b>${k.sin_revisar}</b><span>Sin revisar</span></div>
      <div class="kpi"><b>${k.en_investigacion}</b><span>En investigación</span></div>
      <div class="kpi"><b>${k.alta_prioridad}</b><span>Prioridad alta</span></div>
    </div>
    <label class="interruptor-fila">
      <input type="checkbox" id="inf-actuado" checked>
      <span><b>Incluir "lo actuado"</b> — las anotaciones de seguimiento de REDNA (${conNotas} de ${casos.length} casos tienen alguna).
      Se escribieron para uso interno: revíselas abajo antes de entregar el documento.</span>
    </label>
    <div class="inf-lista" id="inf-lista">
      ${casos.length ? casos.map((c) => `
        <div class="inf-caso">
          <div><b>${esc(c.folio)}</b> · ${esc(c.tipo)} <span class="pill ${CLASE_ESTADO[c.estado] || 'p-i'}">${ETIQ_ESTADO[c.estado] || esc(c.estado)}</span></div>
          <div class="sub2">${diaLegible(c.fecha)} · ${NOMBRE_FAMILIA[c.familia] || esc(c.familia)} · ${esc(c.comunidad || '')}</div>
          <div class="inf-actuado">${c.actuado.map((a) => `<div>${diaLegible(a.fecha, { day: 'numeric', month: 'short' })} — ${a.estado_nuevo ? 'Pasó a ' + (ETIQ_ESTADO[a.estado_nuevo] || esc(a.estado_nuevo)) + '. ' : ''}${esc(a.nota || '')}</div>`).join('') || '<div class="sub2">Sin anotaciones.</div>'}</div>
        </div>`).join('') : '<p class="sub2">No hay casos con estos filtros.</p>'}
    </div>
    <p class="sub2">No incluye relatos, lugares exactos, fotografías ni coordenadas. El PDF se arma en este navegador, sin metadatos, y no queda copia en el servidor.</p>
    <div id="inf-error" class="error-carga" hidden></div>
    <div class="acciones" style="justify-content:flex-end">
      <button type="button" class="btn ghost" id="inf-cancelar">Cancelar</button>
      <button type="button" class="btn" id="inf-descargar" ${casos.length ? '' : 'disabled'}>Descargar PDF</button>
    </div>`;

  document.getElementById('inf-cancelar').addEventListener('click', cerrar);
  document.getElementById('inf-actuado').addEventListener('change', (e) => {
    document.getElementById('inf-lista').classList.toggle('sin-actuado', !e.target.checked);
  });
  document.getElementById('inf-descargar').addEventListener('click', (e) => descargar(e.currentTarget, { parametros, filtrosTexto }));
}

async function descargar(boton, { parametros, filtrosTexto }) {
  const error = document.getElementById('inf-error');
  error.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Armando el PDF…';
  try {
    await cargarPdfLib();
    const bytes = await construirInformePdf({
      destinatario: document.getElementById('inf-destinatario').value.trim(),
      filtrosTexto,
      tablero: datos.tablero,
      casos: datos.casos,
      incluirActuado: document.getElementById('inf-actuado').checked,
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    // Nombre genérico: el nombre del archivo también viaja con él.
    enlace.download = `informe-seguimiento-${parametros.desde || 'inicio'}-a-${parametros.hasta}.pdf`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    boton.textContent = 'Descargado';
    setTimeout(() => { boton.textContent = 'Descargar PDF'; boton.disabled = false; }, 1500);
  } catch (err) {
    error.textContent = 'No se pudo armar el PDF: ' + (err?.message || err);
    error.hidden = false;
    boton.textContent = 'Descargar PDF';
    boton.disabled = false;
  }
}

/** Abre la vista previa con los filtros actuales del tablero. */
export async function abrirInforme({ parametros, filtrosTexto, opciones }) {
  const m = modal();
  m.hidden = false;
  document.getElementById('inf-cuerpo').innerHTML = '<p class="cargando">Preparando la vista previa…</p>';
  const miPedido = ++pedido;
  // La librería de PDF se empieza a bajar ya, en paralelo, para que
  // "Descargar" no tenga que esperarla.
  cargarPdfLib().catch(() => {});
  const [tablero, informe] = await Promise.all([obtenerAnalisis(parametros), obtenerInforme(parametros)]);
  if (miPedido !== pedido) return; // se cerró mientras tanto
  if (!tablero.ok || !informe.ok) {
    const r = !informe.ok ? informe : tablero;
    document.getElementById('inf-cuerpo').innerHTML = `<p class="error-carga">${esc(r.error)}</p>`;
    return;
  }
  datos = { tablero: tablero.data, casos: informe.data.casos };
  pintarVistaPrevia({ parametros, filtrosTexto, opciones });
  document.getElementById('inf-destinatario').focus();
}
