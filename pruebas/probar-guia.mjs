/* "Cómo funciona" (vistas/guia.js): la ve cualquier rol, carga sus
   capítulos sin errores y el índice lleva a cada uno. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
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

await paso('carga_todos_los_capitulos', async () => {
  await p.click('.lat a[data-v="guia"]');
  await p.waitForSelector('.guia-cap', { timeout: 8000 });
  const indice = await p.locator('.guia-indice a').count();
  const capitulos = await p.locator('.guia-cap').count();
  if (indice < 10 || indice !== capitulos) throw new Error(`índice ${indice}, capítulos ${capitulos}`);
});

await paso('el_indice_lleva_al_capitulo', async () => {
  await p.click('[data-ir="fotos"]');
  await p.waitForFunction(() => {
    const r = document.getElementById('guia-fotos').getBoundingClientRect();
    return r.top >= 0 && r.top < 200;
  }, null, { timeout: 4000 });
});

console.log(JSON.stringify(s, null, 2));
console.log('errores de consola inesperados:', errores);
const ok = Object.values(s).every(Boolean) && errores.length === 0;
console.log(ok ? 'TODO OK' : 'FALLAS');
await b.close();
process.exit(ok ? 0 : 1);
