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

async function total() {
  const texto = await p.locator('#c-resumen').textContent();
  const m = texto.match(/(\d+) reporte/);
  if (!m) throw new Error('no se pudo leer el resumen: ' + texto);
  return Number(m[1]);
}

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });

// Desde que /admin/* exige sesión real (lib/PanelAuth.php), toda prueba
// del panel empieza con login — cuenta de prueba creada a mano en dev,
// ver docs/08-despliegue.md para el equivalente de producción.
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="casos"]');
await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });

await paso('comunidad_se_llena_con_datos_reales', async () => {
  await p.waitForFunction(() => document.getElementById('c-comunidad')?.options.length > 1, { timeout: 4000 });
  const opciones = await p.locator('#c-comunidad option').allTextContents();
  if (!opciones.some((o) => o.includes('Los Naranjos'))) throw new Error('no apareció una comunidad real en el filtro: ' + opciones.join(', '));
});

await paso('buscar_por_folio_encuentra_exactamente_uno', async () => {
  const folio = (await p.locator('#c-tabla tr[data-id] .folio').first().textContent()).trim();
  await p.fill('#c-buscar', folio);
  await p.waitForTimeout(500);
  if ((await total()) !== 1) throw new Error('buscar por folio exacto no dio exactamente 1 resultado');
  const folioMostrado = (await p.locator('#c-tabla .folio').first().textContent()).trim();
  if (folioMostrado !== folio) throw new Error(`esperaba ${folio}, salió ${folioMostrado}`);
});

await paso('buscar_texto_del_relato_encuentra_casos', async () => {
  await p.fill('#c-buscar', 'amenazante');
  await p.waitForTimeout(500);
  const n = await total();
  if (n === 0) throw new Error('buscar "amenazante" (texto del relato) no encontró nada');
});

await paso('limpiar_filtros_vuelve_a_25', async () => {
  await p.click('#c-limpiar');
  await p.waitForTimeout(400);
  if ((await total()) !== 25) throw new Error('limpiar filtros no volvió a los 25 casos de demo');
});

await paso('filtro_por_comunidad_funciona', async () => {
  await p.selectOption('#c-comunidad', { label: 'DEMO — Comité La Esperanza' });
  await p.waitForTimeout(400);
  const n = await total();
  if (n === 0 || n >= 25) throw new Error('filtrar por comunidad no redujo el listado como se esperaba: ' + n);
  const comunidades = await p.locator('#c-tabla td:nth-child(2)').allTextContents();
  if (!comunidades.every((c) => c.includes('La Esperanza'))) throw new Error('aparecieron filas de otra comunidad');
});

await paso('combinar_comunidad_mas_prioridad_mas_estado', async () => {
  await p.selectOption('#c-prioridad', 'alta');
  await p.click('.filtro[data-e="recibido"]');
  await p.waitForTimeout(400);
  const n = await total();
  if (n !== 1) throw new Error('la combinación comunidad+prioridad+estado debía dar exactamente 1, dio ' + n);
});

await paso('limpiar_filtros_resetea_todo_de_nuevo', async () => {
  await p.click('#c-limpiar');
  await p.waitForTimeout(400);
  if ((await total()) !== 25) throw new Error('limpiar no reseteó comunidad+prioridad+estado juntos');
  const comunidadSel = await p.locator('#c-comunidad').inputValue();
  const prioridadSel = await p.locator('#c-prioridad').inputValue();
  if (comunidadSel !== '' || prioridadSel !== '') throw new Error('los selects no quedaron en "Todas"');
});

await paso('filtro_de_fecha_desde_futuro_deja_la_tabla_vacia', async () => {
  await p.fill('#c-desde', '2027-01-01');
  await p.waitForTimeout(400);
  if ((await total()) !== 0) throw new Error('una fecha "desde" en el futuro debería dar 0 casos');
  await p.waitForSelector('text=No hay casos con ese filtro', { timeout: 2000 });
  await p.click('#c-limpiar');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
