/* Salud de datos → "Anomalías para revisar" (vistas/salud-calidad.js,
   api/admin/calidad-datos.php): crea a propósito un caso con fecha del
   hecho en el futuro y relato corto, comprueba que las tarjetas lo
   cuentan y que se abre su ficha, que el operador no ve "uso
   sospechoso", y al final borra el caso creado. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const sql = (consulta) => execFileSync('psql', ['-At', '-c', consulta], { env: process.env }).toString().trim();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
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
const numero = async (clave) => Number(await p.locator(`[data-cal="${clave}"] b`).textContent());

// Caso de prueba: hecho "mañana" (imposible) y relato de 5 letras.
const uuid = sql('SELECT gen_random_uuid()');
const idCaso = sql(`INSERT INTO reporte (uuid_local, dispositivo_id, tipo_vulneracion_id, descripcion, fecha_incidente, precision_fecha, departamento_id)
  SELECT '${uuid}', (SELECT id FROM dispositivo ORDER BY id LIMIT 1), (SELECT id FROM tipo_vulneracion ORDER BY id LIMIT 1), 'corto', NOW() + INTERVAL '3 days', 'exacta', (SELECT id FROM departamento ORDER BY id LIMIT 1)
  RETURNING id`).split('\n')[0];
const folio = sql(`SELECT folio FROM reporte WHERE id = ${idCaso}`);

await entrar('marco@dev.local', 'prueba-dev-2026');

await paso('las_tarjetas_cuentan_el_caso', async () => {
  await p.click('.lat a[data-v="salud"]');
  await p.waitForSelector('[data-cal="fecha_imposible"]', { timeout: 10000 });
  if ((await numero('fecha_imposible')) < 1) throw new Error('no contó la fecha imposible');
  if ((await numero('relato_corto')) < 1) throw new Error('no contó el relato corto');
  if ((await p.locator('.cal-tarjeta').count()) !== 11) throw new Error('el administrador no ve las 11 tarjetas');
});

await paso('ver_casos_y_abrir_la_ficha', async () => {
  await p.click('[data-cal="fecha_imposible"]');
  await p.waitForSelector(`.cal-lista tr:has-text("${folio}")`, { timeout: 4000 });
  await p.click(`.cal-lista tr:has-text("${folio}")`);
  await p.waitForSelector(`#c-org-seguimiento, .det-head:has-text("${folio}")`, { timeout: 8000 });
  await p.keyboard.press('Escape');
});

await paso('el_operador_no_ve_uso_sospechoso', async () => {
  const sufijo = Date.now();
  const r = await p.evaluate(async (sufijo) => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/usuarios', {
      method: 'POST', headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Prueba calidad ' + sufijo, correo: `calidad-${sufijo}@dev.local`, clave: 'clave-calidad-12345', rol: 'operador' }),
    });
    return resp.json();
  }, sufijo);
  if (!r.success) throw new Error('no se creó el operador');
  await entrar(`calidad-${sufijo}@dev.local`, 'clave-calidad-12345');
  await p.click('.lat a[data-v="salud"]');
  await p.waitForSelector('[data-cal="fecha_imposible"]', { timeout: 10000 });
  if (await p.locator('[data-cal="muchos_reportes"], [data-cal="recuperaciones_altas"]').count()) throw new Error('el operador ve uso sospechoso');
  sql(`UPDATE usuario SET activo = FALSE WHERE correo = 'calidad-${sufijo}@dev.local'`);
});

// Limpieza: el caso creado (nunca los fixtures).
sql(`DELETE FROM seguimiento_caso WHERE reporte_id = ${idCaso}; DELETE FROM log_anomalia WHERE reporte_id = ${idCaso}; DELETE FROM reporte WHERE id = ${idCaso};`);

console.log(JSON.stringify(s, null, 2));
console.log('errores de consola inesperados:', errores);
const ok = Object.values(s).every(Boolean) && errores.length === 0;
console.log(ok ? 'TODO OK' : 'FALLAS');
await b.close();
process.exit(ok ? 0 : 1);
