// Mismo patrón que app/js/core/logger.js: nada de console.log suelto.
const activo = location.hostname === 'localhost' || location.protocol === 'file:';

export function log(...args) {
  if (!activo) return;
  // eslint-disable-next-line no-console
  console.log('[panel]', ...args);
}
