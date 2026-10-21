/* =====================================================================
   Vista Configuración — la primera sección real, "Personal del panel"
   y "Comunidades y códigos". No estaba en diseno/tablero_completo.html
   tal cual (esa maqueta solo tenía "Códigos de comunidad", sin gestión
   de cuentas del panel) — apareció al preguntarle Marco a REDNA cómo
   se registra su propio personal: la respuesta era "a mano, por SQL",
   un vacío real tanto del contrato como de la maqueta. Ver la nota
   larga en api/observatorio/admin/usuarios.php y
   api/observatorio/admin/comunidades.php.

   Todo esto es rol administrador únicamente — ver
   lib/PanelAuth.php::obRequireRolAdministrador(). Un operador ve un
   aviso, no la pantalla vacía ni rota.
   ===================================================================== */
import { obtenerUsuarios, crearUsuario, actualizarUsuario, obtenerComunidades, crearComunidad, actualizarComunidad, generarCodigo, revocarCodigo, actualizarVigenciaCodigo } from '../data/api-client.js';
import * as sesion from '../data/sesion.js';
import { boton as botonAyuda } from '../core/ayuda-contextual.js';

let cantonesCache = [];
let comunidadesCache = [];

function formatoFecha(iso) {
  if (!iso) return 'nunca entró';
  return new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Para el día en una fecha de vigencia — distinto de formatoFecha():
// acá "sin fecha" significa "sin tope de ese lado", no "nunca entró".
// timeZone explícito: el día calendario que importa es el de El
// Salvador, no el del dispositivo de quien esté mirando el panel en
// ese momento (podría estar de viaje, o el reloj del equipo mal
// puesto).
function formatoFechaCorta(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/El_Salvador' }) : null;
}

// Aritmética en UTC a propósito: sumar días sobre un Date construido
// desde un <input type="date"> en hora local puede saltarse un día
// entero cerca de la medianoche según el huso horario del navegador.
function sumarDias(fechaYMD, dias) {
  const d = new Date(fechaYMD + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "-06:00" fijo, no una zona con nombre: El Salvador no tiene horario
// de verano, así que el offset no cambia nunca — y así Postgres lo
// guarda bien sin importar el timezone de SU sesión (Etc/UTC acá), que
// nunca se tocó porque config.php solo fija la hora de PHP
// (date_default_timezone_set), no la de la conexión PDO. Sin el
// offset explícito, "20T23:59:59" se guardaba como 23:59:59 UTC —
// 17:59:59 en El Salvador, el código vencía casi 6 horas antes de lo
// que se veía en el selector. Encontrado probándolo de punta a punta
// contra la app real, 2026-10-20.
function inicioDeDiaSV(fechaYMD) {
  return fechaYMD + 'T00:00:00-06:00';
}
function finDeDiaSV(fechaYMD) {
  return fechaYMD + 'T23:59:59-06:00';
}

// El mismo problema pero al revés: un vigente_hasta guardado como
// "23:59:59 de El Salvador" viaja de vuelta del servidor como
// "05:59:59 del día siguiente" en UTC — cortar los primeros 10
// caracteres de ESE string para rellenar el <input type="date"> daba
// el día de más, y de ahí salía mal cualquier cálculo que partiera de
// ese valor (como +1 semana). "en-CA" formatea como AAAA-MM-DD, que es
// justo lo que un <input type="date"> espera.
function fechaInputSV(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }) : '';
}
function hoySV() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
}

// Mismas 4 opciones que el formulario "Agregar comunidad nueva" —
// antes el de editar era una caja de texto libre, así que una
// comunidad ya creada se podía dejar con un valor mal escrito o con
// otra mayúscula que ya no calzara con nada (encontrado al revisar
// con Marco por qué una comunidad real mostraba "adesco" en vez de
// "ADESCO", 2026-10-20).
const TEXTO_TIPO_COMUNIDAD = { adesco: 'ADESCO', comite: 'Comité', caserio: 'Caserío', otro: 'Otro' };

// Si el valor guardado no es ninguno de los 4 (dato viejo de antes de
// este formulario, o cargado a mano por SQL), se agrega como opción
// aparte en vez de dejar que el <select> mienta mostrando "ADESCO"
// seleccionado por ser la primera de la lista sin que nada calzara.
function opcionesTipoComunidad(valorActual) {
  const conocidas = Object.keys(TEXTO_TIPO_COMUNIDAD)
    .map((v) => `<option value="${v}"${valorActual === v ? ' selected' : ''}>${TEXTO_TIPO_COMUNIDAD[v]}</option>`)
    .join('');
  if (valorActual && !TEXTO_TIPO_COMUNIDAD[valorActual]) {
    return conocidas + `<option value="${valorActual}" selected>${valorActual} (valor antiguo)</option>`;
  }
  return conocidas;
}

function textoVigencia(c) {
  // No repite "Revocado": la insignia de estado (estadoCodigo) ya lo
  // dice — antes las dos cosas decían lo mismo y rompía la prueba de
  // Playwright al buscar ese texto (match ambiguo entre la insignia y
  // esta línea, 2026-10-20).
  if (!c.activo) return `Emitido el ${formatoFechaCorta(c.fecha_emision)}`;
  const vencido = c.vigente_hasta && new Date(c.vigente_hasta) < new Date();
  if (vencido) return `Vencido — era hasta ${formatoFechaCorta(c.vigente_hasta)}`;
  const desde = formatoFechaCorta(c.vigente_desde);
  const hasta = formatoFechaCorta(c.vigente_hasta);
  if (!desde && !hasta) return 'Activo — sin fecha de vencimiento';
  if (desde && hasta) return `Vigente del ${desde} al ${hasta}`;
  if (hasta) return `Vigente hasta ${hasta}`;
  return `Vigente desde ${desde}`;
}

function esqueleto() {
  return `
    <div class="head"><div><h1>Configuración</h1><p>Personal del panel y comunidades habilitadas para reportar</p></div></div>

    <div class="caja">
      <h2>Personal del panel ${botonAyuda('config-usuarios')}</h2>
      <p class="sub">Quién puede entrar al panel y con qué rol. Una cuenta desactivada no puede iniciar sesión, pero su nombre sigue en la bitácora de los casos que ya gestionó.</p>
      <div id="cfg-usuarios"></div>
      <button class="btn ghost chico" id="cfg-mostrar-form-usuario" style="margin-top:14px">Agregar persona al panel</button>
      <form id="cfg-form-usuario" style="display:none;margin-top:14px;border-top:1px solid var(--outline-var);padding-top:14px">
        <div class="barra-filtros" style="margin-bottom:10px">
          <div class="campo-grupo" style="flex:1;min-width:160px"><label>Nombre</label><input class="campo-filtro" id="cfg-u-nombre" required></div>
          <div class="campo-grupo" style="flex:1;min-width:180px"><label>Correo</label><input class="campo-filtro" type="email" id="cfg-u-correo" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Clave inicial</label><input class="campo-filtro" type="text" id="cfg-u-clave" placeholder="mínimo 8 caracteres" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Rol</label>
            <select class="campo-filtro" id="cfg-u-rol">
              <option value="operador">Operador</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </div>
        <div id="cfg-u-error" style="display:none" class="error-carga"></div>
        <button class="btn chico" type="submit">Crear cuenta</button>
        <button class="btn ghost chico" type="button" id="cfg-u-cancelar">Cancelar</button>
      </form>
    </div>

    <div class="caja">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div>
          <h2>Comunidades y códigos de enrolamiento ${botonAyuda('config-comunidades')}</h2>
          <p class="sub">El código es lo único que necesita alguien para enrolarse desde la app — se reparte en la capacitación.
            <b>Desactivar una comunidad</b> bloquea el enrolamiento con TODOS sus códigos, aunque sigan vigentes.
            <b>Revocar un código</b> bloquea solo ese código — los demás de la misma comunidad siguen funcionando. Ninguna de las dos cosas afecta los reportes ya enviados.</p>
        </div>
        <button class="btn chico" id="cfg-mostrar-form-comunidad" style="white-space:nowrap">Nueva comunidad</button>
      </div>
      <div class="kpis" id="cfg-com-kpis" style="margin:14px 0"></div>
      <div class="campo-grupo" style="margin-bottom:14px">
        <label for="cfg-com-buscar">Buscar</label>
        <input type="search" id="cfg-com-buscar" class="campo-filtro" placeholder="Nombre de la comunidad o código…" style="width:100%">
      </div>
      <div id="cfg-comunidades"></div>
      <form id="cfg-form-comunidad" style="display:none;margin-top:14px;border-top:1px solid var(--outline-var);padding-top:14px">
        <div class="barra-filtros" style="margin-bottom:10px">
          <div class="campo-grupo" style="flex:1;min-width:180px"><label>Nombre de la comunidad</label><input class="campo-filtro" id="cfg-c-nombre" required></div>
          <div class="campo-grupo" style="min-width:150px"><label>Tipo</label>
            <select class="campo-filtro" id="cfg-c-tipo">
              ${Object.entries(TEXTO_TIPO_COMUNIDAD).map(([v, texto]) => `<option value="${v}">${texto}</option>`).join('')}
            </select>
          </div>
          <div class="campo-grupo" style="flex:1;min-width:220px"><label>Cantón</label><select class="campo-filtro" id="cfg-c-canton"></select></div>
        </div>
        <div id="cfg-c-error" style="display:none" class="error-carga"></div>
        <button class="btn chico" type="submit">Crear comunidad y generar código</button>
        <button class="btn ghost chico" type="button" id="cfg-c-cancelar">Cancelar</button>
      </form>
    </div>`;
}

function pintarUsuarios(usuarios) {
  const yo = sesion.usuarioActual();
  document.getElementById('cfg-usuarios').innerHTML = usuarios.map((u) => `
    <div class="lista-item">
      <div class="li-t">
        <b>${u.nombre}${u.id === yo?.id ? ' (usted)' : ''}</b>
        <small>${u.correo} · ${u.rol} · Último acceso: ${formatoFecha(u.ultimo_acceso)}</small>
      </div>
      <span class="li-a" data-usuario-toggle="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Reactivar'}</span>
    </div>`).join('') || '<p class="sub2">Sin cuentas todavía.</p>';

  document.querySelectorAll('[data-usuario-toggle]').forEach((el) => {
    el.addEventListener('click', async () => {
      const activo = el.dataset.activo === 'true';
      el.textContent = 'Guardando…';
      const r = await actualizarUsuario(el.dataset.usuarioToggle, { activo: !activo });
      if (r.ok) await cargarUsuarios();
      else el.textContent = activo ? 'Desactivar' : 'Reactivar';
    });
  });
}

// Estado real de un código, no solo activo/inactivo — "vencido" (se
// arregla extendiendo la fecha) y "revocado" (permanente, hay que
// generar uno nuevo) son cosas distintas y se pintan distinto.
function estadoCodigo(c) {
  if (!c.activo) return { texto: 'Revocado', clase: 'p-n' };
  if (c.vigente_hasta && new Date(c.vigente_hasta) < new Date()) return { texto: 'Vencido', clase: 'p-i' };
  return { texto: 'Activo', clase: 'p-c' };
}

function pintarKpisComunidades(comunidades) {
  const activas = comunidades.filter((co) => co.activo).length;
  const personas = comunidades.reduce((s, co) => s + co.personas_inscritas, 0);
  const codigosActivos = comunidades.reduce((s, co) => s + co.codigos.filter((c) => estadoCodigo(c).clase === 'p-c').length, 0);
  const items = [
    { valor: activas, texto: 'Comunidades activas' },
    { valor: personas, texto: 'Personas enroladas' },
    { valor: codigosActivos, texto: 'Códigos disponibles ahora' },
  ];
  document.getElementById('cfg-com-kpis').innerHTML = items.map((it) => `<div class="kpi"><b>${it.valor}</b><span>${it.texto}</span></div>`).join('');
}

function pintarComunidades(comunidades) {
  document.getElementById('cfg-comunidades').innerHTML = comunidades.map((co) => {
    const codigosActivosDeLaComunidad = co.codigos.filter((c) => c.activo).length;
    const codigos = co.codigos.map((c) => {
      const estado = estadoCodigo(c);
      // Para el aviso de "quedan otros N" al revocar ESTE código — no
      // cuenta a sí mismo.
      const otrosActivos = codigosActivosDeLaComunidad - (c.activo ? 1 : 0);
      return `
      <div class="codigo-row">
        <div class="li-t">
          <b class="codigo-mono">${c.codigo}</b>
          <span class="pill ${estado.clase}">${estado.texto}</span>
          <small>${textoVigencia(c)}</small>
        </div>
        ${c.activo ? `
          <div class="cc-acciones">
            <span class="li-a" data-copiar="${c.codigo}">Copiar</span>
            <span class="li-a" data-extender="${c.id}">+1 semana</span>
            <span class="li-a" data-mostrar-vigencia="${c.id}">Cambiar vigencia</span>
            <span class="li-a peligro" data-revocar="${c.id}" data-codigo="${c.codigo}" data-otros-activos="${otrosActivos}">Revocar solo este código</span>
          </div>
          <div class="vigencia-controles" data-editor-vigencia="${c.id}" hidden>
            <label>Desde <input type="date" data-vig-desde="${c.id}" value="${fechaInputSV(c.vigente_desde)}"></label>
            <label>Hasta <input type="date" data-vig-hasta="${c.id}" value="${fechaInputSV(c.vigente_hasta)}"></label>
            <span class="li-a" data-guardar-vigencia="${c.id}">Guardar</span>
          </div>` : ''}
      </div>`;
    }).join('') || '<p class="sub2">Sin códigos todavía.</p>';
    const tipoTexto = TEXTO_TIPO_COMUNIDAD[co.tipo] || co.tipo || 'Sin tipo';
    return `
      <div class="comunidad-bloque${co.activo ? '' : ' inactiva'}" data-comunidad-bloque="${co.id}">
        <div class="cc-head">
          <div class="cc-id">
            <b>${co.nombre}</b>
            <span class="pill p-a">${tipoTexto}</span>
            ${co.activo ? '' : '<span class="pill p-n">Desactivada</span>'}
          </div>
          <small>${co.canton || '—'} · ${co.personas_inscritas} persona${co.personas_inscritas === 1 ? '' : 's'} inscrita${co.personas_inscritas === 1 ? '' : 's'}</small>
        </div>
        <div class="cc-acciones">
          ${co.activo ? `<span class="li-a" data-mostrar-editar-comunidad="${co.id}">Editar</span>` : ''}
          ${co.activo ? `<span class="li-a" data-generar="${co.id}">+ Generar código nuevo</span>` : ''}
          <span class="li-a peligro" data-comunidad-toggle="${co.id}" data-activo="${co.activo}" data-nombre="${co.nombre}" data-codigos-activos="${codigosActivosDeLaComunidad}">${co.activo ? 'Desactivar esta comunidad' : 'Reactivar esta comunidad'}</span>
        </div>
        ${co.activo ? `
          <div class="cc-editar" data-editor-comunidad="${co.id}" hidden>
            <label>Nombre <input type="text" data-com-nombre="${co.id}" value="${co.nombre}" style="width:220px"></label>
            <label>Tipo
              <select data-com-tipo="${co.id}">
                ${opcionesTipoComunidad(co.tipo)}
              </select>
            </label>
            <span class="li-a" data-guardar-comunidad="${co.id}">Guardar</span>
          </div>` : ''}
        <div class="codigos-lista">${codigos}</div>
      </div>`;
  }).join('') || '<p class="sub2">Ninguna comunidad calza con la búsqueda.</p>';

  // Mostrar/ocultar los dos formularios de edición — nunca se
  // vuelven a pedir datos al servidor, así que no hace falta
  // recargar nada; solo revela lo que ya está en el DOM. Sin esto
  // cada comunidad y cada código mostraban SIEMPRE sus campos de
  // edición abiertos, aunque nadie los fuera a tocar — Marco lo
  // notó comparando con una maqueta mucho más despejada, 2026-10-20.
  document.querySelectorAll('[data-mostrar-editar-comunidad]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelector(`[data-editor-comunidad="${el.dataset.mostrarEditarComunidad}"]`).hidden = false;
    });
  });
  document.querySelectorAll('[data-mostrar-vigencia]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelector(`[data-editor-vigencia="${el.dataset.mostrarVigencia}"]`).hidden = false;
    });
  });
  document.querySelectorAll('[data-copiar]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.dataset.copiar);
        const original = el.textContent;
        el.textContent = '¡Copiado!';
        setTimeout(() => { el.textContent = original; }, 1200);
      } catch {
        alert('No se pudo copiar — el código es: ' + el.dataset.copiar);
      }
    });
  });
  document.querySelectorAll('[data-revocar]').forEach((el) => {
    el.addEventListener('click', async () => {
      const otros = Number(el.dataset.otrosActivos);
      const nota = otros > 0
        ? ` La comunidad tiene ${otros} código${otros === 1 ? '' : 's'} más activo${otros === 1 ? '' : 's'} que seguirá${otros === 1 ? '' : 'n'} funcionando.`
        : ' Es el único código activo de esta comunidad: nadie más podrá enrolarse hasta generar uno nuevo.';
      if (!confirm(`¿Revocar el código ${el.dataset.codigo}? Es permanente — no se puede reactivar, habría que generar uno nuevo. No afecta a quienes ya se enrolaron con él.${nota}`)) return;
      el.textContent = 'Revocando…';
      const r = await revocarCodigo(el.dataset.revocar);
      if (r.ok) await cargarComunidades();
    });
  });
  document.querySelectorAll('[data-guardar-vigencia]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.guardarVigencia;
      const desde = document.querySelector(`[data-vig-desde="${id}"]`).value;
      const hasta = document.querySelector(`[data-vig-hasta="${id}"]`).value;
      el.textContent = 'Guardando…';
      // Inclusive: "hasta" llega a las 23:59:59 de ese día, no a la
      // medianoche de inicio — pedido explícito de Marco.
      const r = await actualizarVigenciaCodigo(id, {
        vigente_desde: desde ? inicioDeDiaSV(desde) : null,
        vigente_hasta: hasta ? finDeDiaSV(hasta) : null,
      });
      if (r.ok) await cargarComunidades();
      else { el.textContent = 'Guardar'; alert('No se pudo guardar la vigencia: ' + r.error); }
    });
  });
  document.querySelectorAll('[data-extender]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.extender;
      // Si ya tenía una fecha "hasta", extiende DESDE esa fecha (dos
      // clics seguidos suman 14 días, no pisan el primero). Si no
      // tenía ninguna, arranca desde hoy.
      const inputHasta = document.querySelector(`[data-vig-hasta="${id}"]`);
      const base = inputHasta.value || hoySV();
      const nuevaFecha = sumarDias(base, 7);
      el.textContent = 'Extendiendo…';
      const r = await actualizarVigenciaCodigo(id, { vigente_hasta: finDeDiaSV(nuevaFecha) });
      if (r.ok) await cargarComunidades();
      else { el.textContent = '+1 semana'; alert('No se pudo extender: ' + r.error); }
    });
  });
  document.querySelectorAll('[data-generar]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.textContent = 'Generando…';
      const r = await generarCodigo(el.dataset.generar);
      if (r.ok) await cargarComunidades();
      else el.textContent = '+ Generar código nuevo';
    });
  });
  document.querySelectorAll('[data-guardar-comunidad]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.guardarComunidad;
      const nombre = document.querySelector(`[data-com-nombre="${id}"]`).value.trim();
      const tipo = document.querySelector(`[data-com-tipo="${id}"]`).value.trim();
      el.textContent = 'Guardando…';
      const r = await actualizarComunidad(id, { nombre, tipo });
      if (r.ok) await cargarComunidades();
      else { el.textContent = 'Guardar'; alert('No se pudo guardar: ' + r.error); }
    });
  });
  document.querySelectorAll('[data-comunidad-toggle]').forEach((el) => {
    el.addEventListener('click', async () => {
      const activo = el.dataset.activo === 'true';
      // Solo confirma al desactivar — reactivar no tiene efecto
      // secundario que avisar.
      if (activo) {
        const n = Number(el.dataset.codigosActivos);
        const avisoCodigos = n > 0
          ? `Bloqueará el enrolamiento con ${n === 1 ? 'su código activo' : 'sus ' + n + ' códigos activos'}, aunque sigan vigentes.`
          : 'No tiene códigos activos en este momento.';
        if (!confirm(`¿Desactivar "${el.dataset.nombre}"? ${avisoCodigos} Se puede reactivar después. No afecta a quienes ya se enrolaron.`)) return;
      }
      el.textContent = 'Guardando…';
      const r = await actualizarComunidad(el.dataset.comunidadToggle, { activo: !activo });
      if (r.ok) await cargarComunidades();
      else el.textContent = activo ? 'Desactivar esta comunidad' : 'Reactivar esta comunidad';
    });
  });
}

async function cargarUsuarios() {
  const r = await obtenerUsuarios();
  if (r.ok) pintarUsuarios(r.data.usuarios);
}

// Las KPI siempre reflejan TODAS las comunidades — buscar filtra la
// lista de tarjetas, no cambia lo que dicen los números de arriba.
function comunidadesFiltradas(filtro) {
  const q = filtro.trim().toLowerCase();
  if (!q) return comunidadesCache;
  return comunidadesCache.filter((co) =>
    co.nombre.toLowerCase().includes(q)
    || (co.canton || '').toLowerCase().includes(q)
    || co.codigos.some((c) => c.codigo.toLowerCase().includes(q)));
}

async function cargarComunidades() {
  const r = await obtenerComunidades();
  if (!r.ok) return;
  comunidadesCache = r.data.comunidades;
  pintarKpisComunidades(comunidadesCache);
  pintarComunidades(comunidadesFiltradas(document.getElementById('cfg-com-buscar')?.value || ''));
  cantonesCache = r.data.cantones_disponibles;
  const select = document.getElementById('cfg-c-canton');
  select.innerHTML = cantonesCache.map((c) => `<option value="${c.id}">${c.canton} — ${c.municipio}, ${c.departamento}</option>`).join('');
}

function enlazarFormularios() {
  const formU = document.getElementById('cfg-form-usuario');
  document.getElementById('cfg-mostrar-form-usuario').addEventListener('click', () => { formU.style.display = 'block'; });
  document.getElementById('cfg-u-cancelar').addEventListener('click', () => { formU.style.display = 'none'; formU.reset(); });
  formU.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('cfg-u-error');
    error.style.display = 'none';
    const r = await crearUsuario({
      nombre: document.getElementById('cfg-u-nombre').value.trim(),
      correo: document.getElementById('cfg-u-correo').value.trim(),
      clave: document.getElementById('cfg-u-clave').value,
      rol: document.getElementById('cfg-u-rol').value,
    });
    if (!r.ok) {
      error.textContent = r.error;
      error.style.display = 'block';
      return;
    }
    formU.style.display = 'none';
    formU.reset();
    await cargarUsuarios();
  });

  const formC = document.getElementById('cfg-form-comunidad');
  document.getElementById('cfg-mostrar-form-comunidad').addEventListener('click', () => { formC.style.display = 'block'; });
  document.getElementById('cfg-c-cancelar').addEventListener('click', () => { formC.style.display = 'none'; formC.reset(); });
  formC.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('cfg-c-error');
    error.style.display = 'none';
    const r = await crearComunidad({
      nombre: document.getElementById('cfg-c-nombre').value.trim(),
      tipo: document.getElementById('cfg-c-tipo').value,
      canton_id: document.getElementById('cfg-c-canton').value,
    });
    if (!r.ok) {
      error.textContent = r.error;
      error.style.display = 'block';
      return;
    }
    formC.style.display = 'none';
    formC.reset();
    await cargarComunidades();
  });

  // Filtra la lista ya cargada, en el cliente — sin volver a pedirle
  // nada al servidor, igual que cualquier otra búsqueda chica de este
  // panel.
  document.getElementById('cfg-com-buscar').addEventListener('input', (e) => {
    pintarComunidades(comunidadesFiltradas(e.target.value));
  });
}

export async function montar(raiz) {
  const usuario = sesion.usuarioActual();
  if (usuario?.rol !== 'administrador') {
    raiz.innerHTML = `
      <div class="head"><div><h1>Configuración</h1></div></div>
      <div class="nota-demo"><b>Esta sección es solo para administradores.</b> Si necesita crear una cuenta nueva o un código de comunidad, pídaselo a alguien con ese rol.</div>`;
    return;
  }

  raiz.innerHTML = esqueleto();
  enlazarFormularios();
  await cargarUsuarios();
  await cargarComunidades();
}
