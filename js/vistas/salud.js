/* =====================================================================
   Vista Salud — puerto de la sección #v-salud de
   diseno/tablero_completo.html, con GET /admin/salud (api_v1.md 4.4) en
   vez de los números fijos del mockup.

   A propósito, NO se completan los KPIs que el mockup mostraba y que
   acá no se pueden medir todavía: "Disponibilidad del mes" necesita un
   monitor que no existe, "Reportes en cola" es un dato que vive en el
   dispositivo (sincronizador.js), no en este servidor, y "último
   respaldo" no tiene de dónde salir hasta que POST /admin/respaldo
   exista (ver api/observatorio/admin/salud.php). Se ve honesto en vez
   de lleno.

   Marcar una anomalía como revisada (PATCH /admin/anomalias/{id}) es
   rol administrador, igual que Publicar en Casos.
   ===================================================================== */
import { obtenerSalud, marcarAnomaliaRevisada } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';
import { esqueletoCalidad, cargarCalidad } from './salud-calidad.js';

const ETIQ_TIPO_ANOMALIA = {
  caracteres_invalidos: 'Caracteres inválidos',
  duplicado: 'Posible duplicado',
  contenido_vacio: 'Contenido vacío',
  volumen_anormal: 'Volumen anormal',
  fuera_de_territorio: 'Fuera de territorio',
  filtro_contenido: 'Filtro de contenido',
};

function formatoFecha(iso) {
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatoRelativo(iso) {
  if (!iso) return 'nunca';
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

function esqueleto() {
  return `
    <div class="head"><div><h1>Salud de la plataforma y de los datos ${botonAyuda('salud')}</h1><p id="s-resumen"></p></div></div>
    <div class="kpis" id="s-kpis"></div>
    ${esqueletoCalidad()}
    <div class="grid2">
      <div class="caja">
        <h2>Estado de la plataforma</h2><p class="sub">Lo que se puede medir hoy desde el servidor.</p>
        <div id="s-plataforma"></div>
      </div>
      <div class="caja">
        <h2>Marcas automáticas al recibir</h2>
        <p class="sub">Lo que el sistema marcó al llegar cada reporte (caracteres raros, filtro de contenido). Una persona las revisa y las da por vistas.</p>
        <div id="s-anomalias"></div>
      </div>
    </div>`;
}

function pintarKpis(d) {
  document.getElementById('s-kpis').innerHTML = `
    <div class="kpi ${d.datos.anomalias_sin_revisar > 0 ? 'rojo' : ''}"><b>${d.datos.anomalias_sin_revisar}</b><span>Anomalías sin revisar</span></div>
    <div class="kpi"><b style="font-size:20px">${formatoRelativo(d.servicio.ultima_sync)}</b><span>Última sincronización recibida</span></div>`;
}

function pintarPlataforma(d) {
  const filas = [
    {
      sem: 's-ok',
      t: 'Base de datos',
      small: 'Si esta pantalla cargó, es que conecta',
      v: d.servicio.estado === 'ok' ? 'OK' : d.servicio.estado
    },
    {
      sem: d.respaldo.ultimo ? 's-ok' : 's-am',
      t: 'Respaldos',
      small: d.respaldo.ultimo ? `Último: ${formatoFecha(d.respaldo.ultimo)}` : 'Todavía no se ha generado ninguno — ver Respaldos',
      v: d.respaldo.ultimo ? formatoRelativo(d.respaldo.ultimo) : 'Ninguno'
    },
    {
      sem: 's-ok',
      t: 'Catálogo',
      small: 'Versión actual, calculada del contenido',
      v: d.catalogo.version
    }
  ];
  document.getElementById('s-plataforma').innerHTML = filas.map((f) => `
    <div class="sfila"><i class="sem ${f.sem}"></i><span class="t">${f.t}<small>${f.small}</small></span><span class="v">${f.v}</span></div>`).join('');
}

function pintarAnomalias(lista) {
  const cont = document.getElementById('s-anomalias');
  const esAdministrador = sesion.usuarioActual()?.rol === 'administrador';

  if (!lista.length) {
    cont.innerHTML = '<p class="sub2">No hay anomalías pendientes de revisión.</p>';
    return;
  }

  cont.innerHTML = lista.map((a) => `
    <div class="sfila">
      <i class="sem s-am"></i>
      <span class="t">${ETIQ_TIPO_ANOMALIA[a.tipo_anomalia] || a.tipo_anomalia}<small>${a.folio || '—'} · ${formatoFecha(a.detectado_en)}</small></span>
      <span class="v">${esAdministrador ? `<span class="btn chico ghost" data-revisar="${a.id}">Marcar revisada</span>` : 'Ver en Casos'}</span>
    </div>`).join('');

  cont.querySelectorAll('[data-revisar]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      boton.textContent = 'Guardando…';
      const r = await marcarAnomaliaRevisada(boton.dataset.revisar);
      if (!r.ok) {
        boton.textContent = 'Error, reintente';
        return;
      }
      await montar(document.getElementById('contenido'));
    });
  });
}

export async function montar(raiz) {
  raiz.innerHTML = esqueleto();
  raiz.insertAdjacentHTML('beforeend', '<p class="cargando" id="s-cargando">Cargando…</p>');

  const r = await obtenerSalud();
  document.getElementById('s-cargando')?.remove();

  if (!r.ok) {
    raiz.insertAdjacentHTML('beforeend', `<p class="error-carga">No se pudo cargar Salud: ${r.error} (${r.code}).</p>`);
    return;
  }

  document.getElementById('s-resumen').textContent = `Última sincronización ${formatoRelativo(r.data.servicio.ultima_sync)}`;
  pintarKpis(r.data);
  pintarPlataforma(r.data);
  pintarAnomalias(r.data.anomalias_sin_revisar_detalle);
  await cargarCalidad();
}
