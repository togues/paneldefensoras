import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

const s = {};
async function paso(nombre, fn) {
  try {
    await fn();
    s[nombre] = true;
  } catch (e) {
    s[nombre] = false;
    console.error(`FALLO en "${nombre}":`, e.message);
  }
}

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });

// Desde que /admin/* exige sesión real (lib/PanelAuth.php), toda prueba
// del panel empieza con login — cuenta de prueba creada a mano en dev,
// ver docs/08-despliegue.md para el equivalente de producción.
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="casos"]');

await paso('tabla_muestra_los_25_casos_de_demo', async () => {
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  const resumen = await p.locator('#c-resumen').textContent();
  if (!resumen.includes('25 reportes')) throw new Error('resumen inesperado: ' + resumen);
});

await paso('filtro_cerrados_reduce_y_cambia_el_resumen', async () => {
  await p.click('.filtro[data-e="cerrado"]');
  await p.waitForTimeout(400);
  const resumen = await p.locator('#c-resumen').textContent();
  if (!/^\d+ reportes?$/.test(resumen.trim())) throw new Error('resumen inesperado: ' + resumen);
  const filas = await p.locator('#c-tabla tr[data-id]').count();
  const pills = await p.locator('#c-tabla .pill.p-c').count();
  if (pills !== filas) throw new Error('con el filtro "cerrados" no todas las filas muestran el estado Cerrado');
});

await paso('filtro_anomalos_muestra_exactamente_dos', async () => {
  await p.click('.filtro[data-e="anomalo"]');
  await p.waitForTimeout(400);
  const resumen = await p.locator('#c-resumen').textContent();
  if (!resumen.includes('2 reportes')) throw new Error('esperaba 2 anómalos, resumen: ' + resumen);
});

await paso('volver_a_todos_muestra_25_de_nuevo', async () => {
  await p.click('.filtro[data-e="todos"]');
  await p.waitForTimeout(400);
  const resumen = await p.locator('#c-resumen').textContent();
  if (!resumen.includes('25 reportes')) throw new Error('resumen inesperado: ' + resumen);
});

await paso('clic_en_fila_abre_el_detalle_con_datos_reales', async () => {
  const folioEsperado = (await p.locator('#c-tabla tr[data-id]').first().locator('.folio').textContent()).trim();
  await p.locator('#c-tabla tr[data-id]').first().click();
  await p.waitForSelector('#overlay.on', { timeout: 4000 });
  await p.waitForSelector('.det-head h2', { timeout: 4000 });
  const titulo = await p.locator('.det-head h2').textContent();
  if (!titulo.includes(folioEsperado)) throw new Error(`el detalle abrió otro caso: esperaba ${folioEsperado}, título fue "${titulo}"`);
  const relato = await p.locator('.relato').textContent();
  if (relato.trim() === '""') throw new Error('el relato llegó vacío');
});

await paso('cerrar_detalle_con_el_boton', async () => {
  await p.click('#c-cerrar');
  await p.waitForTimeout(300);
  const abierto = await p.locator('#overlay.on').count();
  if (abierto !== 0) throw new Error('el overlay no se cerró');
});

await paso('cerrar_detalle_tocando_fuera', async () => {
  await p.locator('#c-tabla tr[data-id]').first().click();
  await p.waitForSelector('#overlay.on', { timeout: 4000 });
  await p.click('#overlay', { position: { x: 5, y: 5 } });
  await p.waitForTimeout(300);
  const abierto = await p.locator('#overlay.on').count();
  if (abierto !== 0) throw new Error('tocar fuera del recuadro no cerró el detalle');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
