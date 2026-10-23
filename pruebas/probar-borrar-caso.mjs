/* Borrar un caso entero desde el panel (admin/casos.php, DELETE). Crea
   su PROPIO reporte con foto desde la app comunitaria —con un relato
   único, para no tocar los casos de las otras pruebas— y lo borra:
   el botón no se activa hasta escribir el folio exacto, y después el
   caso no aparece ni en la tabla, ni en la base, ni su foto en disco. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const LIMPIA_B64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
if (!existsSync('/tmp/limpia.jpg')) writeFileSync('/tmp/limpia.jpg', Buffer.from(LIMPIA_B64, 'base64'));
const RELATO = 'Prueba de borrar caso ' + Date.now();
const sql = (q) => execFileSync('psql', ['-Atc', q], {
  env: { ...process.env, PGHOST: 'localhost', PGPORT: '5433', PGDATABASE: 'observatorio', PGUSER: 'observatorio', PGPASSWORD: 'observatorio_dev' }
}).toString().trim();

const b = await chromium.launch();
const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

// --- Un reporte real con una foto, desde la app ---
const app = await (await b.newContext({ permissions: [] })).newPage();
await app.goto('http://localhost:8902/index.html', { waitUntil: 'networkidle' });
await app.click('[data-accion="seguir"]');
await app.click('[data-accion="seguir"]');
await app.fill('#codigo-comunidad', 'ZAP001');
await app.click('[data-accion="seguir"]');
await app.waitForSelector('[data-alias]');
await app.click('[data-alias]');
await app.click('[data-accion="seguir"]');
await app.waitForSelector('.volanta', { timeout: 8000 });
await app.click('[data-estructura="nd"]');
await app.click('[data-sexo="mujer"]');
await app.click('[data-accion="seguir"]');
await app.waitForSelector('[data-clave="sin"]');
await app.click('[data-clave="sin"]');
await app.click('[data-accion="seguir"]');
await app.waitForSelector('.codigo', { timeout: 8000 });
await app.click('[data-accion="terminar"]');
await app.waitForSelector('.cabecera__alias', { timeout: 8000 });
await app.click('[data-accion="reportar"]');
await app.click('[data-familia="territorio"]');
await app.waitForSelector('[data-tipo]', { timeout: 8000 });
await app.click('[data-tipo]');
await app.waitForSelector('[data-departamento]', { timeout: 8000 });
await app.locator('[data-departamento]').nth(2).click();
await app.click('[data-accion="seguir"]');
await app.waitForSelector('[data-cuando="hoy"]', { timeout: 8000 });
await app.click('[data-cuando="hoy"]');
await app.click('[data-accion="seguir"]');
await app.waitForSelector('#relato', { timeout: 8000 });
await app.fill('#relato', RELATO);
await app.waitForTimeout(300);
await app.click('[data-accion="seguir"]');
await app.click('[data-accion="agregar-foto"]');
await app.setInputFiles('#entrada-foto', '/tmp/limpia.jpg');
await app.waitForSelector('.foto img', { timeout: 8000 });
await app.click('[data-accion="seguir"]');
await app.waitForSelector('h2:has-text("Revise antes de enviar")', { timeout: 8000 });
await app.click('[data-accion="enviar"]');
await app.waitForSelector('.enviado__folio', { timeout: 15000 });
const folio = (await app.textContent('.enviado__folio')).trim();
const id = sql(`SELECT id FROM reporte WHERE folio = '${folio}'`);
const ruta = sql(`SELECT ruta_archivo FROM evidencia WHERE reporte_id = ${id}`);

// --- Desde el panel ---
const p = await b.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="casos"]');
await p.fill('#c-buscar', RELATO);
await p.waitForTimeout(1200);
await p.click('#c-tabla tr[data-id]');
await p.waitForSelector('#c-borrar-folio', { timeout: 8000 });

await paso('el_boton_no_se_activa_sin_el_folio_exacto', async () => {
  if (!(await p.locator('#c-borrar').isDisabled())) throw new Error('activo sin escribir nada');
  await p.fill('#c-borrar-folio', folio.slice(0, -1));
  if (!(await p.locator('#c-borrar').isDisabled())) throw new Error('activo con el folio incompleto');
});

await paso('con_el_folio_exacto_borra_el_caso', async () => {
  await p.fill('#c-borrar-folio', folio);
  await p.click('#c-borrar');
  await p.waitForSelector('#overlay:not(.on)', { state: 'attached', timeout: 8000 });
  await p.waitForTimeout(1200);
  if (await p.locator('#c-tabla tr[data-id]').count()) throw new Error('el caso sigue en la tabla');
});

await paso('no_queda_en_la_base', async () => {
  const quedan = sql(`SELECT (SELECT count(*) FROM reporte WHERE id = ${id}) + (SELECT count(*) FROM evidencia WHERE reporte_id = ${id}) + (SELECT count(*) FROM seguimiento_caso WHERE reporte_id = ${id})`);
  if (quedan !== '0') throw new Error('quedan filas: ' + quedan);
});

await paso('la_foto_no_queda_en_disco', async () => {
  const salida = execFileSync('docker', ['compose', '--env-file', '.env.dev', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'api',
    'sh', '-c', `test -e /var/www/html/api/v1/var/${ruta} && echo queda || echo borrada`]).toString().trim();
  if (salida !== 'borrada') throw new Error('el archivo sigue en disco');
});

if (errores.length) console.error('errores de página:', errores);
const fallas = Object.entries(s).filter(([, ok]) => !ok);
console.log(fallas.length ? 'FALLAS: ' + JSON.stringify(fallas) : 'TODO OK');
await b.close();
