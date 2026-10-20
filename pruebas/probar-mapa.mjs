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
await p.click('.lat a[data-v="mapa"]');

await paso('mapa_carga_y_muestra_resumen_real', async () => {
  await p.waitForSelector('#m-resumen', { timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('m-resumen')?.textContent?.includes('reportes georreferenciados'), { timeout: 8000 });
  const texto = await p.locator('#m-resumen').textContent();
  if (!/^\d+ reportes georreferenciados/.test(texto.trim())) throw new Error('resumen inesperado: ' + texto);
});

await paso('leaflet_esta_cargado_y_el_mapa_existe', async () => {
  const ok = await p.evaluate(() => !!window.L && document.getElementById('r-mapa')?.classList.contains('leaflet-container'));
  if (!ok) throw new Error('Leaflet no inicializó el mapa');
});

// Los reportes de demo comparten el mismo centro de comunidad (varios
// caen en la misma coordenada a propósito — regla 5), así que a este
// zoom Leaflet.markercluster los agrupa en burbujas (.marker-cluster,
// un ícono) en vez de mostrar un <path> por punto. Cuentan los dos.
function contarPuntos(p) {
  return p.evaluate(() => document.querySelectorAll('#r-mapa .leaflet-marker-icon, #r-mapa path.leaflet-interactive').length);
}

await paso('hay_marcadores_o_clusters_dibujados', async () => {
  await p.waitForTimeout(500); // fitBounds + animación
  const cantidad = await contarPuntos(p);
  if (cantidad === 0) throw new Error('no se dibujó ningún marcador ni cluster en el mapa');
});

await paso('filtro_contra_personas_reduce_los_puntos', async () => {
  const antes = await contarPuntos(p);
  await p.click('.filtro[data-f="persona"]');
  await p.waitForTimeout(400);
  const despues = await contarPuntos(p);
  if (despues === 0) throw new Error('el filtro "contra personas" dejó el mapa sin puntos');
  if (despues > antes) throw new Error('filtrar debería reducir o igualar los puntos, no aumentarlos: antes=' + antes + ' despues=' + despues);
});

await paso('filtro_todos_los_hechos_vuelve_a_mostrar_todo', async () => {
  await p.click('.filtro[data-f="todos"]');
  await p.waitForTimeout(400);
  const cantidad = await contarPuntos(p);
  if (cantidad === 0) throw new Error('volver a "todos" dejó el mapa vacío');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const erroresInesperados = errores.filter((e) => !/Failed to load resource.*404/.test(e));
console.log('errores de consola inesperados:', erroresInesperados);
console.log(fallas.length === 0 && erroresInesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));

await b.close();
process.exit(fallas.length === 0 && erroresInesperados.length === 0 ? 0 : 1);
