/* =====================================================================
   Decisión 06 (docs/decision-06-coordenadas-exactas-mapa-admin.md):
   en la vista Mapa general, el punto EXACTO de un reporte solo lo ve
   el rol administrador. Un operador debe seguir viendo únicamente el
   centro de la comunidad, igual que antes de esta decisión — nunca el
   punto de un reporte individual, ni uno solo.

   Requiere un reporte con reporte.geom real, igual que
   probar-coordenada-exacta.mjs (mismo fixture, ZAP001/id 309). Antes
   de correr esta prueba:

     docker exec vigente-db-1 psql -U observatorio -d observatorio -c \
       "UPDATE reporte SET geom = ST_SetSRID(ST_MakePoint(-88.4501, 13.3502), 4326) WHERE id = 309;"

   Y después, para no dejar el fixture de ZAP001 con un dato que no le
   pertenece de forma permanente:

     docker exec vigente-db-1 psql -U observatorio -d observatorio -c \
       "UPDATE reporte SET geom = NULL WHERE id = 309;"
   ===================================================================== */
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errores = [];
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

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

const correoOperador = 'verif-mapa-exacto-' + Date.now() + '@dev.local';
const claveOperador = 'clave-verif-mapa-12345';

await paso('administrador_ve_el_punto_exacto_en_el_mapa_general', async () => {
  const r = await p.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/mapa', {
      headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t },
    });
    return resp.json();
  });
  if (r.data.puede_ver_exacto !== true) throw new Error('puede_ver_exacto debía ser true para administrador');
  const exactos = r.data.puntos.filter((x) => x.es_exacto);
  if (exactos.length < 1) throw new Error('ningún punto vino marcado como exacto — ¿se aplicó el UPDATE del fixture 309?');
});

await paso('la_leyenda_del_mapa_distingue_punto_exacto_de_centro_de_comunidad', async () => {
  await p.click('.lat a[data-v="mapa"]');
  await p.waitForSelector('#r-mapa', { timeout: 8000 });
  await p.waitForTimeout(1200);
  const leyenda = await p.locator('#m-leyenda').textContent();
  if (!leyenda.includes('Punto exacto del reporte')) throw new Error('la leyenda de administrador no distingue el punto exacto: ' + leyenda);
});

await paso('crear_operador_de_prueba', async () => {
  const r = await p.evaluate(async ({ correo, clave }) => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/usuarios', {
      method: 'POST',
      headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Verificación mapa exacto', correo, clave, rol: 'operador' }),
    });
    return resp.json();
  }, { correo: correoOperador, clave: claveOperador });
  if (!r.success) throw new Error('no se pudo crear el operador de prueba: ' + JSON.stringify(r));
});

await paso('operador_nunca_ve_el_punto_exacto_en_el_mapa_general', async () => {
  await p.evaluate(() => localStorage.removeItem('panel_sesion'));
  await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
  await p.fill('#login-correo', correoOperador);
  await p.fill('#login-clave', claveOperador);
  await p.click('#login-boton');
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });

  const r = await p.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('panel_sesion')).token;
    const resp = await fetch('http://localhost:8080/api/v1/admin/mapa', {
      headers: { 'X-App-Secret': 'dev_secret_local', Authorization: 'Bearer ' + t },
    });
    return resp.json();
  });
  if (r.data.puede_ver_exacto !== false) throw new Error('puede_ver_exacto debía ser false para operador');
  const exactos = r.data.puntos.filter((x) => x.es_exacto);
  if (exactos.length !== 0) throw new Error('el operador recibió ' + exactos.length + ' punto(s) marcado(s) como exacto — nunca debería');

  await p.click('.lat a[data-v="mapa"]');
  await p.waitForSelector('#r-mapa', { timeout: 8000 });
  await p.waitForTimeout(1200);
  const leyenda = await p.locator('#m-leyenda').textContent();
  if (leyenda.includes('Punto exacto del reporte')) throw new Error('la leyenda de operador no debía mencionar el punto exacto: ' + leyenda);
  if (!leyenda.includes('nunca en la coordenada exacta')) throw new Error('falta el aviso original de operador: ' + leyenda);
});

// Nunca se borra una cuenta, se desactiva — mismo criterio que
// admin/usuarios.php en todo el panel.
await paso('limpieza_desactivar_operador_de_prueba', async () => {
  await p.evaluate(() => localStorage.removeItem('panel_sesion'));
  await p.goto('http://localhost:8903/index.html', { waitUntil: 'networkidle' });
  await p.fill('#login-correo', 'marco@dev.local');
  await p.fill('#login-clave', 'prueba-dev-2026');
  await p.click('#login-boton');
  await p.waitForSelector('#app-shell:not([hidden])', { timeout: 8000 });
  await p.click('.lat a[data-v="config"]');
  await p.waitForSelector('#cfg-usuarios .lista-item', { timeout: 8000 });
  const fila = p.locator('.lista-item', { hasText: 'Verificación mapa exacto' });
  await fila.locator('[data-usuario-toggle]').click();
  await p.waitForTimeout(500);
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
