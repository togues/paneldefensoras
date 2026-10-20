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
await p.click('.lat a[data-v="casos"]');
await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });

await paso('exportar_csv_descarga_todas_las_filas_del_filtro', async () => {
  // Filtrar antes, para probar que el CSV respeta el filtro y no solo
  // la página visible.
  await p.click('.filtro[data-e="cerrado"]');
  await p.waitForTimeout(400);
  const totalEsperado = Number((await p.locator('#c-resumen').textContent()).match(/(\d+)/)[1]);

  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 10000 }),
    p.click('#c-exportar-csv')
  ]);

  const ruta = await descarga.path();
  const contenido = (await import('node:fs')).readFileSync(ruta, 'latin1'); // BOM + UTF-8, latin1 preserva los bytes tal cual para contar líneas
  const lineas = contenido.split('\r\n').filter(Boolean);
  // -1 por el encabezado.
  if (lineas.length - 1 !== totalEsperado) {
    throw new Error(`esperaba ${totalEsperado} filas de datos, el CSV trae ${lineas.length - 1}`);
  }
  if (!lineas[0].includes('Folio')) throw new Error('el CSV no trae encabezados: ' + lineas[0]);

  await p.click('.filtro[data-e="todos"]');
  await p.waitForTimeout(300);
});

await paso('exportar_pdf_abre_una_pestana_con_el_informe_real', async () => {
  const [popup] = await Promise.all([
    p.waitForEvent('popup', { timeout: 10000 }),
    p.click('#c-exportar-pdf')
  ]);
  await popup.waitForLoadState('networkidle');
  await popup.waitForSelector('table tbody tr', { timeout: 8000 });

  const titulo = await popup.locator('h1').textContent();
  if (!titulo.includes('Observatorio Comunitario')) throw new Error('el informe no tiene el título esperado: ' + titulo);

  const filas = await popup.locator('table tbody tr').count();
  if (filas !== 25) throw new Error('esperaba 25 filas en el informe (sin filtro), hay ' + filas);

  const meta = await popup.locator('.meta').first().textContent();
  if (!meta.includes('Marco (prueba local)')) throw new Error('el informe no atribuyó a la persona real que lo generó: ' + meta);

  const firma = await popup.locator('.firma').textContent();
  if (!firma.includes('Elaborado por') || !firma.includes('autorizado')) throw new Error('el informe no trae el espacio para firmar: ' + firma);

  await popup.close();
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
