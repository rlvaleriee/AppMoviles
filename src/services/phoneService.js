/**
 * Servicio para validación y formato de números telefónicos salvadoreños
 *
 * Formatos aceptados en El Salvador:
 * - Fijos: ####-#### (8 dígitos)
 * - Móviles: ####-#### (8 dígitos, comenzando con 6, 7 o 2)
 */

/**
 * Valida el formato del teléfono salvadoreño
 * Formato: ####-#### (8 dígitos con guion)
 */
export const validatePhoneFormat = (phone) => {
  if (!phone) return false;

  // Remover espacios
  const cleanPhone = phone.trim();

  // Validar formato: 4 dígitos, guion, 4 dígitos
  const phoneRegex = /^\d{4}-\d{4}$/;

  if (!phoneRegex.test(cleanPhone)) {
    return false;
  }

  // Validar que el primer dígito sea válido en El Salvador (2, 6, 7)
  const firstDigit = cleanPhone[0];
  return ['2', '6', '7'].includes(firstDigit);
};

/**
 * Formatea el teléfono automáticamente mientras el usuario escribe
 * Ejemplo: 12345678 -> 1234-5678
 */
export const formatPhone = (value) => {
  // Remover todo excepto números
  const numbers = value.replace(/[^\d]/g, '');

  // Limitar a 8 dígitos
  const limited = numbers.slice(0, 8);

  // Agregar guion después del cuarto dígito
  if (limited.length > 4) {
    return `${limited.slice(0, 4)}-${limited.slice(4)}`;
  }

  return limited;
};

/**
 * Valida que el número sea un teléfono móvil válido en El Salvador
 * Móviles empiezan con 6 o 7
 */
export const isMobilePhone = (phone) => {
  if (!validatePhoneFormat(phone)) {
    return false;
  }

  const firstDigit = phone.trim()[0];
  return ['6', '7'].includes(firstDigit);
};

/**
 * Valida que el número sea un teléfono fijo válido en El Salvador
 * Fijos empiezan con 2
 */
export const isLandlinePhone = (phone) => {
  if (!validatePhoneFormat(phone)) {
    return false;
  }

  const firstDigit = phone.trim()[0];
  return firstDigit === '2';
};

/**
 * Obtiene el tipo de teléfono
 * @returns {'mobile' | 'landline' | 'invalid'}
 */
export const getPhoneType = (phone) => {
  if (!validatePhoneFormat(phone)) {
    return 'invalid';
  }

  const firstDigit = phone.trim()[0];

  if (['6', '7'].includes(firstDigit)) {
    return 'mobile';
  }

  if (firstDigit === '2') {
    return 'landline';
  }

  return 'invalid';
};

/**
 * Limpia el teléfono removiendo formato
 * Ejemplo: 1234-5678 -> 12345678
 */
export const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return phone.replace(/[^\d]/g, '');
};
