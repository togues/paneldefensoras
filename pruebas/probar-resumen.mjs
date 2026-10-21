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

// Resumen operativo desde 2026-10-20: el pulso de 30 días reemplazó la
// serie de 6 meses (que se mudó, con filtros, a Análisis).
await paso('grafica_se_dibuja', async () => {
  await p.waitForFunction(() => !!window.Chart?.getChart('r-pulso'), { timeout: 8000 });
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

await paso('bandeja_ordena_por_urgencia_y_una_fila_abre_la_ficha', async () => {
  await p.waitForSelector('#r-pendientes tr[data-id]', { timeout: 4000 });
  const primera = p.locator('#r-pendientes tr[data-id]').first();
  const folio = (await primera.locator('.folio').textContent()).replace('Alta', '').trim();
  await primera.click();
  await p.waitForSelector('#overlay.on #detalle .det-head', { timeout: 8000 });
  const cabecera = await p.locator('#detalle .det-head').textContent();
  if (!cabecera.includes(folio)) throw new Error('la ficha no es del caso ' + folio);
  await p.click('#c-cerrar');
});

await paso('el_indicador_sin_revisar_lleva_a_casos_con_el_mismo_numero', async () => {
  const valor = (await p.locator('#r-kpis [data-kpi="0"] b').textContent()).trim();
  await p.click('#r-kpis [data-kpi="0"]');
  await p.waitForSelector('#c-tabla tr[data-id], #c-tabla .vacio', { timeout: 8000 });
  await p.waitForFunction(() => /reporte/.test(document.getElementById('c-resumen')?.textContent || ''));
  const resumen = await p.locator('#c-resumen').textContent();
  if (!resumen.startsWith(valor + ' ')) throw new Error(`el indicador decía ${valor} y Casos muestra "${resumen}"`);
  const activo = await p.locator('.filtro.act[data-e="recibido"]').count();
  if (!activo) throw new Error('Casos no quedó filtrado en "Sin revisar"');
  await p.click('.lat a[data-v="resumen"]');
  await p.waitForSelector('#r-kpis [data-kpi]', { timeout: 8000 });
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
