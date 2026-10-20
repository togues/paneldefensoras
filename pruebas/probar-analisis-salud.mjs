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

await paso('analisis_carga_serie_dona_y_barras_reales', async () => {
  await p.click('.lat a[data-v="analisis"]');
  await p.waitForSelector('#a-tipos .barra', { timeout: 8000 });
  // Chart.getChart() devuelve la instancia real atada a ese <canvas>
  // si Chart.js la dibujó — más confiable que solo mirar si el
  // elemento existe (.getContext existe en cualquier <canvas>, dibujado o no).
  const hayDona = await p.evaluate(() => !!window.Chart?.getChart('a-dona'));
  if (!hayDona) throw new Error('la dona de Chart.js no se dibujó');
  const haySerie = await p.evaluate(() => !!window.Chart?.getChart('a-serie'));
  if (!haySerie) throw new Error('la gráfica de línea de Chart.js no se dibujó');
  const leyenda = await p.locator('#a-dona-leyenda .barra').count();
  if (leyenda !== 4) throw new Error('esperaba 4 familias en la leyenda de la dona, hay ' + leyenda);
  const territorios = await p.locator('#a-territorios .barra').count();
  if (territorios === 0) throw new Error('no hay barras de territorio');
  const territorioTexto = await p.locator('#a-territorios').textContent();
  if (!territorioTexto.includes('dispositivo')) throw new Error('no se mostró "dispositivos activos" en territorios: ' + territorioTexto);
  const estados = await p.locator('#a-estados .barra').count();
  if (estados === 0) throw new Error('no hay barras de estado');
});

await paso('salud_muestra_kpis_reales_y_dos_anomalias', async () => {
  await p.click('.lat a[data-v="salud"]');
  await p.waitForSelector('#s-kpis .kpi', { timeout: 8000 });
  const kpis = await p.locator('#s-kpis .kpi').count();
  if (kpis !== 4) throw new Error('esperaba 4 KPIs en Salud, hay ' + kpis);
  await p.waitForSelector('#s-anomalias .sfila', { timeout: 4000 });
  const anomalias = await p.locator('#s-anomalias .sfila').count();
  if (anomalias !== 2) throw new Error('esperaba 2 anomalías de demo sin revisar, hay ' + anomalias);
});

await paso('salud_muestra_el_ultimo_respaldo_real_no_inventado', async () => {
  // Desde que /admin/respaldos existe (docs/decision-04-respaldos.md),
  // esta fila ya no dice "Sin construir" — muestra la fecha real del
  // último respaldo generado. Si algún día vuelve a faltar una pieza
  // real (como pasaba antes con respaldos), esta pantalla debe seguir
  // diciéndolo así en vez de inventar un número — por eso la prueba
  // sigue viva, apuntando ahora a la fila que de verdad sigue honesta.
  const texto = await p.locator('#s-plataforma').textContent();
  if (!texto.includes('Respaldos') || !texto.includes('Último:')) {
    throw new Error('la fila de Respaldos no muestra una fecha real: ' + texto);
  }
});

await paso('marcar_anomalia_revisada_la_quita_de_la_lista', async () => {
  await p.click('#s-anomalias [data-revisar]');
  await p.waitForFunction(() => document.querySelectorAll('#s-anomalias .sfila').length === 1, { timeout: 8000 });
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
