import { chromium } from 'playwright';

// Texto malicioso en lo que devuelve la API (interceptado en el
// navegador, sin tocar la base): si alguna vista lo pinta sin esc(),
// el onerror corre y deja una marca en window.__xss.
const VENENO = '<img src=x onerror="window.__xss=(window.__xss||[]).concat(document.title)">';

function envenenar(valor) {
  if (Array.isArray(valor)) return valor.map(envenenar);
  if (valor && typeof valor === 'object') {
    const copia = {};
    for (const [k, v] of Object.entries(valor)) copia[k] = envenenar(v);
    return copia;
  }
  // Solo texto: ids, números y fechas quedan igual para que las vistas
  // sigan funcionando.
  if (typeof valor === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(valor) && !/^(ok|bien|aviso|mal|recibido|en_investigacion|cerrado|descartado|persona|territorio|gestion|logro|administrador|operador|manual|automatico)$/.test(valor)) {
    return valor + VENENO;
  }
  return valor;
}

const b = await chromium.launch();
const p = await b.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

await p.route(/\/api\/v1\/admin\/(casos|usuarios|salud|respaldos)/, async (ruta) => {
  if (ruta.request().method() !== 'GET') return ruta.continue();
  const respuesta = await ruta.fetch();
  const json = await respuesta.json().catch(() => null);
  if (!json?.data) return ruta.fulfill({ response: respuesta });
  return ruta.fulfill({ response: respuesta, json: { ...json, data: envenenar(json.data) } });
});

const s = {};
async function paso(nombre, fn) {
  try {
    await p.evaluate(() => { window.__xss = []; });
    await fn();
    const marcas = await p.evaluate(() => window.__xss || []);
    if (marcas.length) throw new Error('se ejecutó código inyectado');
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

await paso('tabla_de_casos_no_ejecuta_texto_de_la_api', async () => {
  await p.click('.lat a[data-v="casos"]');
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  await p.waitForTimeout(500);
});

await paso('ficha_del_caso_no_ejecuta_texto_de_la_api', async () => {
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('.det-head', { timeout: 8000 });
  await p.waitForTimeout(500);
  const visible = await p.locator('.det-head h2').textContent();
  if (!visible.includes('<img')) throw new Error('el texto debía verse escapado, como texto: ' + visible);
});

await paso('configuracion_no_ejecuta_texto_de_la_api', async () => {
  await p.click('#c-cerrar');
  await p.waitForTimeout(400);
  await p.click('.lat a[data-v="config"]');
  await p.waitForTimeout(1500);
});

await paso('salud_no_ejecuta_texto_de_la_api', async () => {
  await p.click('.lat a[data-v="salud"]');
  await p.waitForSelector('#s-plataforma .sfila', { timeout: 8000 });
  await p.waitForTimeout(500);
});

await paso('salud_muestra_la_seguridad_del_servidor_al_administrador', async () => {
  await p.waitForSelector('#s-seguridad .sfila', { timeout: 8000 });
  if (await p.locator('#s-seguridad-caja[hidden]').count()) throw new Error('la caja de seguridad quedó oculta');
});

await paso('respaldos_no_ejecuta_texto_de_la_api', async () => {
  await p.click('.lat a[data-v="respaldos"]');
  await p.waitForSelector('#r-generar', { timeout: 8000 });
  await p.waitForTimeout(1000);
});

if (errores.length) console.error('errores de página:', errores);
const fallas = Object.entries(s).filter(([, ok]) => !ok);
console.log(fallas.length ? 'FALLAS: ' + JSON.stringify(fallas) : 'TODO OK');
await b.close();
