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

await paso('kpis_muestran_numeros_reales', async () => {
  await p.waitForSelector('#r-kpis .kpi', { timeout: 8000 });
  const total = await p.locator('#r-kpis .kpi').count();
  if (total !== 6) throw new Error('esperaba 6 KPIs, hay ' + total);
  const primero = await p.locator('#r-kpis .kpi b').first().textContent();
  if (!/^\d+$/.test(primero.trim())) throw new Error('el primer KPI no es un número: ' + primero);
});

await paso('grafica_se_dibuja', async () => {
  await p.waitForSelector('#r-serie', { timeout: 4000 });
  const hayCanvas = await p.evaluate(() => {
    const c = document.getElementById('r-serie');
    return c && c.getContext && !!window.Chart;
  });
  if (!hayCanvas) throw new Error('Chart.js no cargó o el canvas no existe');
  const leyenda = await p.locator('#r-leyenda span').count();
  if (leyenda === 0) throw new Error('la leyenda de familias quedó vacía');
});

await paso('tabla_casos_recientes_tiene_filas_reales', async () => {
  await p.waitForSelector('#r-tabla tr', { timeout: 4000 });
  const filas = await p.locator('#r-tabla tr').count();
  if (filas === 0) throw new Error('la tabla de casos recientes está vacía');
  const folio = await p.locator('#r-tabla .folio').first().textContent();
  if (!/^SV\d{2}-\d{4}-\d{4}$/.test(folio.trim())) throw new Error('el folio no tiene forma real: ' + folio);
});

await paso('alertas_activas_muestra_la_demo', async () => {
  await p.waitForSelector('#r-alertas .alerta', { timeout: 4000 });
  const texto = await p.locator('#r-alertas .alerta').first().textContent();
  if (!texto.includes('Los Naranjos')) throw new Error('no apareció la alerta de demo esperada: ' + texto);
});

await paso('tipos_frecuentes_tiene_barras', async () => {
  await p.waitForSelector('#r-tipos .barra', { timeout: 4000 });
  const barras = await p.locator('#r-tipos .barra').count();
  if (barras === 0) throw new Error('no hay barras de tipos de hecho');
});

// 8 desde la Galería (2026-10-20) — su enlace existe siempre en el
// HTML, oculto para quien no es administrador.
await paso('nav_lateral_completa_las_ocho_vistas', async () => {
  const enlaces = await p.locator('.lat a[data-v]').count();
  if (enlaces !== 8) throw new Error('esperaba 8 enlaces en la barra lateral, hay ' + enlaces);
});

await paso('las_siete_vistas_ya_estan_construidas_ninguna_avisa_pendiente', async () => {
  // Con Respaldos (la última) ya construida, no debería quedar ninguna
  // vista mostrando "Todavía no está conectada" — si esta prueba falla
  // apenas se agregue una vista nueva sin JS detrás, es la señal de
  // que hay que volver a poner acá el aviso de "pendiente", igual que
  // antes.
  await p.click('.lat a[data-v="respaldos"]');
  await p.waitForSelector('#r-generar', { timeout: 4000 });
  const avisaPendiente = await p.locator('text=Todavía no está conectada').count();
  if (avisaPendiente > 0) throw new Error('Respaldos todavía muestra el aviso de "pendiente"');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
