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

await paso('sin_sesion_muestra_login_no_el_shell', async () => {
  await p.waitForSelector('#login-form', { timeout: 4000 });
  const shellVisible = await p.locator('#app-shell').isVisible();
  if (shellVisible) throw new Error('el shell quedó visible sin sesión');
});

await paso('login_con_clave_incorrecta_muestra_error_y_no_entra', async () => {
  await p.fill('#login-correo', 'marco@dev.local');
  await p.fill('#login-clave', 'clave-mala');
  await p.click('#login-boton');
  await p.waitForSelector('#login-error:visible', { timeout: 4000 });
  const shellVisible = await p.locator('#app-shell').isVisible();
  if (shellVisible) throw new Error('entró al shell con una clave incorrecta');
});

await paso('login_correcto_entra_y_muestra_el_nombre_real', async () => {
  await p.fill('#login-clave', 'prueba-dev-2026');
  await p.click('#login-boton');
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  await p.waitForSelector('#r-kpis .kpi', { timeout: 8000 }); // Resumen cargó con datos reales
  const pie = await p.locator('#usuario-pie').textContent();
  if (!pie.includes('Marco (prueba local)')) throw new Error('no se mostró el nombre real del usuario: ' + pie);
});

await paso('sesion_sobrevive_a_una_recarga_de_pagina', async () => {
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  const loginVisible = await p.locator('#login-form').count();
  if (loginVisible !== 0) throw new Error('recargar la página pidió login de nuevo');
});

await paso('descartar_sin_nota_muestra_error_del_servidor', async () => {
  await p.click('.lat a[data-v="casos"]');
  await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
  await p.locator('#c-tabla tr[data-id]').first().click();
  await p.waitForSelector('#overlay.on', { timeout: 4000 });
  await p.selectOption('#c-estado-nuevo', 'descartado');
  await p.click('#c-guardar');
  await p.waitForSelector('#c-gestion-error:visible', { timeout: 4000 });
  const texto = await p.locator('#c-gestion-error').textContent();
  if (!texto.toLowerCase().includes('motivo')) throw new Error('el error no mencionó que falta el motivo: ' + texto);
});

await paso('descartar_con_nota_funciona_y_queda_en_bitacora', async () => {
  const antes = await p.locator('.bit').count();
  await p.fill('#c-nota', 'Trae fotografías de un político reconocido — no corresponde al observatorio.');
  await p.click('#c-guardar');
  // Esperar a que la bitácora tenga una entrada MÁS, no cualquier .bit:
  // la ficha ya mostraba la bitácora anterior antes de guardar, y el caso
  // puede traer entradas con el mismo texto de corridas anteriores
  // (falso fallo visto el 2026-10-20).
  await p.waitForFunction((n) => document.querySelectorAll('.bit').length > n, antes, { timeout: 8000 });
  const bitacora = await p.locator('.bit').first().textContent();
  if (!bitacora.includes('Descartado')) throw new Error('la bitácora no muestra el nuevo estado: ' + bitacora);
  if (!bitacora.includes('político reconocido')) throw new Error('la bitácora no guardó la nota: ' + bitacora);
  if (!bitacora.includes('Marco (prueba local)')) throw new Error('la bitácora no atribuyó el cambio al usuario real: ' + bitacora);
});

await paso('la_fila_de_fondo_ya_muestra_descartado_sin_cerrar_el_detalle', async () => {
  const detalleAbierto = await p.locator('#overlay.on').count();
  if (detalleAbierto === 0) throw new Error('el detalle se cerró solo tras guardar');
  const estadoPill = await p.locator('.det-head + .grid2 select#c-estado-nuevo').inputValue();
  if (estadoPill !== 'descartado') throw new Error('el select no quedó en "descartado" tras guardar');
  await p.click('#c-cerrar');
});

await paso('publicar_con_el_relato_original_rechaza', async () => {
  // Buscar un caso "cerrado" para publicar (con contenido real distinto de vacío).
  await p.click('.filtro[data-e="cerrado"]');
  await p.waitForTimeout(400);
  await p.locator('#c-tabla tr[data-id]').first().click();
  await p.waitForSelector('#overlay.on', { timeout: 4000 });
  const relato = (await p.locator('.relato').textContent()).replace(/^"|"$/g, '');
  const hayPublicar = await p.locator('#c-publicar').count();
  if (hayPublicar === 0) throw new Error('no apareció el bloque de publicar para un usuario administrador');
  await p.fill('#c-resumen-publico', relato);
  await p.click('#c-publicar');
  await p.waitForSelector('#c-publicar-error:visible', { timeout: 4000 });
});

await paso('publicar_con_resumen_redactado_funciona', async () => {
  await p.fill('#c-resumen-publico', 'En una comunidad de la zona se documentó un hecho que ya fue atendido.');
  await p.click('#c-publicar');
  await p.waitForSelector('text=Este caso ya está publicado', { timeout: 8000 });
});

await paso('cerrar_sesion_vuelve_al_login', async () => {
  await p.click('#c-cerrar');
  await p.click('#cerrar-sesion');
  await p.waitForSelector('#login-form', { timeout: 4000 });
  const shellVisible = await p.locator('#app-shell').isVisible();
  if (shellVisible) throw new Error('cerrar sesión no ocultó el shell');
});

await paso('tras_cerrar_sesion_recargar_pide_login_de_nuevo', async () => {
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#login-form', { timeout: 4000 });
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
// 401 (clave incorrecta) y 400 (nota faltante, resumen igual al relato)
// son justo lo que estas pruebas disparan a propósito para verificar
// que el servidor rechaza — no son fallas.
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*(404|401|400)/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
