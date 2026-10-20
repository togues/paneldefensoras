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
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });

await paso('participacion_muestra_numeros_reales_sin_identificar_grupos_chicos', async () => {
  await p.click('.lat a[data-v="analisis"]');
  await p.waitForSelector('#a-p-kpis .kpi', { timeout: 8000 });
  const texto = await p.locator('#a-p-kpis').textContent();
  if (!/9/.test(texto)) throw new Error('no se vieron los 9 dispositivos activos de demo: ' + texto);
  // Con solo 3 dispositivos por comunidad, ningún grupo llega a 5 —
  // debe avisarlo, no mostrar una tabla vacía sin explicación.
  await p.waitForSelector('text=Ningún grupo llega todavía', { timeout: 4000 });
});

await paso('config_crea_una_cuenta_de_panel_nueva', async () => {
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('#cfg-usuarios .lista-item', { timeout: 8000 });
  await p.click('#cfg-mostrar-form-usuario');
  await p.fill('#cfg-u-nombre', 'Persona de Prueba');
  await p.fill('#cfg-u-correo', 'prueba-e2e@dev.local');
  await p.fill('#cfg-u-clave', 'clave-e2e-12345');
  await p.selectOption('#cfg-u-rol', 'operador');
  await p.click('#cfg-form-usuario button[type="submit"]');
  await p.waitForSelector('text=Persona de Prueba', { timeout: 8000 });
});

await paso('config_desactivar_la_cuenta_recien_creada', async () => {
  const fila = p.locator('.lista-item', { hasText: 'Persona de Prueba' });
  await fila.locator('[data-usuario-toggle]').click();
  await p.waitForTimeout(600);
  const chip = await fila.locator('small').textContent();
  // Tras desactivar sigue en la lista (nunca se borra), pero el botón cambia a "Reactivar".
  await p.waitForSelector('.lista-item:has-text("Persona de Prueba") [data-usuario-toggle][data-activo="false"]', { timeout: 4000 });
  void chip;
});

await paso('config_crea_comunidad_y_genera_codigo', async () => {
  await p.click('#cfg-mostrar-form-comunidad');
  await p.waitForFunction(() => document.getElementById('cfg-c-canton')?.options.length > 0, { timeout: 4000 });
  await p.fill('#cfg-c-nombre', 'Comunidad E2E de Prueba');
  await p.click('#cfg-form-comunidad button[type="submit"]');
  await p.waitForSelector('text=Comunidad E2E de Prueba', { timeout: 8000 });

  // Bloque scoped por data-comunidad-bloque (id real de la comunidad recién
  // creada) — nunca por texto, que puede matchear el div ancestro de
  // CUALQUIER comunidad (p. ej. "ADESCO El Zapote", el fixture compartido de
  // toda la suite de app/). Esto fue justo lo que revocó ZAP001 por error.
  const idComunidad = await p.locator('[data-comunidad-bloque]', { hasText: 'Comunidad E2E de Prueba' }).getAttribute('data-comunidad-bloque');
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  const codigos = await bloque.locator('.codigo-mono').count();
  if (codigos === 0) throw new Error('no se generó ningún código para la comunidad nueva');
});

await paso('config_revocar_codigo_lo_marca_como_revocado', async () => {
  const idComunidad = await p.locator('[data-comunidad-bloque]', { hasText: 'Comunidad E2E de Prueba' }).getAttribute('data-comunidad-bloque');
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque.locator('[data-revocar]').first().click();
  await p.waitForSelector('text=Comunidad E2E de Prueba', { timeout: 8000 });
  await bloque.locator('text=Revocado').waitFor({ timeout: 4000 });
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
