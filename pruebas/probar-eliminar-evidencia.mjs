/* Eliminar una fotografía de evidencia desde el detalle de un caso —
   pedido de Marco (2026-10-20), primer cambio del panel como repo
   propio. Reproduce el circuito real: un reporte nuevo con foto desde
   la app comunitaria, y desde el panel lo encuentra, cancela una vez
   (la foto debe seguir ahí) y luego confirma (la foto debe
   desaparecer para siempre — ni en el DOM al reabrir, ni en la base).

   Usa su PROPIO texto de relato, distinto al que usan
   app/pruebas/e2e/probar-reportar.mjs y
   panel/pruebas/probar-evidencia-fotos.mjs ("Contaminaron el agua del
   río con desechos") — si reutilizara ese mismo caso y lo borrara de
   verdad, rompería esas otras dos pruebas que dependen de que ese caso
   siga teniendo su foto. */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const CON_EXIF_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QBSRXhpZgAATU0AKgAAAAgAAwEPAAIAAAAIAAAAMgEQAAIAAAAPAAAAOgESAAMAAAABAAEAAAAAAABUZXN0Q2FtAE1vZGVsb0RlUHJ1ZWJhAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAtADwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRXnnsBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/2Q==';
if (!existsSync('/tmp/con_exif.jpg')) writeFileSync('/tmp/con_exif.jpg', Buffer.from(CON_EXIF_B64, 'base64'));

const RELATO = 'Prueba de eliminar evidencia — ' + Date.now();

const b = await chromium.launch();
const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

// --- Primero, un reporte real con una foto, desde la app comunitaria ---
const contextoApp = await b.newContext({ permissions: [] });
const pApp = await contextoApp.newPage();
await pApp.goto('http://localhost:8902/index.html', { waitUntil: 'networkidle' });
await pApp.click('[data-accion="seguir"]');
await pApp.click('[data-accion="seguir"]');
await pApp.fill('#codigo-comunidad', 'ZAP001');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('[data-alias]');
await pApp.click('[data-alias]');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('.volanta', { timeout: 8000 });
await pApp.click('[data-estructura="nd"]');
await pApp.click('[data-sexo="mujer"]');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('[data-clave="sin"]');
await pApp.click('[data-clave="sin"]');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('.codigo', { timeout: 8000 });
await pApp.click('[data-accion="terminar"]');
await pApp.waitForSelector('.cabecera__alias', { timeout: 8000 });

await pApp.click('[data-accion="reportar"]');
await pApp.waitForSelector('h2:has-text("¿Qué pasó?")', { timeout: 8000 });
await pApp.click('[data-familia="territorio"]');
await pApp.waitForSelector('h2:has-text("¿Qué fue lo que pasó?")', { timeout: 8000 });
await pApp.click('[data-tipo]');
await pApp.waitForSelector('h2:has-text("¿Dónde fue?")', { timeout: 8000 });
await pApp.click('[data-lugar="aqui"]');
await pApp.waitForSelector('[data-accion="seguir"]:not([disabled])');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('h2:has-text("¿Cuándo fue?")', { timeout: 8000 });
await pApp.click('[data-cuando="hoy"]');
await pApp.waitForSelector('[data-accion="seguir"]:not([disabled])');
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('h2:has-text("Cuente lo que pasó")', { timeout: 8000 });
await pApp.fill('#relato', RELATO);
await pApp.waitForTimeout(300);
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('h2:has-text("¿Tiene fotos?")', { timeout: 8000 });
await pApp.click('[data-accion="agregar-foto"]');
await pApp.setInputFiles('#entrada-foto', '/tmp/con_exif.jpg');
await pApp.waitForSelector('.foto img', { timeout: 8000 });
await pApp.click('[data-accion="seguir"]');
await pApp.waitForSelector('h2:has-text("Revise antes de enviar")', { timeout: 8000 });
await pApp.click('[data-accion="enviar"]');
await pApp.waitForSelector('.enviado__folio', { timeout: 15000 });
await contextoApp.close();

// --- Ahora, desde el panel ---
const contextoPanel = await b.newContext();
const p = await contextoPanel.newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });

await paso('encuentra_el_caso_recien_creado_con_su_foto', async () => {
  await p.click('.lat a[data-v="casos"]');
  await p.fill('#c-buscar', RELATO);
  await p.waitForTimeout(500);
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('.fotito-borrar[data-borrar-foto]', { timeout: 8000 });
  await p.waitForFunction(() => {
    const b = document.querySelector('.fotito[data-foto]');
    return b && !b.classList.contains('cargando-foto');
  }, { timeout: 8000 });
});

await paso('cancelar_el_aviso_deja_la_foto_intacta', async () => {
  p.once('dialog', (d) => d.dismiss());
  await p.click('.fotito-borrar[data-borrar-foto]');
  await p.waitForTimeout(300);
  const sigueAhi = await p.locator('.fotito-envoltura').count();
  if (sigueAhi !== 1) throw new Error('la foto desapareció aunque se canceló el aviso');
});

await paso('confirmar_el_aviso_borra_la_foto_para_siempre', async () => {
  p.once('dialog', (d) => d.accept());
  await p.click('.fotito-borrar[data-borrar-foto]');
  await p.waitForSelector('text=Sin fotografías adjuntas.', { timeout: 8000 });
  const quedaAlguna = await p.locator('.fotito-envoltura').count();
  if (quedaAlguna !== 0) throw new Error('la foto seguía en el DOM tras confirmar el borrado');
});

await paso('la_bitacora_registra_quien_borro_la_foto', async () => {
  const tieneNota = await p.locator('#detalle').getByText('Eliminó una fotografía de evidencia').count();
  if (tieneNota === 0) throw new Error('no quedó la nota de bitácora esperada en el detalle');
});

await paso('reabrir_el_caso_desde_cero_confirma_que_no_quedo_en_la_base', async () => {
  await p.click('#c-cerrar');
  await p.waitForTimeout(200);
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('text=Sin fotografías adjuntas.', { timeout: 8000 });
  const quedaAlguna = await p.locator('.fotito-envoltura').count();
  if (quedaAlguna !== 0) throw new Error('al reabrir el caso la foto volvió a aparecer en el DOM');
});

console.log(JSON.stringify(s, null, 2));
console.log('errores de consola inesperados:', errores);
await b.close();
process.exit(Object.values(s).every(Boolean) && errores.length === 0 ? 0 : 1);
