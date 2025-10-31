import {
  addDoc, collection, serverTimestamp, Timestamp, doc, updateDoc,
  query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function createAppointment({ doctorId, patientId, startISO, durationMin = 30, reason }) {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const ref = await addDoc(collection(db, 'appointments'), {
    doctorId,
    patientId,
    status: 'requested',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    slotStart: Timestamp.fromDate(start),
    slotEnd: Timestamp.fromDate(end),
    reason: reason || null,
    notes: null,
    chatThreadId: null,
    lastChangeBy: 'patient',
  });
  return ref.id;
}

export async function updateAppointmentStatus({ appointmentId, status, actor }) {
  await updateDoc(doc(db, 'appointments', appointmentId), {
    status,
    updatedAt: serverTimestamp(),
    lastChangeBy: actor, 
  });
}

export function listenAppointmentsByUser({ uid, role, cb }) {
  const base = collection(db, 'appointments');
  const q =
    role === 'doctor'
      ? query(base, where('doctorId', '==', uid), orderBy('slotStart', 'desc'))
      : query(base, where('patientId', '==', uid), orderBy('slotStart', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
