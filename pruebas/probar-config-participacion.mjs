import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
// Revocar un código (y desactivar una comunidad) ahora piden
// confirmación — Playwright cancela un confirm() por su cuenta si
// nadie lo atiende, así que sin esto "revocar" nunca llegaría a
// pedírselo al servidor y la prueba fallaría en silencio.
p.on('dialog', (d) => d.accept());

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

// Con marca de tiempo también: "prueba-e2e@dev.local" fijo chocaba con
// la cuenta ya creada por una corrida anterior (correo UNIQUE en la
// base) — 409 Conflict visto de verdad en consola, 2026-10-20.
const SUFIJO_USUARIO_PRUEBA = Date.now();
const NOMBRE_USUARIO_PRUEBA = 'Persona de Prueba ' + SUFIJO_USUARIO_PRUEBA;

await paso('config_crea_una_cuenta_de_panel_nueva', async () => {
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('#cfg-usuarios .lista-item', { timeout: 8000 });
  await p.click('#cfg-mostrar-form-usuario');
  await p.fill('#cfg-u-nombre', NOMBRE_USUARIO_PRUEBA);
  await p.fill('#cfg-u-correo', `prueba-e2e-${SUFIJO_USUARIO_PRUEBA}@dev.local`);
  await p.fill('#cfg-u-clave', 'clave-e2e-12345');
  await p.selectOption('#cfg-u-rol', 'operador');
  await p.click('#cfg-form-usuario button[type="submit"]');
  await p.waitForSelector(`text=${NOMBRE_USUARIO_PRUEBA}`, { timeout: 8000 });
});

await paso('config_desactivar_la_cuenta_recien_creada', async () => {
  const fila = p.locator('.lista-item', { hasText: NOMBRE_USUARIO_PRUEBA });
  await fila.locator('[data-usuario-toggle]').click();
  await p.waitForTimeout(600);
  // Tras desactivar sigue en la lista (nunca se borra), pero el botón cambia a "Reactivar".
  await p.waitForSelector(`.lista-item:has-text("${NOMBRE_USUARIO_PRUEBA}") [data-usuario-toggle][data-activo="false"]`, { timeout: 4000 });
});

// Desde la migración 012 Configuración no tiene sección de Comunidades:
// la comunidad no es una unidad territorial (decision-08).
await paso('config_no_tiene_comunidades', async () => {
  if (await p.locator('#cfg-mostrar-form-comunidad, [data-comunidad-bloque]').count()) throw new Error('sigue la sección de Comunidades');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
