/* =====================================================================
   Vista Respaldos — puerto de la sección #v-respaldos de
   diseno/tablero_completo.html, con datos reales de GET/POST
   /admin/respaldos en vez del arreglo RESPALDOS fijo del mockup. La
   propia maqueta la marca "Punto crítico de seguridad" — es el motivo
   de todo este tramo de trabajo. Ver docs/decision-04-respaldos.md
   para el diseño completo (custodia de la clave, por qué "automático"
   es perezoso y no un cron real, por qué restaurar es un script de
   línea de comandos y no un botón acá).
   ===================================================================== */
import { obtenerRespaldos, generarRespaldo, actualizarConfiguracionRespaldos, descargarRespaldo } from '../data/api-client.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';

const ETIQ_METODO = { manual: 'Manual', automatico: 'Automático' };

function formatoFecha(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatoTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function esqueleto() {
  return `
    <div class="head">
      <div><h1>Respaldos ${botonAyuda('respaldos')}</h1><p id="r-resumen"></p></div>
      <div class="acciones"><button class="btn" id="r-generar">Generar respaldo ahora</button></div>
    </div>
    <div class="nota-demo"><b>Punto crítico de seguridad.</b> Un respaldo descargado sale del perímetro protegido de la plataforma y queda en un equipo o una memoria que ya nadie controla. Cada descarga se registra en bitácora.</div>
    <div id="r-generar-error" style="display:none" class="error-carga"></div>
    <div class="grid2">
      <div class="caja">
        <h2>Respaldos disponibles</h2><p class="sub" id="r-retencion-sub"></p>
        <div id="r-lista"></div>
      </div>
      <div>
        <div class="caja">
          <h2>Configuración de respaldos</h2><p class="sub">Frecuencia y retención.</p>
          <div class="regla">
            <div class="r1"><b>Respaldo automático semanal</b><div class="sw" id="r-sw-automatico"><i></i></div></div>
            <p id="r-automatico-texto"></p>
          </div>
          <div class="lista-item"><div class="li-t"><b>Cifrado</b><small>AES-256-GCM · clave en poder de REDNA</small></div><span class="li-a">Activo</span></div>
          <div class="lista-item">
            <div class="li-t"><b>Retención</b><small>Cuántos respaldos se conservan a la vez</small></div>
            <input type="number" min="1" max="50" id="r-retencion-input" class="campo-filtro" style="width:70px;text-align:center">
          </div>
          <div id="r-config-error" style="display:none;padding:8px 0" class="error-carga"></div>
        </div>
        <div class="caja"><h2>Bitácora</h2><div id="r-bitacora"></div></div>
      </div>
    </div>`;
}

function pintarLista(respaldos) {
  const cont = document.getElementById('r-lista');
  if (!respaldos.length) {
    cont.innerHTML = '<p class="sub2">Todavía no hay ningún respaldo generado.</p>';
    return;
  }
  cont.innerHTML = respaldos.map((r) => `
    <div class="lista-item">
      <div class="li-t">
        <b class="codigo-mono">${r.nombre_archivo}</b>
        <small>${formatoTamano(r.tamano_bytes)} · ${formatoFecha(r.generado_en)} · ${ETIQ_METODO[r.metodo] || r.metodo} · ${r.generado_por}</small>
      </div>
      <span class="li-a" data-descargar="${r.id}" data-nombre="${r.nombre_archivo}">Descargar</span>
    </div>`).join('');

  cont.querySelectorAll('[data-descargar]').forEach((el) => {
    el.addEventListener('click', async () => {
      const original = el.textContent;
      el.textContent = 'Descargando…';
      const r = await descargarRespaldo(el.dataset.descargar, el.dataset.nombre);
      el.textContent = r.ok ? original : 'Error, reintente';
    });
  });
}

function pintarConfig(config) {
  const sw = document.getElementById('r-sw-automatico');
  sw.classList.toggle('off', !config.automatico_activo);
  document.getElementById('r-automatico-texto').textContent = config.automatico_activo
    ? 'Activado — se genera uno nuevo la próxima vez que alguien entre a esta pantalla y ya haya pasado una semana desde el último.'
    : 'Desactivado. Se recomienda activarlo antes de que la plataforma quede en manos de REDNA.';
  document.getElementById('r-retencion-input').value = config.retencion;
  document.getElementById('r-retencion-sub').textContent = `Se conservan los últimos ${config.retencion}.`;
}

function pintarBitacora(bitacora) {
  const cont = document.getElementById('r-bitacora');
  if (!bitacora.length) {
    cont.innerHTML = '<p class="sub2">Sin actividad todavía.</p>';
    return;
  }
  cont.innerHTML = bitacora.map((e) => {
    const titulo = e.tipo === 'descargado'
      ? `Respaldo descargado — ${e.nombre_archivo}`
      : `Respaldo generado (${(ETIQ_METODO[e.metodo] || e.metodo).toLowerCase()}) — ${e.nombre_archivo}`;
    return `<div class="bit"><b>${titulo}</b><span>${e.usuario} · ${formatoFecha(e.fecha)}</span></div>`;
  }).join('');
}

async function cargarYPintar(raiz) {
  const r = await obtenerRespaldos();
  document.getElementById('r-cargando')?.remove();
  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar Respaldos: ${r.error} (${r.code}).</p>`);
    return;
  }
  document.getElementById('r-resumen').textContent = `${r.data.respaldos.length} respaldo${r.data.respaldos.length === 1 ? '' : 's'} disponible${r.data.respaldos.length === 1 ? '' : 's'}`;
  pintarLista(r.data.respaldos);
  pintarConfig(r.data.configuracion);
  pintarBitacora(r.data.bitacora);
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  raiz.insertAdjacentHTML('beforeend', '<p class="cargando" id="r-cargando">Cargando…</p>');

  await cargarYPintar(raiz);

  document.getElementById('r-generar').addEventListener('click', async () => {
    const boton = document.getElementById('r-generar');
    const error = document.getElementById('r-generar-error');
    error.style.display = 'none';
    boton.disabled = true;
    boton.textContent = 'Generando…';

    const r = await generarRespaldo();

    boton.disabled = false;
    boton.textContent = 'Generar respaldo ahora';

    if (!r.ok) {
      error.textContent = r.code === 'LIMITE_EXCEDIDO'
        ? 'Ya se generaron varios respaldos en la última hora. Espere un momento antes de generar otro.'
        : `${r.error} (${r.code})`;
      error.style.display = 'block';
      return;
    }
    await cargarYPintar(raiz);
  });

  document.getElementById('r-sw-automatico').addEventListener('click', async (e) => {
    const sw = e.currentTarget;
    const activarlo = sw.classList.contains('off'); // estaba apagado, se está por prender
    sw.classList.toggle('off');
    const r = await actualizarConfiguracionRespaldos({ automatico_activo: activarlo });
    if (r.ok) pintarConfig(r.data);
    else sw.classList.toggle('off'); // revierte si falló
  });

  document.getElementById('r-retencion-input').addEventListener('change', async (e) => {
    const error = document.getElementById('r-config-error');
    error.style.display = 'none';
    const valor = Number(e.currentTarget.value);
    const r = await actualizarConfiguracionRespaldos({ retencion: valor });
    if (!r.ok) {
      error.textContent = `${r.error} (${r.code})`;
      error.style.display = 'block';
      return;
    }
    pintarConfig(r.data);
    await cargarYPintar(raiz); // la retención pudo haber borrado respaldos sobrantes
  });
}
