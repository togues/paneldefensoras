/* Visita guiada (core/visita-guiada.js): se ofrece la primera vez,
   recorre las secciones iluminando cada una y se repite desde el menú. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });

await paso('se_ofrece_la_primera_vez', async () => {
  await p.waitForSelector('.vg-aviso', { timeout: 5000 });
});

const titulos = [];
await paso('recorre_todos_los_pasos_iluminando_cada_seccion', async () => {
  await p.click('[data-vg-aviso="si"]');
  await p.waitForSelector('.vg-tarjeta', { timeout: 3000 });
  const total = Number((await p.locator('.vg-contador').textContent()).match(/de (\d+)/)[1]);
  for (let i = 0; i < total; i++) {
    await p.waitForFunction((n) => document.querySelector('.vg-contador')?.textContent.startsWith(`Paso ${n} `), i + 1, { timeout: 6000 });
    await p.waitForTimeout(150);
    const titulo = await p.locator('.vg-titulo').textContent();
    titulos.push(titulo);
    const conFoco = await p.locator('.vg-foco:not([hidden])').count();
    if (i > 0 && i < total - 1 && !conFoco) throw new Error('el paso "' + titulo + '" no iluminó nada');
    await p.click('[data-vg="siguiente"]');
  }
  if (await p.locator('.vg-capa').count()) throw new Error('la visita no se cerró al terminar');
});

await paso('no_se_vuelve_a_ofrecer_y_se_repite_desde_el_menu', async () => {
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  await p.waitForTimeout(1200);
  if (await p.locator('.vg-aviso').count()) throw new Error('se volvió a ofrecer');
  await p.click('.lat [data-visita]');
  await p.waitForSelector('.vg-tarjeta', { timeout: 3000 });
  await p.keyboard.press('Escape');
  if (await p.locator('.vg-capa').count()) throw new Error('Esc no cerró la visita');
});

console.log('pasos:', titulos.join(' · '));
console.log(JSON.stringify(s, null, 2));
console.log('errores de consola inesperados:', errores);
const ok = Object.values(s).every(Boolean) && errores.length === 0;
console.log(ok ? 'TODO OK' : 'FALLAS');
await b.close();
process.exit(ok ? 0 : 1);
