import { chromium } from 'playwright';

// Decisión 09: el texto del muro arranca con el relato, el administrador
// lo corrige y el filtro lo revisa antes de publicar. Usa un caso de
// prueba (CASO) y lo deja como estaba al final (ver el SQL de limpieza
// en la salida).
const CASO = Number(process.env.CASO || 406);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
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
await p.waitForSelector('#c-tabla tr[data-id]', { timeout: 8000 });
const abrir = () => p.evaluate((id) => import('/js/vistas/casos.js').then((m) => m.abrirFichaCaso(id)), CASO);

await paso('el_texto_para_el_muro_arranca_con_el_relato', async () => {
  await abrir();
  await p.waitForSelector('#c-resumen-publico', { timeout: 6000 });
  const relato = (await p.locator('#detalle .relato').textContent()).trim().replace(/^"|"$/g, '');
  const texto = await p.locator('#c-resumen-publico').inputValue();
  if (texto.trim() !== relato.trim()) throw new Error('el cuadro no trae el relato: ' + texto.slice(0, 60));
});

await paso('una_mencion_politica_en_leet_no_deja_publicar', async () => {
  await p.fill('#c-resumen-publico', 'El agua del río sigue sucia y BUK3L3 no ha hecho nada.');
  await p.click('#c-publicar');
  await p.waitForSelector('.revision-bloqueo', { timeout: 5000 });
  if (!(await p.locator('#c-publicar-error').isVisible())) throw new Error('no mostró el error');
  if (!/bukele/i.test(await p.locator('.revision-bloqueo').textContent())) throw new Error('no nombró el término');
});

await paso('un_telefono_exige_confirmar_la_advertencia', async () => {
  await p.fill('#c-resumen-publico', 'El agua del río sigue sucia. Para más datos llamar al 7777-1234.');
  await p.click('#c-publicar');
  await p.waitForSelector('#c-advertencias-ok', { timeout: 5000 });
  if (!/tel[eé]fono/i.test(await p.locator('.revision-aviso').textContent())) throw new Error('no avisó del teléfono');
});

const TEXTO = 'Contaminaron el agua del río con desechos. La comunidad pide que se analice el agua. Línea agregada por el administrador.';
await paso('texto_limpio_se_publica_y_aparece_completo_en_el_muro', async () => {
  await p.fill('#c-resumen-publico', TEXTO);
  await p.click('#c-publicar');
  await p.waitForSelector('#c-publicar:has-text("Guardar texto publicado")', { timeout: 6000 });
  const m = await b.newPage();
  await m.goto('http://localhost:8904/index.html', { waitUntil: 'networkidle' });
  await m.evaluate(() => document.getElementById('bienvenida')?.classList.remove('on'));
  await m.fill('#buscar-input', 'Línea agregada por el administrador');
  await m.waitForTimeout(900);
  await m.locator('.tarjeta .btn-ver').first().click();
  const enMuro = await m.locator('#ficha .ficha__relato').textContent();
  if (enMuro.trim() !== TEXTO) throw new Error('el muro no muestra el texto completo: ' + enMuro);
  await m.close();
});

await paso('el_texto_publicado_se_puede_corregir', async () => {
  await p.fill('#c-resumen-publico', TEXTO + ' Corregido.');
  await p.click('#c-publicar');
  await p.waitForFunction(() => document.querySelector('#detalle')?.textContent.includes('Texto publicado editado'), null, { timeout: 6000 });
});

await paso('copiar_el_relato_trae_la_narrativa_completa_a_un_caso_publicado', async () => {
  await p.waitForSelector('#c-copiar-relato', { timeout: 6000 });
  await p.click('#c-copiar-relato');
  const relato = (await p.locator('#detalle .relato').textContent()).trim().replace(/^"|"$/g, '');
  const texto = await p.locator('#c-resumen-publico').inputValue();
  if (texto.trim() !== relato.trim()) throw new Error('no copió el relato');
});

console.log(JSON.stringify(s, null, 2));
const fallas = Object.entries(s).filter(([, v]) => v !== true);
const inesperados = errores.filter((e) => !/Failed to load resource.*(404|400)/.test(e));
console.log('errores de consola inesperados:', inesperados);
console.log(fallas.length === 0 && inesperados.length === 0 ? 'TODO OK' : 'FALLAS: ' + JSON.stringify(fallas));
console.log(`Limpieza: UPDATE reporte SET publicado=FALSE, fecha_publicacion=NULL, resumen_publico=NULL WHERE id=${CASO}; DELETE FROM seguimiento_caso WHERE reporte_id=${CASO} AND automatica AND nota IN ('Publicado al muro público.','Texto publicado editado.');`);
await b.close();
process.exit(fallas.length === 0 && inesperados.length === 0 ? 0 : 1);
