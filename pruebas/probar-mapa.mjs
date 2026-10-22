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
await p.click('.lat a[data-v="mapa"]');

await paso('mapa_carga_y_muestra_resumen_real', async () => {
  await p.waitForFunction(() => document.getElementById('m-resumen')?.textContent?.includes('casos con ubicación'), { timeout: 15000 });
  const texto = await p.locator('#m-resumen').textContent();
  if (!/^\d+ casos con ubicación/.test(texto.trim())) throw new Error('resumen inesperado: ' + texto);
});

await paso('leaflet_esta_cargado_y_el_mapa_existe', async () => {
  const ok = await p.evaluate(() => !!window.L && document.getElementById('r-mapa')?.classList.contains('leaflet-container'));
  if (!ok) throw new Error('Leaflet no inicializó el mapa');
});

// Los racimos (.m-racimo) son un ícono; los puntos sueltos, un <path>.
function contarPuntos(p) {
  return p.evaluate(() => document.querySelectorAll('#r-mapa .leaflet-marker-icon, #r-mapa path.leaflet-interactive').length);
}
const cuenta = async () => Number((await p.textContent('#m-cuenta')).match(/^(\d+)/)[1]);

await paso('hay_marcadores_o_racimos_dibujados', async () => {
  await p.waitForTimeout(800);
  if ((await contarPuntos(p)) === 0) throw new Error('no se dibujó ningún marcador ni racimo');
});

await paso('filtro_contra_personas_reduce_los_casos', async () => {
  const antes = await cuenta();
  await p.click('.m-fam[data-fam="persona"]');
  await p.waitForTimeout(400);
  const despues = await cuenta();
  if (despues === 0 || despues > antes) throw new Error(`antes=${antes} despues=${despues}`);
  const enChip = Number(await p.textContent('[data-cuenta="persona"]'));
  if (enChip !== despues) throw new Error(`el chip dice ${enChip} y el mapa ${despues}`);
});

await paso('quitar_filtros_vuelve_a_mostrar_todo', async () => {
  await p.click('#m-limpiar');
  await p.waitForTimeout(400);
  const texto = await p.textContent('#m-cuenta');
  const [, n, total] = texto.match(/^(\d+) de (\d+)/);
  if (n !== total) throw new Error('quedó filtrado: ' + texto);
});

await paso('linea_de_tiempo_recorta_y_play_llega_al_final', async () => {
  const total = await cuenta();
  await p.click('.m-barra[data-bin]:not(:empty)');
  await p.waitForTimeout(300);
  if ((await cuenta()) >= total) throw new Error('tocar una barra no recortó el periodo');
  await p.click('#m-todo');
  await p.click('#m-play');
  await p.waitForFunction((t) => document.getElementById('m-cuenta').textContent.startsWith(t + ' de'), total, { timeout: 15000 });
});

await paso('ficha_emergente_con_coordenada_y_abrir_caso', async () => {
  await p.evaluate(() => {
    const capa = Object.values(window.L ? document.getElementById('r-mapa') : {}).length;
    return capa;
  });
  const punto = p.locator('#r-mapa path.leaflet-interactive').first();
  if (await punto.count()) {
    await punto.click({ force: true });
  } else {
    await p.locator('.m-racimo').first().click();
    await p.waitForTimeout(800);
    await p.locator('#r-mapa path.leaflet-interactive').first().click({ force: true });
  }
  await p.waitForSelector('.m-pop [data-abrir]', { timeout: 4000 });
  const coord = await p.textContent('.m-pop code');
  if (!/^-?\d+\.\d{5}, -?\d+\.\d{5}$/.test(coord.trim())) throw new Error('coordenada rara: ' + coord);
});

await paso('la_regla_mide_una_distancia', async () => {
  await p.click('.leaflet-popup-close-button').catch(() => {});
  await p.click('.m-herr a');
  await p.waitForTimeout(400); // la ficha abierta se cierra con un fundido
  const caja = await p.locator('#r-mapa').boundingBox();
  await p.mouse.click(caja.x + 250, caja.y + 250);
  await p.mouse.click(caja.x + 500, caja.y + 300);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  const t = await p.locator('.m-medida').last().textContent();
  if (!/Total: [\d.]+ (m|km)/.test(t)) throw new Error('medida: ' + t);
  await p.keyboard.press('Escape');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
