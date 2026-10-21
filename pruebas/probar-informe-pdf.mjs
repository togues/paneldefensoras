/* =====================================================================
   Informe de seguimiento en PDF y organización responsable del
   seguimiento (migración 011, docs/decision-07-informe-seguimiento.md).
   Recorre el circuito real: asignar en lote desde Casos → asignar uno
   desde la ficha → filtrar el tablero por organización → vista previa →
   descargar el PDF. Revisa los BYTES del PDF (sin metadatos) y que la
   API del informe nunca traiga relato, lugar ni coordenadas. Al final
   deshace la asignación que hizo.
   ===================================================================== */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const COMUNIDAD = 'DEMO — ADESCO Los Naranjos';
const b = await chromium.launch();
const contexto = await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const p = await contexto.newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
p.on('dialog', (d) => d.accept());

const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}
async function entrar(correo, clave) {
  await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.removeItem('panel_sesion'); sessionStorage.clear(); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.fill('#login-correo', correo);
  await p.fill('#login-clave', clave);
  await p.click('#login-boton');
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
}
const api = (ruta, opciones = {}) => p.evaluate(async ({ ruta, opciones }) => {
  const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
  const r = await fetch('http://localhost:8080/api/v1' + ruta, {
    ...opciones,
    headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
  });
  return { status: r.status, cuerpo: await r.json() };
}, { ruta, opciones });
const resumenCasos = async () => {
  await p.waitForFunction(() => /reporte/.test(document.getElementById('c-resumen')?.textContent || ''));
  return Number((await p.locator('#c-resumen').textContent()).trim().split(' ')[0]);
};

await entrar('marco@dev.local', 'prueba-dev-2026');
let idMesa;
let idJunta;
let asignados;

await paso('asignar_en_lote_desde_casos', async () => {
  await p.click('.lat a[data-v="casos"]');
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  const sinFiltro = await resumenCasos();
  await p.selectOption('#c-comunidad', { label: COMUNIDAD });
  // Esperar a que la tabla refleje el filtro nuevo, no leer el total viejo.
  await p.waitForFunction((n) => !document.getElementById('c-resumen').textContent.startsWith(n + ' '), sinFiltro, { timeout: 8000 });
  asignados = await resumenCasos();
  await p.click('#c-abrir-asignar');
  idMesa = await p.locator('#c-asignar-org option', { hasText: 'Mesa Territorial' }).getAttribute('value');
  idJunta = await p.locator('#c-asignar-org option', { hasText: 'Junta de Agua' }).getAttribute('value');
  await p.selectOption('#c-asignar-org', idMesa);
  await p.click('#c-asignar-confirmar');
  await p.waitForFunction(() => /asignado/.test(document.getElementById('c-resumen').textContent), { timeout: 8000 });
  const filas = await p.locator('#c-tabla tr[data-id]:has-text("Mesa Territorial")').count();
  if (filas !== asignados) throw new Error(`esperaba ${asignados} filas con "Mesa Territorial", hay ${filas}`);
});

await paso('asignar_uno_desde_la_ficha_queda_en_la_bitacora', async () => {
  await p.locator('#c-tabla tr[data-id]').first().click();
  await p.waitForSelector('#c-org-seguimiento', { timeout: 8000 });
  if ((await p.locator('#c-org-seguimiento').inputValue()) !== idMesa) throw new Error('la ficha no mostró la asignación en lote');
  const antes = await p.locator('.bit:has-text("Asignó el seguimiento a Junta de Agua")').count();
  await p.selectOption('#c-org-seguimiento', idJunta);
  await p.click('#c-guardar');
  // La entrada NUEVA (el caso puede traer una igual de corridas anteriores).
  await p.waitForFunction((n) => document.querySelectorAll('.bit').length && [...document.querySelectorAll('.bit')]
    .filter((b) => b.textContent.includes('Asignó el seguimiento a Junta de Agua')).length > n, antes, { timeout: 8000 });
  await p.click('#c-cerrar');
});

await paso('el_tablero_filtra_por_organizacion_y_coincide', async () => {
  await p.click('.lat a[data-v="analisis"]');
  await p.waitForSelector('#a-organizaciones .barra', { timeout: 10000 });
  await p.click('#af-periodo [data-periodo="365"]');
  await p.selectOption('#af-comunidad', { label: COMUNIDAD });
  await p.selectOption('#af-organizacion', idMesa);
  await p.waitForFunction(() => !document.getElementById('a-tablero').classList.contains('actualizando'), { timeout: 10000 });
  const total = Number((await p.locator('#a-kpis .kpi b').first().textContent()).trim());
  if (total !== asignados - 1) throw new Error(`a la Mesa le quedan ${asignados - 1} y el tablero dice ${total}`);
});

await paso('la_api_del_informe_nunca_trae_relato_ni_ubicacion', async () => {
  const r = await api(`/admin/informe?organizacion_seguimiento_id=${idMesa}`);
  const claves = new Set(r.cuerpo.data.casos.flatMap((c) => Object.keys(c)));
  for (const prohibida of ['descripcion', 'referencia_lugar', 'entidad_mencionada', 'lat', 'lon', 'geom', 'coordenada_exacta', 'evidencias_ids', 'id']) {
    if (claves.has(prohibida)) throw new Error('el informe trae ' + prohibida);
  }
  const notasSistema = r.cuerpo.data.casos.flatMap((c) => c.actuado).filter((a) => /Asignó el seguimiento|Eliminó una fotografía|Publicado al muro/.test(a.nota || ''));
  if (notasSistema.length) throw new Error('"lo actuado" incluye notas automáticas del sistema');
});

await paso('vista_previa_y_pdf_sin_metadatos', async () => {
  await p.click('#af-informe');
  await p.waitForSelector('#inf-descargar', { timeout: 10000 });
  const destinatario = await p.locator('#inf-destinatario').inputValue();
  if (destinatario !== 'Mesa Territorial') throw new Error('el destinatario no se completó con la organización del filtro: ' + destinatario);
  const enLista = await p.locator('#inf-lista .inf-caso').count();
  if (enLista !== asignados - 1) throw new Error(`la vista previa lista ${enLista} casos`);
  await p.fill('#inf-destinatario', 'Mesa Territorial de Los Naranjos');
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#inf-descargar')]);
  const bytes = await readFile(await descarga.path());
  const texto = bytes.toString('latin1');
  if (!texto.startsWith('%PDF-')) throw new Error('no es un PDF');
  if (texto.includes('/ObjStm')) throw new Error('el PDF usa object streams: no se puede verificar a simple vista');
  for (const metadato of ['/Info', '/Producer', '/Creator', '/CreationDate', '/ModDate', '/Author', '/Title', '/Subject', '/Keywords', '/Metadata', '<x:xmpmeta']) {
    if (texto.includes(metadato)) throw new Error('el PDF lleva metadato ' + metadato);
  }
  const paginas = (texto.match(/\/Type \/Page\b/g) || []).length;
  if (paginas < 1) throw new Error('el PDF no tiene páginas');
  if (!/^informe-seguimiento-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.pdf$/.test(descarga.suggestedFilename())) throw new Error('nombre de archivo inesperado: ' + descarga.suggestedFilename());
  await p.click('#inf-cancelar');
});

await paso('operador_no_puede_asignar_en_lote_ni_pedir_el_informe', async () => {
  const sufijo = Date.now();
  const r = await api('/admin/usuarios', { method: 'POST', body: JSON.stringify({ nombre: 'Prueba informe ' + sufijo, correo: `informe-op-${sufijo}@dev.local`, clave: 'clave-informe-12345', rol: 'operador' }) });
  if (!r.cuerpo.success) throw new Error('no se creó el operador: ' + JSON.stringify(r.cuerpo));
  await entrar(`informe-op-${sufijo}@dev.local`, 'clave-informe-12345');
  const informe = await api('/admin/informe');
  const lote = await api('/admin/casos-asignar', { method: 'POST', body: JSON.stringify({ filtros: {}, organizacion_seguimiento_id: null, esperados: 0 }) });
  if (informe.status !== 403 || lote.status !== 403) throw new Error(`esperaba 403 y 403, llegó ${informe.status} y ${lote.status}`);
  await entrar('marco@dev.local', 'prueba-dev-2026');
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('#cfg-usuarios .lista-item', { timeout: 8000 });
  await p.locator('.lista-item', { hasText: 'Prueba informe ' + sufijo }).locator('[data-usuario-toggle]').click();
  await p.waitForTimeout(400);
});

await paso('limpieza_quitar_la_asignacion_hecha', async () => {
  const filtros = { comunidad_id: (await api('/admin/analisis?solo_opciones=1')).cuerpo.data.opciones.comunidades.find((c) => c.nombre === COMUNIDAD).id };
  const n = (await api('/admin/casos?por_pagina=1&comunidad_id=' + filtros.comunidad_id)).cuerpo.data.total;
  const r = await api('/admin/casos-asignar', { method: 'POST', body: JSON.stringify({ filtros, organizacion_seguimiento_id: null, esperados: n }) });
  if (!r.cuerpo.success) throw new Error(JSON.stringify(r.cuerpo));
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const inesperados = errores.filter((e) => !/Failed to load resource.*403/.test(e));
console.log('errores de consola inesperados:', inesperados);
console.log(fallas.length === 0 && inesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));
await b.close();
process.exit(fallas.length === 0 && inesperados.length === 0 ? 0 : 1);
