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

await paso('el_caso_con_evidencia_real_muestra_la_miniatura', async () => {
  await p.click('.lat a[data-v="casos"]');
  // El caso con evidencia real es el folio del reporte de prueba de
  // ZAP001 (app/pruebas/e2e/probar-reportar.mjs) — se busca por texto
  // libre en vez de asumir su posición en la tabla.
  await p.fill('#c-buscar', 'Contaminaron el agua del río con desechos');
  await p.waitForTimeout(500);
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('.fotito[data-foto]', { timeout: 8000 });
  await p.waitForFunction(() => {
    const b = document.querySelector('.fotito[data-foto]');
    return b && !b.classList.contains('cargando-foto');
  }, { timeout: 8000 });
  const tieneUrl = await p.evaluate(() => !!document.querySelector('.fotito[data-foto]')?.dataset.fotoUrl);
  if (!tieneUrl) throw new Error('la miniatura no terminó de cargar una URL real');
});

await paso('tocar_la_miniatura_abre_el_lightbox_con_la_foto_completa', async () => {
  await p.click('.fotito[data-foto]');
  await p.waitForSelector('#foto-lightbox.on', { timeout: 4000 });
  const src = await p.locator('#foto-lightbox img').getAttribute('src');
  if (!src || !src.startsWith('blob:')) throw new Error('el lightbox no tiene una imagen real: ' + src);
});

await paso('escape_cierra_el_lightbox', async () => {
  await p.keyboard.press('Escape');
  // Nunca `:not(.on)` con waitForSelector: cuando no tiene "on" la
  // regla CSS es display:none, así que jamás cuenta como "visible" —
  // el mismo error ya encontrado antes en probar-ayuda-contextual.mjs.
  await p.waitForFunction(() => !document.getElementById('foto-lightbox')?.classList.contains('on'), { timeout: 4000 });
});

await paso('cerrar_el_caso_no_rompe_nada_al_reabrir_otro', async () => {
  await p.click('#c-cerrar');
  await p.fill('#c-buscar', '');
  await p.waitForTimeout(500);
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('#detalle .det-head', { timeout: 8000 });
});

await paso('un_id_de_evidencia_inexistente_rechaza_sin_sesion', async () => {
  // Confirma que el endpoint nuevo exige sesión real — no una prueba de
  // casos.js, sino del propio backend (admin/evidencia.php).
  const r = await p.evaluate(async () => {
    const resp = await fetch('http://localhost:8080/api/v1/admin/evidencias/1', {
      headers: { 'X-App-Secret': 'dev_secret_local' }
    });
    return resp.status;
  });
  if (r !== 401) throw new Error('esperaba 401 sin sesión, llegó ' + r);
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
// El 401 del último paso es a propósito (prueba que el endpoint
// rechaza sin sesión), no un error real de la vista.
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*40[14]/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
