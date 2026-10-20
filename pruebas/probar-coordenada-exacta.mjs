/* =====================================================================
   Requiere un reporte con reporte.geom real — ninguna prueba e2e
   actual simula soltar un pin de verdad en el mapa (arrastrar Leaflet
   + GPS), así que esto no existe solo con correr la suite normal.
   Antes de correr esta prueba:

     docker exec vigente-db-1 psql -U observatorio -d observatorio -c \
       "UPDATE reporte SET geom = ST_SetSRID(ST_MakePoint(-88.4501, 13.3502), 4326) WHERE id = 309;"

   Y después, para no dejar el fixture de ZAP001 con un dato que no le
   pertenece de forma permanente:

     docker exec vigente-db-1 psql -U observatorio -d observatorio -c \
       "UPDATE reporte SET geom = NULL WHERE id = 309;"

   Verificado así (con el punto puesto y quitado) el 20 de septiembre
   de 2026 — ver docs/decision-05-coordenada-exacta-panel.md.
   ===================================================================== */
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
await p.click('.lat a[data-v="casos"]');
await p.fill('#c-buscar', 'Contaminaron el agua del río con desechos');
await p.waitForTimeout(500);
await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });

await paso('caso_con_punto_muestra_el_mapa_y_un_marcador', async () => {
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('#detalle .det-head', { timeout: 8000 });
  await p.waitForSelector('#c-mapa-exacto .leaflet-marker-icon', { timeout: 8000 });
  const texto = await p.locator('#detalle').textContent();
  if (!texto.includes('La persona marcó un punto exacto')) throw new Error('no cambió el texto de Ubicación: ' + texto.slice(0, 200));
});

await paso('cerrar_y_reabrir_no_rompe_el_mapa_leaflet', async () => {
  // El gotcha clásico: si no se destruye la instancia anterior,
  // Leaflet tira "Map container is already initialized" la segunda vez.
  await p.click('#c-cerrar');
  await p.click('#c-tabla tr[data-id]');
  await p.waitForSelector('#c-mapa-exacto .leaflet-marker-icon', { timeout: 8000 });
});

await paso('caso_sin_punto_no_muestra_ningun_mapa', async () => {
  await p.click('#c-cerrar');
  await p.fill('#c-buscar', '');
  await p.waitForTimeout(500);
  // La fila 309 (con punto) ya no es necesariamente la primera — se
  // busca explícitamente una fila DISTINTA a la que ya se abrió.
  const filas = p.locator('#c-tabla tr[data-id]');
  const total = await filas.count();
  let encontroSinPunto = false;
  for (let i = 0; i < Math.min(total, 5) && !encontroSinPunto; i++) {
    await filas.nth(i).click();
    await p.waitForSelector('#detalle .det-head', { timeout: 8000 });
    const tieneMapa = await p.locator('#c-mapa-exacto').count();
    if (tieneMapa === 0) {
      encontroSinPunto = true;
      const texto = await p.locator('#detalle').textContent();
      if (!texto.includes('sin punto marcado')) throw new Error('texto de Ubicación inesperado: ' + texto.slice(0, 200));
    } else {
      await p.click('#c-cerrar');
    }
  }
  if (!encontroSinPunto) throw new Error('no se encontró ningún caso sin punto entre los primeros 5 para comparar');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
