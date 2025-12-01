import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Agregar médico a favoritos
 */
export const addDoctorToFavorites = async (patientId, doctorId) => {
  try {
    const userRef = doc(db, 'users', patientId);
    await updateDoc(userRef, {
      favorites: arrayUnion(doctorId)
    });
    return { success: true };
  } catch (error) {
    console.error('Error agregando a favoritos:', error);
    throw error;
  }
};

/**
 * Quitar médico de favoritos
 */
export const removeDoctorFromFavorites = async (patientId, doctorId) => {
  try {
    const userRef = doc(db, 'users', patientId);
    await updateDoc(userRef, {
      favorites: arrayRemove(doctorId)
    });
    return { success: true };
  } catch (error) {
    console.error('Error quitando de favoritos:', error);
    throw error;
  }
};

/**
 * Obtener lista de favoritos del paciente
 */
export const getFavorites = async (patientId) => {
  try {
    const userRef = doc(db, 'users', patientId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return [];
    }

    const favorites = userSnap.data().favorites || [];
    return favorites;
  } catch (error) {
    console.error('Error obteniendo favoritos:', error);
    throw error;
  }
};

/**
 * Verificar si un médico está en favoritos
 */
export const isDoctorFavorite = async (patientId, doctorId) => {
  try {
    const favorites = await getFavorites(patientId);
    return favorites.includes(doctorId);
  } catch (error) {
    console.error('Error verificando favorito:', error);
    return false;
  }
};

/**
 * Obtener información completa de médicos favoritos
 */
export const getFavoriteDoctors = async (patientId) => {
  try {
    const favorites = await getFavorites(patientId);

    if (favorites.length === 0) {
      return [];
    }

    // Obtener información de cada médico
    const doctorsPromises = favorites.map(async (doctorId) => {
      try {
        const doctorRef = doc(db, 'users', doctorId);
        const doctorSnap = await getDoc(doctorRef);

        if (doctorSnap.exists()) {
          return {
            id: doctorSnap.id,
            ...doctorSnap.data()
          };
        }
        return null;
      } catch (error) {
        console.error(`Error obteniendo doctor ${doctorId}:`, error);
        return null;
      }
    });

    const doctors = await Promise.all(doctorsPromises);

    // Filtrar doctores nulos y solo retornar verificados
    return doctors.filter(doc => doc !== null && doc.verified === true);
  } catch (error) {
    console.error('Error obteniendo médicos favoritos:', error);
    throw error;
  }
};

/**
 * Escuchar cambios en favoritos en tiempo real
 */
export const listenToFavorites = (patientId, callback) => {
  try {
    const userRef = doc(db, 'users', patientId);

    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const favorites = snapshot.data().favorites || [];
        callback(favorites);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Error escuchando favoritos:', error);
      callback([]);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error configurando listener de favoritos:', error);
    return () => {};
  }
};
