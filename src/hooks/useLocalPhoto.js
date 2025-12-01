import { useState, useEffect } from 'react';

/**
 * Hook para usar fotos de perfil de Cloudinary
 * Simplemente retorna la URL proporcionada (ya viene de Cloudinary vía Firestore)
 * @param {string} userId - ID del usuario (no se usa, mantiene compatibilidad)
 * @param {string} photoURL - URL de Cloudinary desde Firestore
 * @returns {object} - { photoURL, loading }
 */
export const useLocalPhoto = (userId, photoURL = null) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // No hay carga necesaria, la URL ya viene de Cloudinary
    setLoading(false);
  }, [userId, photoURL]);

  return { photoURL, loading };
};
