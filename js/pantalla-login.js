/* =====================================================================
   Pantalla de login — no existía en diseno/tablero_completo.html (el
   mockup arranca directo en Resumen). Se construyó al conectar la
   sesión real (lib/PanelAuth.php): correo y clave contra `usuario`,
   api_v1.md sección 2.
   ===================================================================== */
import { iniciarSesion } from './data/api-client.js';
import * as sesion from './data/sesion.js';
import { boton as botonAyuda } from './core/ayuda-contextual.js';

export function montar(raiz, alEntrar) {
  raiz.innerHTML = `
    <div class="login-pantalla">
      <form class="login-caja" id="login-form" novalidate>
        <h1>Observatorio Comunitario</h1>
        <p>Panel de administración — entre con su cuenta. ${botonAyuda('login', '¿Cómo entro?')}</p>
        <div id="login-error" style="display:none" class="login-error"></div>
        <div class="login-campo">
          <label for="login-correo">Correo</label>
          <input type="email" id="login-correo" autocomplete="username" required>
        </div>
        <div class="login-campo">
          <label for="login-clave">Clave</label>
          <input type="password" id="login-clave" autocomplete="current-password" required>
        </div>
        <button class="btn" type="submit" id="login-boton">Entrar</button>
      </form>
    </div>`;

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const boton = document.getElementById('login-boton');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.style.display = 'none';
    boton.disabled = true;
    boton.textContent = 'Entrando…';

    const correo = document.getElementById('login-correo').value.trim();
    const clave = document.getElementById('login-clave').value;

    const r = await iniciarSesion(correo, clave);

    boton.disabled = false;
    boton.textContent = 'Entrar';

    if (!r.ok) {
      error.textContent = r.code === 'LIMITE_EXCEDIDO'
        ? 'Demasiados intentos. Espere un momento antes de volver a intentar.'
        : r.error;
      error.style.display = 'block';
      return;
    }

    sesion.guardar(r.data.token, r.data.usuario);
    alEntrar();
  });
}
