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

// Cada una debe ser autocontenida: Playwright serializa la función tal
// cual para correrla en la página, sin acceso a clausuras del lado Node.
function estaAbierta() {
  return document.getElementById('ayuda-overlay')?.classList.contains('on') === true;
}
function estaCerrada() {
  return document.getElementById('ayuda-overlay')?.classList.contains('on') !== true;
}

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });

await paso('boton_ayuda_en_login_abre_tarjeta_con_overline', async () => {
  await p.click('[data-ayuda="login"]');
  await p.waitForFunction(estaAbierta, { timeout: 4000 });
  const overline = await p.locator('.ayuda-overline').textContent();
  if (!overline.includes('Ingreso')) throw new Error('overline inesperada: ' + overline);
});

await paso('escape_cierra_la_tarjeta', async () => {
  await p.keyboard.press('Escape');
  await p.waitForFunction(estaCerrada, { timeout: 4000 });
});

await paso('click_afuera_tambien_cierra', async () => {
  await p.click('[data-ayuda="login"]');
  await p.waitForFunction(estaAbierta, { timeout: 4000 });
  await p.click('#ayuda-overlay', { position: { x: 5, y: 5 } });
  await p.waitForFunction(estaCerrada, { timeout: 4000 });
});

await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });

await paso('resumen_tiene_boton_de_ayuda', async () => {
  await p.waitForSelector('[data-ayuda="resumen"]', { timeout: 8000 });
});

await paso('mapa_boton_de_ayuda_abre_con_contenido_de_mapa', async () => {
  await p.click('.lat a[data-v="mapa"]');
  await p.waitForSelector('[data-ayuda="mapa"]', { timeout: 8000 });
  await p.click('[data-ayuda="mapa"]');
  await p.waitForFunction(estaAbierta, { timeout: 4000 });
  const texto = await p.locator('#ayuda-tarjeta').textContent();
  if (!texto.includes('centro de la comunidad')) throw new Error('no trajo el texto esperado de mapa: ' + texto);
  await p.click('[data-ayuda-cerrar]');
  await p.waitForFunction(estaCerrada, { timeout: 4000 });
});

await paso('casos_tiene_tres_botones_de_ayuda_distintos', async () => {
  await p.click('.lat a[data-v="casos"]');
  await p.waitForSelector('[data-ayuda="casos-filtros"]', { timeout: 8000 });
  await p.waitForSelector('[data-ayuda="casos-exportar"]', { timeout: 4000 });
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('[data-ayuda="casos-detalle"]', { timeout: 8000 });
  await p.click('[data-ayuda="casos-detalle"]');
  await p.waitForFunction(estaAbierta, { timeout: 4000 });
  const texto = await p.locator('#ayuda-tarjeta').textContent();
  if (!texto.includes('Descartar exige')) throw new Error('no trajo el texto esperado de gestión de caso: ' + texto);
  await p.click('[data-ayuda-cerrar]');
  await p.waitForFunction(estaCerrada, { timeout: 4000 });
  // Cierra también el detalle del caso (overlay distinto, #overlay) —
  // si no, tapa la barra lateral y las siguientes vistas no se pueden abrir.
  await p.click('#c-cerrar');
});

await paso('config_tiene_ayuda_en_usuarios_y_comunidades', async () => {
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('[data-ayuda="config-usuarios"]', { timeout: 8000 });
  await p.waitForSelector('[data-ayuda="config-comunidades"]', { timeout: 4000 });
});

await paso('analisis_tiene_ayuda_general_y_de_participacion', async () => {
  await p.click('.lat a[data-v="analisis"]');
  await p.waitForSelector('[data-ayuda="analisis"]', { timeout: 8000 });
  await p.waitForSelector('[data-ayuda="participacion"]', { timeout: 8000 });
});

await paso('salud_tiene_boton_de_ayuda', async () => {
  await p.click('.lat a[data-v="salud"]');
  await p.waitForSelector('[data-ayuda="salud"]', { timeout: 8000 });
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
