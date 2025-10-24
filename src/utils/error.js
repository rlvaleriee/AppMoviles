export function getFriendlyError(e, fallback = 'Algo salió mal') {
  const msg = e?.message || e?.toString?.() || fallback;

  // Traducciones rápidas de Auth
  if (msg.includes('auth/user-not-found')) return 'Usuario no encontrado.';
  if (msg.includes('auth/wrong-password')) return 'Contraseña incorrecta.';
  if (msg.includes('auth/email-already-in-use')) return 'Este correo ya está registrado.';
  if (msg.includes('auth/invalid-email')) return 'Correo inválido.';

  return msg;
}
