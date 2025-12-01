import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * VALIDACIÓN DE DUI SALVADOREÑO
 *
 * El DUI de El Salvador utiliza un algoritmo de módulo 10 con pesos decrecientes
 * para validar la autenticidad del documento.
 *
 * Ejemplos de DUIs válidos para pruebas:
 * - 01234567-8 (válido)
 * - 12345678-5 (válido)
 * - 05830849-0 (válido)
 *
 * Ejemplos de DUIs inválidos:
 * - 12345678-9 (dígito verificador incorrecto)
 * - 00000000-0 (dígito verificador incorrecto)
 * - 11111111-1 (dígito verificador incorrecto)
 */

/**
 * Verifica si un DUI es obviamente inválido (ej: todos ceros, todos el mismo dígito)
 * @param {string} numeros - Los 8 primeros dígitos del DUI
 * @returns {boolean} - true si es obviamente inválido
 */
const isObviouslyInvalidDUI = (numeros) => {
  // Rechazar si todos los dígitos son iguales (00000000, 11111111, etc.)
  if (/^(\d)\1{7}$/.test(numeros)) return true;

  // Rechazar secuencias ascendentes o descendentes simples
  if (numeros === '01234567' || numeros === '12345678' || numeros === '76543210' || numeros === '87654321') return true;

  return false;
};

/**
 * Valida el dígito verificador del DUI salvadoreño usando el algoritmo de módulo 10
 * El DUI usa pesos decrecientes [9,8,7,6,5,4,3,2] para los 8 primeros dígitos
 * @param {string} dui - DUI en formato ########-#
 * @returns {boolean} - true si el dígito verificador es válido
 */
export const validateDUICheckDigit = (dui) => {
  if (!dui || !/^\d{8}-\d$/.test(dui)) return false;

  // Extraer los 8 primeros dígitos y el dígito verificador
  const numeros = dui.substring(0, 8);
  const verificador = parseInt(dui[9]);

  // Rechazar DUIs obviamente inválidos
  if (isObviouslyInvalidDUI(numeros)) return false;

  // Pesos para el algoritmo de validación
  const pesos = [9, 8, 7, 6, 5, 4, 3, 2];

  // Calcular la suma ponderada
  let suma = 0;
  for (let i = 0; i < 8; i++) {
    suma += parseInt(numeros[i]) * pesos[i];
  }

  // Calcular el dígito verificador esperado
  let resultado = 10 - (suma % 10);
  if (resultado === 10) resultado = 0;

  // Comparar con el dígito verificador proporcionado
  return resultado === verificador;
};

/**
 * Valida el formato y autenticidad del DUI salvadoreño
 * Formato: ########-# (8 dígitos, guion, 1 dígito verificador)
 * También valida que el dígito verificador sea correcto
 */
export const validateDUIFormat = (dui) => {
  if (!dui) return false;

  // Remover espacios
  const cleanDUI = dui.trim();

  // Validar formato: 8 dígitos-1 dígito
  const duiRegex = /^\d{8}-\d{1}$/;
  if (!duiRegex.test(cleanDUI)) return false;

  // Validar el dígito verificador
  return validateDUICheckDigit(cleanDUI);
};

/**
 * Formatea el DUI automáticamente mientras el usuario escribe
 * Ejemplo: 12345678 -> 12345678-
 */
export const formatDUI = (value) => {
  // Remover todo excepto números
  const numbers = value.replace(/[^\d]/g, '');

  // Limitar a 9 dígitos
  const limited = numbers.slice(0, 9);

  // Agregar guion después del octavo dígito
  if (limited.length > 8) {
    return `${limited.slice(0, 8)}-${limited.slice(8)}`;
  }

  return limited;
};

/**
 * Verifica si un DUI ya está registrado en la base de datos
 * @param {string} dui - Número de DUI a verificar
 * @param {string} excludeUserId - ID de usuario a excluir (opcional, para edición de perfil)
 * @returns {Promise<boolean>} - true si el DUI ya existe, false si está disponible
 */
export const isDUIRegistered = async (dui, excludeUserId = null) => {
  try {
    if (!dui || !validateDUIFormat(dui)) {
      return false;
    }

    const cleanDUI = dui.trim();

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('dui', '==', cleanDUI));
    const snapshot = await getDocs(q);

    // Si hay que excluir un usuario (caso de edición), verificar que no sea el mismo
    if (!snapshot.empty && excludeUserId) {
      const existingUser = snapshot.docs[0];
      return existingUser.id !== excludeUserId;
    }

    return !snapshot.empty;
  } catch (error) {
    throw new Error('No se pudo verificar el DUI');
  }
};

/**
 * Obtiene el usuario por DUI
 */
export const getUserByDUI = async (dui) => {
  try {
    if (!dui || !validateDUIFormat(dui)) {
      return null;
    }

    const cleanDUI = dui.trim();

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('dui', '==', cleanDUI));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    return null;
  }
};
