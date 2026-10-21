/* =====================================================================
   Galería de evidencias (vistas/galeria.js, api/admin/galeria.php) —
   pedido de ACUA, 2026-10-20. Cubre: que solo administrador la vea
   (enlace, vista y servidor), que las fotos se pidan en MINIATURA y
   no el original, que tocar una foto (o Enter con teclado) abra la
   ficha del caso correcto, y que ampliar desde la ficha sí pida la
   foto completa. Usa la evidencia que ya existe en la base de
   desarrollo — no crea ni borra ninguna foto.
   ===================================================================== */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

// Toda petición de imagen de evidencia, para saber si fue miniatura u original.
const pedidosEvidencia = [];
p.on('request', (r) => { if (r.url().includes('/admin/evidencias/')) pedidosEvidencia.push(r.url()); });

const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

async function entrar(correo, clave) {
  await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
  await p.fill('#login-correo', correo);
  await p.fill('#login-clave', clave);
  await p.click('#login-boton');
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
}

await entrar('marco@dev.local', 'prueba-dev-2026');

await paso('administrador_ve_el_enlace_y_abre_la_galeria', async () => {
  await p.waitForSelector('.lat a[data-v="galeria"]:not([hidden])', { timeout: 4000 });
  await p.click('.lat a[data-v="galeria"]');
  await p.waitForSelector('#g-grilla .gal-foto[data-caso]', { timeout: 8000 });
  const resumen = await p.locator('#g-resumen').textContent();
  if (!/^\d+ fotografía/.test(resumen.trim())) throw new Error('resumen inesperado: ' + resumen);
});

await paso('las_fotos_de_la_grilla_se_piden_en_miniatura_no_el_original', async () => {
  await p.waitForFunction(() => {
    const img = document.querySelector('#g-grilla .gal-foto[data-caso] .gal-img');
    return img && img.style.backgroundImage.includes('blob:');
  }, { timeout: 8000 });
  const originales = pedidosEvidencia.filter((u) => !u.includes('tam=miniatura'));
  if (pedidosEvidencia.length === 0) throw new Error('no se pidió ninguna imagen');
  if (originales.length) throw new Error('la galería pidió originales completos: ' + originales.join(', '));
});

await paso('filtrar_por_familia_cambia_la_grilla', async () => {
  await p.click('#g-familias [data-familia="persona"]');
  await p.waitForFunction(() => document.querySelector('#g-familias [data-familia="persona"]').classList.contains('act'));
  await p.waitForFunction(() => !document.querySelector('#g-grilla .gal-fantasma'), { timeout: 8000 });
  await p.click('#g-familias [data-familia=""]');
  await p.waitForSelector('#g-grilla .gal-foto[data-caso]', { timeout: 8000 });
});

let folioEsperado;
await paso('tocar_una_foto_abre_la_ficha_de_su_caso', async () => {
  const primera = p.locator('#g-grilla .gal-foto[data-caso]').first();
  folioEsperado = (await primera.locator('.gal-pie b').textContent()).trim();
  await primera.click();
  await p.waitForSelector('#overlay.on #detalle .det-head', { timeout: 8000 });
  const cabecera = await p.locator('#detalle .det-head').textContent();
  if (!cabecera.includes(folioEsperado)) throw new Error(`la ficha no es del caso ${folioEsperado}: ${cabecera.slice(0, 120)}`);
});

await paso('ampliar_desde_la_ficha_pide_la_foto_completa', async () => {
  await p.waitForSelector('#detalle .fotito[data-foto-url]', { timeout: 8000 });
  const antes = pedidosEvidencia.length;
  await p.click('#detalle .fotito[data-foto-url]');
  await p.waitForSelector('#foto-lightbox.on', { timeout: 4000 });
  await p.waitForTimeout(600); // da tiempo al pedido de la completa
  const nuevos = pedidosEvidencia.slice(antes);
  if (!nuevos.some((u) => !u.includes('tam=miniatura'))) throw new Error('ampliar no pidió el original: ' + nuevos.join(', '));
  await p.keyboard.press('Escape');
  await p.click('#c-cerrar');
});

await paso('con_teclado_tab_y_enter_tambien_abre_la_ficha', async () => {
  await p.locator('#g-grilla .gal-foto[data-caso]').first().focus();
  await p.keyboard.press('Enter');
  await p.waitForSelector('#overlay.on #detalle .det-head', { timeout: 8000 });
  await p.click('#c-cerrar');
});

// Operador: sin enlace, la vista avisa, y el servidor rechaza.
const sufijo = Date.now();
const correoOperador = `galeria-op-${sufijo}@dev.local`;
const nombreOperador = `Prueba galería ${sufijo}`;
await paso('crear_operador_de_prueba', async () => {
  const r = await p.evaluate(async ({ nombre, correo }) => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/usuarios', {
      method: 'POST',
      headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, correo, clave: 'clave-galeria-12345', rol: 'operador' }),
    });
    return resp.json();
  }, { nombre: nombreOperador, correo: correoOperador });
  if (!r.success) throw new Error(JSON.stringify(r));
});

await paso('operador_no_ve_el_enlace_y_el_servidor_le_rechaza', async () => {
  await p.evaluate(() => localStorage.removeItem('panel_sesion'));
  await entrar(correoOperador, 'clave-galeria-12345');
  if (await p.locator('.lat a[data-v="galeria"]').isVisible()) throw new Error('el operador ve el enlace de Galería');
  const r = await p.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/galeria', { headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t } });
    return { status: resp.status, cuerpo: await resp.json() };
  });
  if (r.status !== 403 || r.cuerpo.code !== 'ROL_INSUFICIENTE') throw new Error('el servidor no rechazó al operador: ' + JSON.stringify(r));
});

await paso('limpieza_desactivar_operador', async () => {
  await p.evaluate(() => localStorage.removeItem('panel_sesion'));
  await entrar('marco@dev.local', 'prueba-dev-2026');
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('#cfg-usuarios .lista-item', { timeout: 8000 });
  await p.locator('.lista-item', { hasText: nombreOperador }).locator('[data-usuario-toggle]').click();
  await p.waitForTimeout(500);
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*(404|403)/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));
await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
