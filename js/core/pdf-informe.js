/* =====================================================================
   Informe de seguimiento en PDF — lo que REDNA entrega en mano a una
   organización comunitaria (Junta de Agua, Mesa Territorial...) para que
   le dé seguimiento a los casos de su tema. Ver
   docs/decision-07-informe-seguimiento.md.

   Se arma en el NAVEGADOR con pdf-lib: no queda copia en el servidor, y
   no se manda por correo (pedido de Marco: "para no dejar rastro").

   SIN METADATOS: PDFDocument.create({ updateMetadata: false }) no escribe
   Producer, Creator, CreationDate, ModDate, Author ni Title — el botón
   "Descargar informe PDF" de Casos usa imprimir del navegador, que sí
   los agrega siempre y no se pueden quitar. La prueba
   probar-informe-pdf.mjs revisa los bytes del archivo.

   De lo general a lo específico: quién y qué período → cuántos y en qué
   estado → por tema → por comunidad → lo que se repite → caso por caso.
   Nunca relato, lugar, fotografías ni coordenadas (no vienen de la API).
   ===================================================================== */
import { NOMBRE_FAMILIA, ETIQ_ESTADO, diaLegible } from './graficas.js';

const A4 = [595.28, 841.89];
const MARGEN = 48;
const ANCHO = A4[0] - MARGEN * 2;
const PIE = 40;

// Caracteres que la fuente estándar (WinAnsi) sabe dibujar, además de
// Latin-1. Cualquier otro (emoji, alfabetos no latinos) haría fallar a
// pdf-lib: se reemplaza por "?" en vez de romper el informe entero.
const EXTRA_WINANSI = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function limpio(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').replace(/./gu, (c) => {
    const n = c.codePointAt(0);
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || EXTRA_WINANSI.includes(c) ? c : '?';
  });
}

const COLOR = {
  texto: [0.09, 0.11, 0.11],
  suave: [0.25, 0.29, 0.27],
  tenue: [0.43, 0.47, 0.46],
  linea: [0.83, 0.85, 0.85],
  fondo: [0.95, 0.96, 0.96],
  primario: [0.05, 0.32, 0.28],
  familia: { persona: [0.64, 0.17, 0.12], territorio: [0.69, 0.38, 0.04], gestion: [0.36, 0.29, 0.54], logro: [0.18, 0.42, 0.31] },
  estado: { recibido: [0.64, 0.17, 0.12], en_investigacion: [0.69, 0.38, 0.04], cerrado: [0.18, 0.42, 0.31], descartado: [0.43, 0.47, 0.46] },
};

class Lienzo {
  constructor(doc, fuentes) {
    this.doc = doc;
    this.f = fuentes;
    this.nuevaPagina();
  }

  rgb(c) { return PDFLib.rgb(c[0], c[1], c[2]); }

  nuevaPagina() {
    this.pagina = this.doc.addPage(A4);
    this.y = A4[1] - MARGEN;
  }

  /** Salta de página si no caben `alto` puntos más. */
  espacio(alto) {
    if (this.y - alto < MARGEN + PIE) this.nuevaPagina();
  }

  partir(texto, tam, fuente, ancho) {
    const palabras = limpio(texto).split(' ');
    const lineas = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
      else { if (actual) lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  texto(texto, { tam = 10, negrita = false, color = COLOR.texto, x = MARGEN, ancho = ANCHO, interlinea = 1.35, antes = 0 } = {}) {
    const fuente = negrita ? this.f.negrita : this.f.normal;
    this.y -= antes;
    for (const linea of this.partir(texto, tam, fuente, ancho)) {
      this.espacio(tam * interlinea);
      this.y -= tam;
      this.pagina.drawText(linea, { x, y: this.y, size: tam, font: fuente, color: this.rgb(color) });
      this.y -= tam * (interlinea - 1);
    }
  }

  regla(antes = 8, despues = 12) {
    this.y -= antes;
    this.pagina.drawLine({ start: { x: MARGEN, y: this.y }, end: { x: A4[0] - MARGEN, y: this.y }, thickness: 0.6, color: this.rgb(COLOR.linea) });
    this.y -= despues;
  }

  seccion(titulo) {
    this.espacio(60);
    this.texto(titulo, { tam: 13, negrita: true, color: COLOR.primario, antes: 14 });
    this.y -= 6;
  }

  /** Cajas de indicadores en una fila. */
  indicadores(items) {
    const alto = 46;
    const sep = 8;
    const ancho = (ANCHO - sep * (items.length - 1)) / items.length;
    this.espacio(alto + 6);
    items.forEach((it, i) => {
      const x = MARGEN + i * (ancho + sep);
      this.pagina.drawRectangle({ x, y: this.y - alto, width: ancho, height: alto, color: this.rgb(COLOR.fondo) });
      this.pagina.drawText(limpio(String(it.valor)), { x: x + 9, y: this.y - 22, size: 17, font: this.f.negrita, color: this.rgb(it.color || COLOR.texto) });
      this.pagina.drawText(limpio(it.texto), { x: x + 9, y: this.y - 37, size: 7.5, font: this.f.normal, color: this.rgb(COLOR.suave) });
    });
    this.y -= alto + 6;
  }

  /** Barras horizontales: [{ etiqueta, valor, color }]. */
  barras(filas) {
    if (!filas.length) return;
    const max = Math.max(...filas.map((f) => f.valor), 1);
    const anchoEtiqueta = 190;
    const anchoBarra = ANCHO - anchoEtiqueta - 34;
    for (const f of filas) {
      this.espacio(16);
      const y = this.y - 10;
      const etiqueta = this.partir(f.etiqueta, 8.5, this.f.normal, anchoEtiqueta - 8)[0] || '';
      this.pagina.drawText(etiqueta, { x: MARGEN, y, size: 8.5, font: this.f.normal, color: this.rgb(COLOR.texto) });
      this.pagina.drawRectangle({ x: MARGEN + anchoEtiqueta, y: y - 1, width: anchoBarra, height: 7, color: this.rgb(COLOR.fondo) });
      this.pagina.drawRectangle({ x: MARGEN + anchoEtiqueta, y: y - 1, width: Math.max(2, (f.valor / max) * anchoBarra), height: 7, color: this.rgb(f.color || COLOR.primario) });
      this.pagina.drawText(String(f.valor), { x: MARGEN + anchoEtiqueta + anchoBarra + 8, y, size: 8.5, font: this.f.negrita, color: this.rgb(COLOR.texto) });
      this.y -= 16;
    }
  }

  /** Tabla simple: columnas [{ titulo, ancho }], filas de textos. */
  tabla(columnas, filas) {
    const fila = (celdas, negrita, color) => {
      const lineasPorCelda = celdas.map((c, i) => this.partir(c, 8.5, negrita ? this.f.negrita : this.f.normal, columnas[i].ancho - 6));
      const alto = Math.max(...lineasPorCelda.map((l) => l.length)) * 11 + 6;
      this.espacio(alto);
      let x = MARGEN;
      lineasPorCelda.forEach((lineas, i) => {
        lineas.forEach((l, j) => this.pagina.drawText(l, { x, y: this.y - 10 - j * 11, size: 8.5, font: negrita ? this.f.negrita : this.f.normal, color: this.rgb(color) }));
        x += columnas[i].ancho;
      });
      this.y -= alto;
      this.pagina.drawLine({ start: { x: MARGEN, y: this.y + 2 }, end: { x: A4[0] - MARGEN, y: this.y + 2 }, thickness: 0.4, color: this.rgb(COLOR.linea) });
    };
    fila(columnas.map((c) => c.titulo), true, COLOR.suave);
    for (const f of filas) fila(f, false, COLOR.texto);
  }

  pies(texto) {
    const paginas = this.doc.getPages();
    paginas.forEach((p, i) => {
      p.drawLine({ start: { x: MARGEN, y: MARGEN + 14 }, end: { x: A4[0] - MARGEN, y: MARGEN + 14 }, thickness: 0.4, color: this.rgb(COLOR.linea) });
      p.drawText(limpio(texto), { x: MARGEN, y: MARGEN, size: 7, font: this.f.normal, color: this.rgb(COLOR.tenue) });
      const num = `Página ${i + 1} de ${paginas.length}`;
      p.drawText(num, { x: A4[0] - MARGEN - this.f.normal.widthOfTextAtSize(num, 7), y: MARGEN, size: 7, font: this.f.normal, color: this.rgb(COLOR.tenue) });
    });
  }
}

const fecha = (ymd) => diaLegible(ymd);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * @param {object} p
 * @param {string} p.destinatario   organización que recibe el informe
 * @param {string[]} p.filtrosTexto filtros aplicados, legibles
 * @param {object} p.tablero        respuesta de /admin/analisis
 * @param {object[]} p.casos        respuesta de /admin/informe
 * @param {boolean} p.incluirActuado
 * @returns {Promise<Uint8Array>}
 */
export async function construirInformePdf({ destinatario, filtrosTexto, tablero, casos, incluirActuado }) {
  const doc = await PDFLib.PDFDocument.create({ updateMetadata: false });
  const fuentes = {
    normal: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
    negrita: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
  };
  const l = new Lienzo(doc, fuentes);
  const k = tablero.kpis;
  const periodo = tablero.periodo;

  // ---- Encabezado
  l.texto('INFORME DE SEGUIMIENTO COMUNITARIO', { tam: 8, negrita: true, color: COLOR.primario });
  l.texto(destinatario ? `Para: ${destinatario}` : 'Informe de seguimiento', { tam: 20, negrita: true, antes: 6 });
  l.texto(`Período: del ${fecha(periodo.desde)} al ${fecha(periodo.hasta)}`, { tam: 10, color: COLOR.suave, antes: 6 });
  if (filtrosTexto.length) l.texto(filtrosTexto.join('  ·  '), { tam: 9, color: COLOR.suave, antes: 2 });
  l.texto('Elaborado por REDNA con el Observatorio Comunitario de Vulneraciones de Derechos a Personas Defensoras.', { tam: 8.5, color: COLOR.tenue, antes: 4 });
  l.regla();

  // ---- 1. Resumen
  l.seccion('1. Resumen');
  l.texto(
    `En este período se registraron ${plural(k.total, 'caso', 'casos')}` +
    `${destinatario ? ` cuyo seguimiento corresponde a ${destinatario}` : ''}. ` +
    `${k.sin_revisar} sin revisar, ${k.en_investigacion} en investigación, ${k.cerrados} ${k.cerrados === 1 ? 'cerrado' : 'cerrados'} y ${k.descartados} ${k.descartados === 1 ? 'descartado' : 'descartados'}. ` +
    `${plural(k.alta_prioridad, 'tiene', 'tienen')} prioridad alta.`,
    { tam: 10, interlinea: 1.45 }
  );
  l.y -= 8;
  l.indicadores([
    { valor: k.total, texto: 'Casos en el período' },
    { valor: k.sin_revisar, texto: 'Sin revisar', color: COLOR.estado.recibido },
    { valor: k.en_investigacion, texto: 'En investigación', color: COLOR.estado.en_investigacion },
    { valor: k.alta_prioridad, texto: 'Prioridad alta' },
  ]);

  // ---- 2. Por tema
  l.seccion('2. Por tema');
  l.texto('Por familia de hecho', { tam: 9, negrita: true, color: COLOR.suave, antes: 2 });
  l.y -= 4;
  l.barras(tablero.familias.map((f) => ({ etiqueta: NOMBRE_FAMILIA[f.familia] || f.familia, valor: f.total, color: COLOR.familia[f.familia] })));
  l.texto('Por tipo de hecho', { tam: 9, negrita: true, color: COLOR.suave, antes: 10 });
  l.y -= 4;
  l.barras(tablero.tipos.slice(0, 12).map((t) => ({ etiqueta: t.tipo, valor: t.total, color: COLOR.familia[t.familia] })));
  if (tablero.tipos.length > 12) l.texto(`Y ${tablero.tipos.length - 12} tipos más, con menos casos.`, { tam: 8, color: COLOR.tenue, antes: 2 });

  // ---- 3. Por comunidad (solo si hay más de una)
  let n = 3;
  if (tablero.comunidades.length > 1) {
    l.seccion(`${n++}. Por comunidad`);
    l.barras(tablero.comunidades.map((c) => ({ etiqueta: c.comunidad, valor: c.total })));
  }

  // ---- Lo que se repite
  if (tablero.reincidencias.length) {
    l.seccion(`${n++}. Hechos que se repiten`);
    l.texto('El mismo tipo de hecho, en la misma comunidad, más de una vez en el período.', { tam: 9, color: COLOR.suave });
    l.y -= 6;
    l.tabla(
      [{ titulo: 'Comunidad', ancho: 170 }, { titulo: 'Tipo de hecho', ancho: 190 }, { titulo: 'Veces', ancho: 50 }, { titulo: 'Entre', ancho: ANCHO - 410 }],
      tablero.reincidencias.map((x) => [x.comunidad, x.tipo, String(x.total), `${diaLegible(x.primera, { day: 'numeric', month: 'short' })} – ${diaLegible(x.ultima, { day: 'numeric', month: 'short' })}`])
    );
  }

  // ---- Caso por caso
  l.seccion(`${n}. Detalle de los casos`);
  l.texto(
    'Cada caso se identifica por su folio. No se incluye el relato de la persona, el lugar exacto ni fotografías.' +
    (incluirActuado ? ' "Lo actuado" son las anotaciones de seguimiento de REDNA.' : ''),
    { tam: 8.5, color: COLOR.tenue }
  );
  l.y -= 4;
  for (const c of casos) {
    const titulo = `${c.folio}  ·  ${c.tipo}`;
    const meta = `${fecha(c.fecha)}  ·  ${NOMBRE_FAMILIA[c.familia] || c.familia}  ·  ${ETIQ_ESTADO[c.estado] || c.estado}  ·  prioridad ${c.prioridad}` +
      `${c.comunidad ? '  ·  ' + c.comunidad : ''}`;
    const actuado = !incluirActuado ? [] : c.actuado.length
      ? c.actuado.map((a) => `${diaLegible(a.fecha, { day: 'numeric', month: 'short' })} — ${[a.estado_nuevo ? `Pasó a ${ETIQ_ESTADO[a.estado_nuevo] || a.estado_nuevo}.` : '', a.nota || ''].filter(Boolean).join(' ')}`)
      : ['Sin anotaciones de seguimiento todavía.'];

    // Cada caso entero en una misma página: si no entra, pasa completo a
    // la siguiente (antes la última anotación podía quedar sola, lejos
    // de su folio). Un caso más largo que una página igual se parte.
    const lineas = (t, tam, f, ancho) => l.partir(t, tam, f, ancho).length;
    const alto = 8 + lineas(titulo, 10, fuentes.negrita, ANCHO) * 13.5 + 1 + lineas(meta, 8.5, fuentes.normal, ANCHO) * 11.5 +
      actuado.reduce((s, t) => s + 2 + lineas(t, 8.5, fuentes.normal, ANCHO - 10) * 11.5, 0) + 12;
    if (alto < A4[1] - MARGEN * 2 - PIE) l.espacio(alto);

    l.y -= 8;
    l.texto(titulo, { tam: 10, negrita: true });
    l.texto(meta, { tam: 8.5, color: COLOR.suave, antes: 1 });
    for (const t of actuado) {
      l.texto(t, { tam: 8.5, x: MARGEN + 10, ancho: ANCHO - 10, antes: 2, color: c.actuado.length ? COLOR.texto : COLOR.tenue });
    }
    l.pagina.drawLine({ start: { x: MARGEN, y: l.y - 5 }, end: { x: A4[0] - MARGEN, y: l.y - 5 }, thickness: 0.3, color: l.rgb(COLOR.linea) });
    l.y -= 6;
  }
  if (!casos.length) l.texto('No hay casos con estos filtros.', { tam: 9, color: COLOR.tenue });

  l.pies('Uso exclusivo para el seguimiento comunitario. No contiene relatos, fotografías ni ubicaciones. No reenviar por correo ni redes.');
  // Sin object streams: cada objeto queda a la vista en el archivo, así
  // se puede verificar byte a byte que no hay /Info ni metadatos (la
  // prueba lo hace), y abre en lectores de PDF viejos.
  return doc.save({ useObjectStreams: false });
}
