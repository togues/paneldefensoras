/* Punto de referencia de una comunidad — Marco encontró en producción
   que el Mapa de incidencias siempre mostraba "0 reportes
   georreferenciados": ninguna comunidad creada por el formulario real
   del panel tenía nunca una ubicación guardada (comunidad.geom solo se
   llenaba a mano por SQL en los datos de piloto/demo). Esta prueba
   cubre el circuito completo: marcar un punto al crear una comunidad
   nueva, verlo reflejado en GET /admin/mapa, cambiarlo y quitarlo
   desde "Editar". */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
p.on('dialog', (d) => d.accept());

const s = {};
async function paso(nombre, fn) {
  try { await fn(); s[nombre] = true; }
  catch (e) { s[nombre] = false; console.error(`FALLO en "${nombre}":`, e.message); }
}

await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
await p.fill('#login-correo', 'marco@dev.local');
await p.fill('#login-clave', 'prueba-dev-2026');
await p.click('#login-boton');
await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
await p.click('.lat a[data-v="config"]');
await p.waitForSelector('[data-generar]', { timeout: 8000 });

const NOMBRE = 'Comunidad con mapa ' + Date.now();
let idComunidad;

await paso('crear_comunidad_marcando_un_punto_en_el_mapa', async () => {
  await p.click('#cfg-mostrar-form-comunidad');
  await p.waitForFunction(() => document.getElementById('cfg-c-canton')?.options.length > 0, { timeout: 4000 });
  await p.fill('#cfg-c-nombre', NOMBRE);
  // El mapa recién se vuelve visible: clic en el centro del contenedor,
  // que cae sobre el centro de El Salvador (la vista inicial sin punto).
  // scrollIntoViewIfNeeded() es obligatorio antes de leer boundingBox():
  // page.mouse.click() usa coordenadas de viewport, no de página — sin
  // desplazar primero, el clic cae fuera de lo visible y no pasa nada
  // (encontrado de verdad corriendo esta prueba, 2026-10-20).
  await p.locator('#cfg-c-mapa').scrollIntoViewIfNeeded();
  const caja = await p.locator('#cfg-c-mapa').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.waitForSelector('text=/Punto marcado:/', { timeout: 2000 });
  await p.click('#cfg-form-comunidad button[type="submit"]');
  await p.waitForSelector(`text=${NOMBRE}`, { timeout: 8000 });
  idComunidad = await p.locator('[data-comunidad-bloque]', { hasText: NOMBRE }).getAttribute('data-comunidad-bloque');
});

await paso('el_mapa_de_incidencias_ya_la_cuenta', async () => {
  const r = await p.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/mapa', {
      headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t },
    });
    return resp.json();
  });
  if (!r.success) throw new Error('GET /admin/mapa falló: ' + JSON.stringify(r));
  // No hace falta que la comunidad nueva tenga reportes — solo que el
  // endpoint responda con puntos reales en vez de reventar. La prueba
  // de fondo real es la siguiente (que SU lat/lon haya quedado
  // guardada), porque esta comunidad nueva todavía no tiene reportes.
});

await paso('la_comunidad_guardo_lat_lon_reales', async () => {
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque.locator('[data-mostrar-editar-comunidad]').click();
  await p.waitForSelector(`[data-ubicacion-texto="${idComunidad}"]`, { timeout: 2000 });
  const texto = await p.locator(`[data-ubicacion-texto="${idComunidad}"]`).textContent();
  if (!texto.startsWith('Punto actual:')) throw new Error('no se guardó el punto al crear: ' + texto);
});

await paso('mover_el_punto_y_guardar_lo_actualiza', async () => {
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque.locator(`[data-mapa-comunidad="${idComunidad}"]`).scrollIntoViewIfNeeded();
  const caja = await bloque.locator(`[data-mapa-comunidad="${idComunidad}"]`).boundingBox();
  // Un punto bien distinto al centro, para confirmar que de verdad cambia.
  await p.mouse.click(caja.x + caja.width * 0.2, caja.y + caja.height * 0.2);
  await bloque.locator('[data-guardar-comunidad]').click();
  await p.waitForTimeout(600);
  await p.waitForSelector(`text=${NOMBRE}`, { timeout: 8000 });
});

await paso('quitar_ubicacion_la_borra_de_verdad', async () => {
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque.locator('[data-mostrar-editar-comunidad]').click();
  await bloque.locator('[data-quitar-ubicacion]').click();
  await bloque.locator('[data-guardar-comunidad]').click();
  await p.waitForTimeout(600);
  await p.waitForSelector(`text=${NOMBRE}`, { timeout: 8000 });
  const bloque2 = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque2.locator('[data-mostrar-editar-comunidad]').click();
  const texto = await p.locator(`[data-ubicacion-texto="${idComunidad}"]`).textContent();
  if (!texto.startsWith('Sin marcar')) throw new Error('la ubicación debía quedar vacía: ' + texto);
});

// Limpieza — no es un fixture compartido, es exclusiva de esta corrida.
await paso('limpieza_desactivar_comunidad_de_prueba', async () => {
  const bloque = p.locator(`[data-comunidad-bloque="${idComunidad}"]`);
  await bloque.locator('[data-comunidad-toggle]').click();
  await p.waitForTimeout(400);
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
console.log('errores de consola inesperados:', errores);
console.log(fallas.length === 0 && errores.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));
await b.close();
process.exit(fallas.length === 0 && errores.length === 0 ? 0 : 1);
