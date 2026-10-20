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
await p.click('.lat a[data-v="respaldos"]');
await p.waitForSelector('#r-generar', { timeout: 8000 });

await paso('generar_respaldo_ahora_crea_uno_real', async () => {
  await p.waitForSelector('#r-resumen', { timeout: 8000 });
  const antes = await p.locator('.lista-item').count();
  await p.click('#r-generar');
  await p.waitForFunction((n) => document.querySelectorAll('.lista-item').length > n, antes, { timeout: 15000 });
  const primero = await p.locator('#r-lista .lista-item .codigo-mono').first().textContent();
  if (!/^respaldo_.*\.enc$/.test(primero.trim())) throw new Error('el nombre del respaldo no tiene la forma esperada: ' + primero);
});

await paso('el_respaldo_recien_generado_aparece_en_la_bitacora', async () => {
  const texto = await p.locator('#r-bitacora').textContent();
  if (!texto.includes('Respaldo generado')) throw new Error('la bitácora no refleja el respaldo generado: ' + texto);
});

await paso('descargar_un_respaldo_trae_un_archivo_cifrado', async () => {
  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 8000 }),
    p.click('#r-lista [data-descargar]').then(() => {}),
  ]);
  const ruta = await descarga.path();
  const fs = await import('node:fs');
  const contenido = fs.readFileSync(ruta);
  // No debe leerse como JSON ni tener el patrón {"tabla": — si esto
  // pasara, "cifrado" sería mentira.
  const texto = contenido.subarray(0, 200).toString('latin1');
  if (texto.includes('{"') || texto.includes('reporte')) throw new Error('el archivo descargado no parece estar cifrado');
});

await paso('la_descarga_quedo_registrada_en_la_bitacora', async () => {
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  await p.click('.lat a[data-v="respaldos"]');
  await p.waitForSelector('#r-generar', { timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('r-bitacora')?.textContent.trim() !== '', { timeout: 8000 });
  const texto = await p.locator('#r-bitacora').textContent();
  if (!texto.includes('Respaldo descargado')) throw new Error('la bitácora no refleja la descarga: ' + texto);
});

await paso('cambiar_la_retencion_se_guarda_de_verdad', async () => {
  await p.waitForFunction(() => document.getElementById('r-retencion-input')?.value !== '', { timeout: 8000 });
  await p.fill('#r-retencion-input', '7');
  await p.locator('#r-retencion-input').blur();
  await p.waitForFunction(() => document.getElementById('r-retencion-sub')?.textContent.includes('7'), { timeout: 4000 });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  await p.click('.lat a[data-v="respaldos"]');
  await p.waitForSelector('#r-generar', { timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('r-retencion-input')?.value === '7', { timeout: 8000 });
  // deja la configuración como estaba
  await p.fill('#r-retencion-input', '10');
  await p.locator('#r-retencion-input').blur();
  await p.waitForFunction(() => document.getElementById('r-retencion-sub')?.textContent.includes('10'), { timeout: 4000 });
});

await paso('apagar_el_automatico_se_guarda_y_se_puede_volver_a_prender', async () => {
  const sw = p.locator('#r-sw-automatico');
  const estabaActivado = !(await sw.evaluate((el) => el.classList.contains('off')));
  if (!estabaActivado) throw new Error('se esperaba que el automático empezara activado (default de la migración)');
  await sw.click();
  await p.waitForFunction(() => document.getElementById('r-sw-automatico')?.classList.contains('off'), { timeout: 4000 });
  await sw.click(); // lo deja como estaba
  await p.waitForFunction(() => !document.getElementById('r-sw-automatico')?.classList.contains('off'), { timeout: 4000 });
});

await paso('descargar_sin_sesion_rechaza', async () => {
  const r = await p.evaluate(async () => {
    const resp = await fetch('http://localhost:8080/api/v1/admin/respaldos', { headers: { 'X-App-Secret': 'dev_secret_local' } });
    return resp.status;
  });
  if (r !== 401) throw new Error('esperaba 401 sin sesión, llegó ' + r);
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*40[14]/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
