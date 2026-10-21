/* =====================================================================
   Tablero de Análisis con filtros en cascada (vistas/analisis.js,
   vistas/analisis-filtros.js, api/admin/analisis.php) — 2026-10-20.
   Cubre lo que define a un tablero "tipo Power BI": un filtro refresca
   todo, un clic en un gráfico filtra y otro clic lo quita, la cascada
   departamento→comunidad y familia→tipo, que "ver estos casos" muestre
   el MISMO número que contó el tablero, que los filtros sobrevivan a
   cambiar de vista, y que una respuesta vieja nunca pise la nueva.
   ===================================================================== */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

const totalKpi = async () => Number((await p.locator('#a-kpis .kpi b').first().textContent()).trim());
const esperarTablero = () => p.waitForFunction(() => {
  const t = document.getElementById('a-tablero');
  return t && !t.classList.contains('actualizando') && document.querySelector('#a-kpis .kpi b');
}, { timeout: 10000 });

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.evaluate(() => sessionStorage.clear());
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="analisis"]');
await p.waitForSelector('#a-tipos .barra', { timeout: 10000 });
await esperarTablero();
const totalInicial = await totalKpi();

await paso('clic_en_un_departamento_filtra_todo_el_tablero', async () => {
  const barra = p.locator('#a-departamentos button.barra').first();
  const esperado = Number((await barra.locator('.bl b').textContent()).trim());
  await barra.click();
  await p.waitForSelector('#af-chips .chip-filtro:has-text("Departamento")', { timeout: 4000 });
  await esperarTablero();
  const total = await totalKpi();
  if (total !== esperado) throw new Error(`la barra decía ${esperado} y el total quedó en ${total}`);
  if (!(await p.locator('#af-departamento').inputValue())) throw new Error('el select de departamento no reflejó el filtro');
  if ((await p.locator('#a-departamentos button.barra.activa').count()) !== 1) throw new Error('la barra elegida no quedó marcada');
});

await paso('otro_clic_en_la_misma_barra_quita_el_filtro', async () => {
  await p.locator('#a-departamentos button.barra.activa').click();
  await p.waitForFunction(() => !document.querySelector('#af-chips .chip-filtro'), { timeout: 4000 });
  await esperarTablero();
  if ((await totalKpi()) !== totalInicial) throw new Error('el total no volvió al inicial');
});

await paso('cascada_comunidad_completa_su_departamento', async () => {
  const valor = await p.locator('#af-comunidad option').nth(1).getAttribute('value');
  await p.selectOption('#af-comunidad', valor);
  await p.waitForFunction(() => document.getElementById('af-departamento').value !== '', { timeout: 4000 });
  await esperarTablero();
  // Con departamento elegido, la lista de comunidades se reduce a las suyas.
  const conDepto = await p.locator('#af-comunidad option').count();
  await p.locator('#af-chips [data-quitar="departamento_id"]').click();
  await p.waitForFunction(() => document.getElementById('af-departamento').value === '', { timeout: 4000 });
  await p.locator('#af-chips [data-quitar="comunidad_id"]').click();
  await esperarTablero();
  const sinDepto = await p.locator('#af-comunidad option').count();
  if (conDepto > sinDepto) throw new Error('la lista de comunidades no se redujo al elegir departamento');
});

await paso('cascada_familia_reduce_los_tipos', async () => {
  const todos = await p.locator('#af-tipo option').count();
  await p.selectOption('#af-familia', 'persona');
  await esperarTablero();
  const deFamilia = await p.locator('#af-tipo option').count();
  if (deFamilia >= todos) throw new Error(`los tipos no se redujeron (${todos} -> ${deFamilia})`);
});

await paso('ver_estos_casos_muestra_el_mismo_numero', async () => {
  await p.click('#af-periodo [data-periodo="365"]');
  await esperarTablero();
  const total = await totalKpi();
  await p.click('#af-ver-casos');
  await p.waitForSelector('#c-tabla tr[data-id], #c-tabla .vacio', { timeout: 8000 });
  await p.waitForFunction(() => /reporte/.test(document.getElementById('c-resumen')?.textContent || ''));
  const resumen = await p.locator('#c-resumen').textContent();
  if (!resumen.startsWith(total + ' ')) throw new Error(`el tablero contaba ${total} y Casos muestra "${resumen}"`);
  if (!(await p.locator('#c-extra .chip-filtro:has-text("Familia")').count())) throw new Error('Casos no mostró el filtro de familia');
});

await paso('los_filtros_sobreviven_a_cambiar_de_vista', async () => {
  await p.click('.lat a[data-v="analisis"]');
  await p.waitForSelector('#af-chips .chip-filtro:has-text("Familia")', { timeout: 8000 });
  if (!(await p.locator('#af-periodo [data-periodo="365"].act').count())) throw new Error('se perdió el período elegido');
  await esperarTablero();
});

await paso('dos_filtros_seguidos_muy_rapido_dejan_el_resultado_del_ultimo', async () => {
  await p.selectOption('#af-familia', 'territorio');
  await p.selectOption('#af-estado', 'recibido');
  await p.waitForTimeout(300);
  await esperarTablero();
  const mostrado = await totalKpi();
  const real = await p.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
    const d = new Date(hoy + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 364);
    const q = new URLSearchParams({ desde: d.toISOString().slice(0, 10), hasta: hoy, familia: 'territorio', estado: 'recibido' });
    const r = await fetch('http://localhost:8080/api/v1/admin/analisis?' + q, { headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t } });
    return (await r.json()).data.kpis.total;
  });
  if (mostrado !== real) throw new Error(`el tablero muestra ${mostrado} y para esos filtros son ${real}`);
});

await paso('limpiar_filtros_vuelve_al_inicio', async () => {
  await p.click('#af-limpiar');
  await p.waitForFunction(() => !document.querySelector('#af-chips .chip-filtro'), { timeout: 4000 });
  await esperarTablero();
  if ((await totalKpi()) !== totalInicial) throw new Error('el total no volvió al inicial');
  if (!(await p.locator('#af-periodo [data-periodo="180"].act').count())) throw new Error('el período no volvió a 6 meses');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
console.log('errores de consola inesperados:', errores);
console.log(fallas.length === 0 && errores.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));
await b.close();
process.exit(fallas.length === 0 && errores.length === 0 ? 0 : 1);
