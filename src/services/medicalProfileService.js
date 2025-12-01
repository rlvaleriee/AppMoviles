import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

// =====================================================
// PERFIL MÉDICO DEL PACIENTE (datos base, una sola vez)
// =====================================================

/**
 * Obtiene el perfil médico de un paciente
 * @param {string} patientId - ID del paciente
 * @returns {Promise<Object|null>} - Perfil médico o null si no existe
 */
export const getMedicalProfile = async (patientId) => {
  try {
    const ref = doc(db, 'users', patientId, 'medicalProfile', 'data');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo perfil médico:', error);
    throw error;
  }
};

/**
 * Guarda o actualiza el perfil médico de un paciente
 * @param {string} patientId - ID del paciente
 * @param {Object} profileData - Datos del perfil médico
 */
export const saveMedicalProfile = async (patientId, profileData) => {
  try {
    const ref = doc(db, 'users', patientId, 'medicalProfile', 'data');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      // Actualizar existente
      await updateDoc(ref, {
        ...profileData,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Crear nuevo
      await setDoc(ref, {
        ...profileData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error guardando perfil médico:', error);
    throw error;
  }
};

/**
 * Verifica si un médico puede ver el perfil médico de un paciente
 * Solo puede verlo si tiene una cita activa (accepted) o completada con ese paciente
 * @param {string} doctorId - ID del médico
 * @param {string} patientId - ID del paciente
 * @returns {Promise<boolean>}
 */
export const canDoctorViewProfile = async (doctorId, patientId) => {
  try {
    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('doctorId', '==', doctorId),
      where('patientId', '==', patientId),
      where('status', 'in', ['accepted', 'completed'])
    );

    const snap = await getDocs(q);
    return !snap.empty;
  } catch (error) {
    console.error('Error verificando acceso:', error);
    return false;
  }
};

// =====================================================
// NOTAS DEL MÉDICO (por cada cita completada)
// =====================================================

/**
 * Obtiene las notas del médico para una cita específica
 * @param {string} appointmentId - ID de la cita
 * @returns {Promise<Object|null>}
 */
export const getDoctorNotes = async (appointmentId) => {
  try {
    const ref = doc(db, 'appointments', appointmentId, 'doctorNotes', 'data');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo notas del médico:', error);
    throw error;
  }
};

/**
 * Guarda o actualiza las notas del médico para una cita
 * @param {string} appointmentId - ID de la cita
 * @param {Object} notesData - Datos de las notas
 */
export const saveDoctorNotes = async (appointmentId, notesData) => {
  try {
    const ref = doc(db, 'appointments', appointmentId, 'doctorNotes', 'data');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await updateDoc(ref, {
        ...notesData,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...notesData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error guardando notas del médico:', error);
    throw error;
  }
};

/**
 * Obtiene todas las notas de citas de un paciente con un médico específico
 * @param {string} patientId - ID del paciente
 * @param {string} doctorId - ID del médico
 * @returns {Promise<Array>}
 */
export const getPatientNotesHistory = async (patientId, doctorId) => {
  try {
    // Primero obtener todas las citas completadas entre el paciente y el médico
    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('patientId', '==', patientId),
      where('doctorId', '==', doctorId),
      where('status', '==', 'completed'),
      orderBy('slotStart', 'desc')
    );

    const appointmentsSnap = await getDocs(q);
    const notesHistory = [];

    // Para cada cita, obtener las notas si existen
    for (const appointmentDoc of appointmentsSnap.docs) {
      const appointmentData = appointmentDoc.data();
      const notesRef = doc(db, 'appointments', appointmentDoc.id, 'doctorNotes', 'data');
      const notesSnap = await getDoc(notesRef);

      notesHistory.push({
        appointmentId: appointmentDoc.id,
        appointmentDate: appointmentData.slotStart,
        reason: appointmentData.reason,
        notes: notesSnap.exists() ? notesSnap.data() : null,
      });
    }

    return notesHistory;
  } catch (error) {
    console.error('Error obteniendo historial de notas:', error);
    throw error;
  }
};

/**
 * Obtiene el historial médico completo de un paciente (todas sus citas con notas)
 * Para uso del paciente - ve todas sus citas con todos los médicos
 * @param {string} patientId - ID del paciente
 * @returns {Promise<Array>}
 */
export const getPatientFullHistory = async (patientId) => {
  try {
    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('patientId', '==', patientId),
      where('status', '==', 'completed'),
      orderBy('slotStart', 'desc')
    );

    const appointmentsSnap = await getDocs(q);
    const history = [];

    for (const appointmentDoc of appointmentsSnap.docs) {
      const appointmentData = appointmentDoc.data();
      const notesRef = doc(db, 'appointments', appointmentDoc.id, 'doctorNotes', 'data');
      const notesSnap = await getDoc(notesRef);

      // Obtener datos del doctor
      let doctorName = 'Doctor';
      try {
        const doctorRef = doc(db, 'users', appointmentData.doctorId);
        const doctorSnap = await getDoc(doctorRef);
        if (doctorSnap.exists()) {
          const doctorData = doctorSnap.data();
          doctorName = `Dr. ${doctorData.name || ''} ${doctorData.lastName || ''}`.trim();
        }
      } catch (e) {
        console.log('Error obteniendo doctor:', e);
      }

      history.push({
        appointmentId: appointmentDoc.id,
        appointmentDate: appointmentData.slotStart,
        reason: appointmentData.reason,
        doctorId: appointmentData.doctorId,
        doctorName,
        notes: notesSnap.exists() ? notesSnap.data() : null,
      });
    }

    return history;
  } catch (error) {
    console.error('Error obteniendo historial completo:', error);
    throw error;
  }
};
