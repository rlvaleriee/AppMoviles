import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  startAt,
  endAt,
} from 'firebase/firestore';
import { db } from '../firebase';

/* ─────────────────────────  Usuarios / Perfil  ───────────────────────── */
// Guarda/actualiza el perfil del usuario en users/{uid}
export const saveUserProfile = async (uid, userData) => {
  const ref = doc(db, 'users', uid);
  await setDoc(
    ref,
    {
      ...userData,
      updatedAt: serverTimestamp(),
      createdAt: userData?.createdAt || serverTimestamp(),
    },
    { merge: true }
  );
  return uid;
};

// Obtiene el doc de users/{uid}
export const getUserById = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/* ─────────────────────────  Doctores  ───────────────────────── */
// Lista doctores (users con role=='doctor'), opcionalmente filtrando por especialidad (prefijo)
export const getDoctors = async (specialty = '') => {
  const base = collection(db, 'users');
  let q = query(base, where('role', '==', 'doctor'));
  if (specialty) {
    q = query(
      base,
      where('role', '==', 'doctor'),
      orderBy('specialty'),
      startAt(specialty),
      endAt(specialty + '\uf8ff')
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Suscripción en vivo a doctores (útil para listas reactivas)
export const subscribeDoctors = (cb, specialty = '') => {
  const base = collection(db, 'users');
  let q = query(base, where('role', '==', 'doctor'));
  if (specialty) {
    q = query(
      base,
      where('role', '==', 'doctor'),
      orderBy('specialty'),
      startAt(specialty),
      endAt(specialty + '\uf8ff')
    );
  }
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Firestore] doctors subscribe error:', err)
  );
};

/* ─────────────────────────  Citas (appointments)  ───────────────────────── */
// Crea una cita en 'appointments'
export const createAppointment = async ({
  patientId,
  doctorId,
  reason = '',
  slotStart, // Date | string ISO | Timestamp
}) => {
  let ts = slotStart;
  if (typeof slotStart === 'string') {
    const d = new Date(slotStart);
    if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida');
    ts = Timestamp.fromDate(d);
  } else if (slotStart instanceof Date) {
    ts = Timestamp.fromDate(slotStart);
  }
  if (!(ts instanceof Timestamp)) {
    throw new Error('slotStart debe ser Date, ISO string o Timestamp');
  }

  const payload = {
    patientId,
    doctorId,
    reason,
    slotStart: ts,
    status: 'requested', // requested | accepted | rejected | cancelled | completed
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'appointments'), payload);
  return ref.id;
};

// Obtiene citas del usuario (por rol)
export const getAppointmentsForUser = async (uid, role = 'patient') => {
  const base = collection(db, 'appointments');
  const field = role === 'doctor' ? 'doctorId' : 'patientId';
  const q = query(base, where(field, '==', uid), orderBy('slotStart', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Suscribe citas del usuario (por rol)
export const subscribeAppointmentsForUser = (uid, role = 'patient', cb) => {
  const base = collection(db, 'appointments');
  const field = role === 'doctor' ? 'doctorId' : 'patientId';
  const q = query(base, where(field, '==', uid), orderBy('slotStart', 'asc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Firestore] appointments subscribe error:', err)
  );
};

// Actualiza estado genérico de una cita
export const updateAppointmentStatus = async (appointmentId, status) => {
  const allowed = ['requested', 'accepted', 'rejected', 'cancelled', 'completed'];
  if (!allowed.includes(status)) throw new Error('Estado inválido');
  await updateDoc(doc(db, 'appointments', appointmentId), {
    status,
    updatedAt: serverTimestamp(),
  });
};

// Helpers de conveniencia
export const acceptAppointment = (id) => updateAppointmentStatus(id, 'accepted');
export const rejectAppointment = (id) => updateAppointmentStatus(id, 'rejected');
export const cancelAppointment = (id) => updateAppointmentStatus(id, 'cancelled');
export const completeAppointment = (id) => updateAppointmentStatus(id, 'completed');

// (Opcional) borrar cita
export const deleteAppointment = async (appointmentId) => {
  await deleteDoc(doc(db, 'appointments', appointmentId));
};

/* ─────────────────────────  Genéricos (si los necesitas)  ───────────────────────── */
export const subscribeToCollection = (collectionName, cb) => {
  return onSnapshot(
    collection(db, collectionName),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Firestore] subscribe error:', err)
  );
};

export const getAllFromCollection = async (collectionName) => {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
