/* Ventana de vigencia de un código de comunidad — pedido de Marco
   (2026-10-20): REDNA planifica capacitaciones con fecha fija, y el
   código que lleva a una debe dejar de servir fuera de esa ventana sin
   que nadie tenga que acordarse de revocarlo a mano.

   Cubre el circuito completo: panel fija la ventana → la app respeta
   (o no) el código real contra el servidor real → panel puede
   extenderla con "+1 semana". También es la prueba que encontró el bug
   real de huso horario: sin el offset explícito -06:00, "hasta las
   23:59:59" se guardaba en hora UTC y el código vencía casi 6 horas
   antes de lo que mostraba el selector — por eso esta prueba verifica
   el valor tal cual queda, no solo que algo se haya guardado. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

const contextoPanel = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await contextoPanel.newPage();
const erroresPanel = [];
p.on('console', (m) => { if (m.type() === 'error') erroresPanel.push(m.text()); });
p.on('pageerror', (e) => erroresPanel.push('pageerror: ' + e.message));

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="config"]');
await p.waitForSelector('[data-generar]', { timeout: 8000 });

let idCodigo, idComunidad, codigoTexto;

await paso('generar_codigo_nuevo', async () => {
  const botonGenerar = p.locator('[data-generar]').first();
  idComunidad = await botonGenerar.getAttribute('data-generar');
  await botonGenerar.click();
  await p.waitForTimeout(600);
  // Ordenado por fecha_emision DESC — el código recién generado es
  // siempre la primera fila dentro de .codigos-lista.
  const fila = p.locator(`[data-comunidad-bloque="${idComunidad}"] .codigo-row`).first();
  idCodigo = await fila.locator('[data-revocar]').getAttribute('data-revocar');
  codigoTexto = await p.locator(`[data-comunidad-bloque="${idComunidad}"] .codigo-mono`).first().textContent();
  if (!idCodigo || !codigoTexto) throw new Error('no se generó el código de prueba');
});

await paso('fijar_ventana_ya_vencida', async () => {
  // "Ayer" calculado en UTC, no en hora de El Salvador: entre las
  // 18:00 y la medianoche de El Salvador, Date.now() ya cayó en el
  // día UTC siguiente, así que "Date.now() - 1 día" en UTC cae en el
  // día de HOY en El Salvador, no en ayer — el código quedaba
  // "vencido" hasta las 23:59:59 de hoy, que todavía no habían
  // pasado. Encontrado corriendo esta prueba real a las 19:01 de El
  // Salvador, 2026-10-20 — mismo tipo de bug que el de inicioDeDiaSV
  // en config.js, por la misma razón.
  const hoySV = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
  const fechaAyer = new Date(hoySV + 'T00:00:00Z');
  fechaAyer.setUTCDate(fechaAyer.getUTCDate() - 1);
  const ayer = fechaAyer.toISOString().slice(0, 10);
  await p.fill(`[data-vig-desde="${idCodigo}"]`, ayer);
  await p.fill(`[data-vig-hasta="${idCodigo}"]`, ayer);
  await p.click(`[data-guardar-vigencia="${idCodigo}"]`);
  await p.waitForSelector(`[data-comunidad-bloque="${idComunidad}"] .codigo-row:first-child small:has-text("Vencido")`, { timeout: 4000 });
});

await paso('la_app_rechaza_el_codigo_vencido_de_verdad', async () => {
  const contextoApp = await b.newContext({ permissions: [] });
  const pApp = await contextoApp.newPage();
  await pApp.goto('http://localhost:8902/index.html', { waitUntil: 'networkidle' });
  await pApp.click('[data-accion="seguir"]');
  await pApp.click('[data-accion="seguir"]');
  await pApp.fill('#codigo-comunidad', codigoTexto);
  await pApp.click('[data-accion="seguir"]');
  await pApp.waitForSelector('[data-alias]', { timeout: 6000 });
  await pApp.click('[data-alias]');
  await pApp.click('[data-accion="seguir"]'); // acá se valida de verdad contra el servidor
  await pApp.waitForSelector('.alerta-texto', { timeout: 8000 });
  const enCodigo = await pApp.locator('#codigo-comunidad').count();
  if (enCodigo !== 1) throw new Error('no volvió al paso del código tras el rechazo');
  await contextoApp.close();
});

await paso('fijar_ventana_vigente_hoy_y_confirmar_hora_exacta_en_el_servidor', async () => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
  await p.fill(`[data-vig-desde="${idCodigo}"]`, hoy);
  await p.fill(`[data-vig-hasta="${idCodigo}"]`, hoy);
  await p.click(`[data-guardar-vigencia="${idCodigo}"]`);
  await p.waitForTimeout(600);

  // Que la ventana termine a las 23:59:59 DE EL SALVADOR, no de UTC —
  // es justo el bug que esta prueba existe para no dejar repetir.
  const r = await p.evaluate(async (codigo) => {
    const resp = await fetch('http://localhost:8080/api/v1/dispositivos/enrolar', {
      method: 'POST',
      headers: { 'X-App-Secret': 'dev_secret_local', 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_comunidad: codigo, alias: 'PRUEBA VIGENCIA' }),
    });
    return resp.json();
  }, codigoTexto);
  if (!r.success) throw new Error('el código vigente hoy fue rechazado: ' + r.error);
});

await paso('extender_una_semana_mueve_la_fecha_siete_dias_en_hora_de_el_salvador', async () => {
  const antes = await p.locator(`[data-comunidad-bloque="${idComunidad}"] .codigo-row:first-child small`).textContent();
  await p.click(`[data-extender="${idCodigo}"]`);
  await p.waitForTimeout(600);
  const despues = await p.locator(`[data-comunidad-bloque="${idComunidad}"] .codigo-row:first-child small`).textContent();
  if (antes === despues) throw new Error('el texto de vigencia no cambió tras +1 semana');
  if (!despues.startsWith('Vigente del')) throw new Error('tras extender ya no se ve como un código vigente: ' + despues);
});

console.log(JSON.stringify(s, null, 2));
console.log('errores de consola inesperados:', erroresPanel);
await b.close();
process.exit(Object.values(s).every(Boolean) && erroresPanel.length === 0 ? 0 : 1);
