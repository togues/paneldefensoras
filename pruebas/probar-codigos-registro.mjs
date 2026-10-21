/* Códigos de registro (migración 012, docs/decision-08-codigo-de-registro.md).
   El código es una palabra o frase que solo controla quién se registra
   durante una ventana de fechas. No lleva comunidad.

   Recorre el circuito real: crear una frase en el panel → registrarse
   en la app escribiéndola distinto (minúsculas, sin tildes) → el
   teléfono queda sin comunidad → la frase no se puede volver a crear →
   vencerla la manda al historial y la app la rechaza → "Inventar uno" y
   "Dar de baja". También verifica que "hasta" termina a las 23:59:59
   de El Salvador y no de UTC (bug real encontrado el 2026-10-20).
   Al final borra de la base local lo que creó. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const b = await chromium.launch();
const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
p.on('dialog', (d) => d.accept());

const api = (ruta, opciones = {}) => p.evaluate(async ({ ruta, opciones }) => {
  const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
  const r = await fetch('http://localhost:8080/api/v1' + ruta, {
    ...opciones,
    headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
  });
  return { status: r.status, cuerpo: await r.json() };
}, { ruta, opciones });
const codigoPorTexto = async (texto) => (await api('/admin/codigos')).cuerpo.data.codigos.find((c) => c.codigo === texto);
const hoySV = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="config"]');
await p.waitForSelector('#cod-form', { timeout: 8000 });

const sufijo = String(Date.now()).slice(-6);
const frase = `Señal ${sufijo}`;
const normalizado = `SENAL ${sufijo}`;
const creados = [];

await paso('crear_una_frase_desde_el_panel', async () => {
  await p.fill('#cod-texto', frase);
  await p.click('#cod-crear');
  await p.waitForSelector('#cod-recien:not([hidden])', { timeout: 8000 });
  if (!(await p.locator('#cod-recien').textContent()).includes(normalizado)) throw new Error('el aviso no muestra el código normalizado');
  await p.waitForSelector(`#cod-vigentes .cod-item:has-text("${normalizado}")`, { timeout: 8000 });
  creados.push(normalizado);
});

await paso('la_misma_frase_no_se_puede_volver_a_crear', async () => {
  await p.fill('#cod-texto', normalizado.toLowerCase());
  await p.click('#cod-crear');
  await p.waitForSelector('#cod-error:not([hidden])', { timeout: 8000 });
  if (!/ya se usó/.test(await p.locator('#cod-error').textContent())) throw new Error('no avisó que el código ya se usó');
});

await paso('hasta_termina_a_las_23_59_59_de_el_salvador', async () => {
  const c = await codigoPorTexto(normalizado);
  // 23:59:59 en El Salvador (UTC-6) = 05:59:59 UTC del día siguiente.
  if (!/05:59:59\+00/.test(c.vigente_hasta)) throw new Error('vigente_hasta quedó mal: ' + c.vigente_hasta);
});

await paso('la_app_registra_con_la_frase_escrita_distinto_y_sin_comunidad', async () => {
  const contextoApp = await b.newContext();
  const a = await contextoApp.newPage();
  await a.goto('http://localhost:8902/index.html', { waitUntil: 'networkidle' });
  await a.click('[data-accion="seguir"]');
  await a.click('[data-accion="seguir"]');
  await a.fill('#codigo-comunidad', `senal   ${sufijo}`);
  await a.click('[data-accion="seguir"]');
  await a.waitForSelector('[data-alias]', { timeout: 6000 });
  await a.click('[data-alias]');
  await a.click('[data-accion="seguir"]'); // acá se valida contra el servidor
  await a.waitForSelector('[data-estructura]', { timeout: 8000 });
  await contextoApp.close();
  const c = await codigoPorTexto(normalizado);
  if (c.personas_registradas !== 1) throw new Error('personas_registradas = ' + c.personas_registradas);
  const comunidad = execFileSync('psql', ['-At', '-c',
    `SELECT COALESCE(d.comunidad_id::text, 'NULL') FROM dispositivo d WHERE d.codigo_comunidad_id = ${c.id}`], { env: process.env }).toString().trim();
  if (comunidad !== 'NULL') throw new Error('el teléfono quedó con comunidad ' + comunidad);
});

await paso('vencerlo_lo_manda_al_historial_y_la_app_lo_rechaza', async () => {
  const c = await codigoPorTexto(normalizado);
  await p.click('.lat a[data-v="resumen"]');
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector(`[data-fechas="${c.id}"]`, { timeout: 8000 });
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
  await p.click(`[data-fechas="${c.id}"]`);
  await p.fill(`[data-editor="${c.id}"] [data-desde]`, ayer);
  await p.fill(`[data-editor="${c.id}"] [data-hasta]`, ayer);
  await p.click(`[data-editor="${c.id}"] button[type=submit]`);
  await p.waitForSelector(`#cod-historial .cod-item:has-text("${normalizado}") .pill:has-text("Vencido")`, { state: 'attached', timeout: 8000 });
  if (await p.locator(`#cod-vigentes .cod-item:has-text("${normalizado}")`).count()) throw new Error('sigue en la lista de vigentes');
  const r = await p.evaluate(async (codigo) => (await fetch('http://localhost:8080/api/v1/dispositivos/enrolar', {
    method: 'POST', headers: { 'X-App-Secret': 'dev_secret_local', 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_comunidad: codigo, alias: 'RÍO CLARO' }),
  })).json(), normalizado);
  if (r.success || r.code !== 'CODIGO_NO_RECONOCIDO') throw new Error('el código vencido se aceptó: ' + JSON.stringify(r));
});

await paso('inventar_uno_y_darlo_de_baja', async () => {
  await p.fill('#cod-desde', hoySV());
  await p.click('#cod-azar');
  await p.waitForSelector('#cod-recien:not([hidden])', { timeout: 8000 });
  const inventado = (await p.locator('#cod-recien .codigo-mono').textContent()).trim();
  if (!/^[A-Z]+ [A-Z]+ \d{2}$/.test(inventado)) throw new Error('código inventado con forma rara: ' + inventado);
  creados.push(inventado);
  const c = await codigoPorTexto(inventado);
  await p.click(`[data-baja="${c.id}"]`);
  await p.waitForSelector(`#cod-historial .cod-item:has-text("${inventado}") .pill:has-text("Dado de baja")`, { state: 'attached', timeout: 8000 });
});

await paso('mas_de_20_caracteres_se_rechaza', async () => {
  const r = await api('/admin/codigos', { method: 'POST', body: JSON.stringify({ codigo: 'SALVEMOS EL PLANETA AZUL' }) });
  if (r.status !== 400) throw new Error('aceptó un código de más de 20 caracteres: ' + JSON.stringify(r.cuerpo));
});

await paso('configuracion_ya_no_tiene_comunidades', async () => {
  if (await p.locator('#cfg-mostrar-form-comunidad, [data-comunidad-bloque]').count()) throw new Error('sigue la sección de Comunidades');
  if (!(await p.locator('#cod-instructivo summary').textContent()).includes('Lea esto antes')) throw new Error('falta el instructivo');
});

// Limpieza: lo que esta prueba creó en la base local (nunca los fixtures).
if (creados.length) {
  const lista = creados.map((c) => `'${c}'`).join(',');
  execFileSync('psql', ['-At', '-c',
    `DELETE FROM dispositivo_estructura WHERE dispositivo_id IN (SELECT d.id FROM dispositivo d JOIN codigo_comunidad cc ON cc.id = d.codigo_comunidad_id WHERE cc.codigo IN (${lista}));
     DELETE FROM dispositivo WHERE codigo_comunidad_id IN (SELECT id FROM codigo_comunidad WHERE codigo IN (${lista}));
     DELETE FROM codigo_comunidad WHERE codigo IN (${lista});`], { env: process.env });
}

console.log(JSON.stringify(s, null, 2));
// 400 (más de 20), 409 (repetir) y 404 (código vencido) son los rechazos que la
// prueba provoca a propósito.
const inesperados = errores.filter((e) => !/status of (400|409|404)/.test(e));
console.log('errores de consola inesperados:', inesperados);
const ok = Object.values(s).every(Boolean) && inesperados.length === 0;
console.log(ok ? 'TODO OK' : 'FALLAS');
await b.close();
process.exit(ok ? 0 : 1);
