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
import { createUserNotification, notifyDoctorVerification } from './notificationsService';

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
// La foto viene directamente de Cloudinary vía el campo photoURL
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

// Verifica la cuenta de un doctor y envía notificación
export const verifyDoctor = async (doctorId) => {
  if (!doctorId) throw new Error('Doctor ID requerido');

  const ref = doc(db, 'users', doctorId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('Doctor no encontrado');

  const userData = snap.data();
  if (userData.role !== 'doctor') {
    throw new Error('El usuario no es un doctor');
  }

  // Actualizar estado de verificación
  await updateDoc(ref, {
    verified: true,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Enviar notificación al doctor
  await notifyDoctorVerification(doctorId);

  return { success: true, doctorId };
};

// Rechaza la verificación de un doctor
export const rejectDoctorVerification = async (doctorId, reason = '') => {
  if (!doctorId) throw new Error('Doctor ID requerido');

  const ref = doc(db, 'users', doctorId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('Doctor no encontrado');

  // Actualizar estado
  await updateDoc(ref, {
    verified: false,
    verificationRejected: true,
    rejectionReason: reason,
    updatedAt: serverTimestamp(),
  });

  // Enviar notificación al doctor
  await createUserNotification(doctorId, {
    title: 'Verificación rechazada',
    body: reason || 'Tu solicitud de verificación ha sido rechazada. Por favor revisa tu información y contacta al administrador.',
    type: 'verification-rejected',
    data: { verified: false, reason },
  });

  return { success: true, doctorId };
};

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

// Helper para formatear fecha como YYYY-MM-DD
const formatDateKey = (date) => {
  const d = date instanceof Date ? date : date.toDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper para generar slots desde bloques de horario
const generateSlotsFromBlocks = (blocks, slotDuration = 30) => {
  const slots = [];
  const duration = Math.max(5, slotDuration);

  (blocks || []).forEach((block) => {
    if (!block?.start || !block?.end) return;

    const parseTime = (hhmm) => {
      const [h, m] = String(hhmm || '').split(':').map((v) => parseInt(v, 10));
      return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
    };

    const startParts = parseTime(block.start);
    const endParts = parseTime(block.end);
    const startMin = startParts.h * 60 + startParts.m;
    const endMin = endParts.h * 60 + endParts.m;

    let current = startMin;
    while (current + duration <= endMin) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      current += duration;
    }
  });

  // Ordenar y eliminar duplicados
  return [...new Set(slots)].sort();
};

// Crea una cita en 'appointments' y notifica al doctor
// También guarda/actualiza el documento de disponibilidad para preservar la configuración
export const createAppointment = async ({
  patientId,
  doctorId,
  reason = '',
  slotStart,
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

  // ============================
  // Guardar documento de disponibilidad para preservar la configuración de slots
  // Esto asegura que días con citas mantengan su configuración original
  // ============================
  try {
    const slotDate = ts.toDate();
    const dateKey = formatDateKey(slotDate);
    const dayOfWeek = slotDate.getDay();

    // Verificar si ya existe un documento de disponibilidad para este día
    const availRef = doc(db, 'users', doctorId, 'availabilities', dateKey);
    const availSnap = await getDoc(availRef);

    if (!availSnap.exists()) {
      // No existe documento - crear uno con la configuración actual del doctor
      const workSettingsRef = doc(db, 'users', doctorId, 'config', 'workSettings');
      const workSettingsSnap = await getDoc(workSettingsRef);

      if (workSettingsSnap.exists()) {
        const workSettings = workSettingsSnap.data();
        const slotDuration = workSettings.slotDuration || 30;

        // Obtener bloques del día (probar número y string por Firestore)
        const dayBlocks = workSettings.dayBlocks;
        const blocksForDay = dayBlocks?.[dayOfWeek] || dayBlocks?.[String(dayOfWeek)] || [];

        if (blocksForDay.length > 0) {
          const slots = generateSlotsFromBlocks(blocksForDay, slotDuration);

          // Crear el documento de disponibilidad preservando la configuración actual
          const dateObj = new Date(slotDate);
          dateObj.setHours(0, 0, 0, 0);

          await setDoc(availRef, {
            date: Timestamp.fromDate(dateObj),
            slots,
            slotDuration,
            generatedFrom: blocksForDay,
            updatedAt: serverTimestamp(),
            blocked: false,
            hasAppointments: true, // Marcador de que tiene citas
          });
        }
      }
    } else {
      // Ya existe documento - solo marcar que tiene citas (no modificar slots)
      await setDoc(availRef, {
        hasAppointments: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  } catch (e) {
    // Error silencioso - la cita ya fue creada, solo no se pudo guardar disponibilidad
    console.warn('[Firestore] Error saving availability on appointment:', e);
  }

  // 🔔 Notificar al DOCTOR: paciente solicitó cita
  const when =
    ts.toDate instanceof Function ? ts.toDate().toLocaleString() : '';
  await createUserNotification(doctorId, {
    title: 'Nueva solicitud de cita',
    body: `Un paciente ha solicitado una cita para ${when}.`,
    type: 'appointment-request',
    data: { appointmentId: ref.id, role: 'doctor' },
  });

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

  const q = query(base, where(field, '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ordenar manualmente por slotStart
      docs.sort((a, b) => {
        const aTime = a.slotStart?.toMillis?.() || 0;
        const bTime = b.slotStart?.toMillis?.() || 0;
        return aTime - bTime;
      });
      cb(docs);
    },
    (err) => console.warn('[Firestore] appointments subscribe error:', err)
  );
};

// Actualiza estado de una cita y genera notificaciones
export const updateAppointmentStatus = async (appointmentId, status, options = {}) => {
  const allowed = ['requested', 'accepted', 'rejected', 'cancelled', 'completed', 'noShow'];
  if (!allowed.includes(status)) throw new Error('Estado inválido');

  const ref = doc(db, 'appointments', appointmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Cita no encontrada');

  const appt = { id: snap.id, ...snap.data() };

  // 1) Actualizar cita
  const updateData = {
    status,
    updatedAt: serverTimestamp(),
  };

  // Si es cancelación, guardar quién canceló
  if (status === 'cancelled' && options.cancelledBy) {
    updateData.cancelledBy = options.cancelledBy;
  }

  await updateDoc(ref, updateData);

  const when =
    appt.slotStart?.toDate instanceof Function
      ? appt.slotStart.toDate().toLocaleString()
      : '';

  // 2) Crear notificaciones según el nuevo estado
  switch (status) {
    case 'accepted':
      // Notificar al paciente: médico aceptó la cita
      await createUserNotification(appt.patientId, {
        title: 'Cita aceptada',
        body: `Tu cita con el médico ha sido aceptada para ${when}.`,
        type: 'appointment-accepted',
        data: { appointmentId },
      });
      break;

    case 'rejected':
      // Notificar al paciente: médico rechazó la cita
      await createUserNotification(appt.patientId, {
        title: 'Cita rechazada',
        body: 'Tu solicitud de cita fue rechazada por el médico.',
        type: 'appointment-rejected',
        data: { appointmentId },
      });
      break;

    case 'completed':
      // Notificar al paciente: cita completada
      await createUserNotification(appt.patientId, {
        title: 'Cita completada',
        body: 'Tu cita fue marcada como completada.',
        type: 'appointment-completed',
        data: { appointmentId },
      });
      break;

    case 'noShow':
      // Notificar al paciente: no se presentó
      await createUserNotification(appt.patientId, {
        title: 'No te presentaste',
        body: 'Tu cita fue marcada como "no se presentó". Por favor, agenda una nueva cita si lo necesitas.',
        type: 'appointment-noshow',
        data: { appointmentId },
      });
      break;

    case 'cancelled':
      // Notificar a la otra parte según quién canceló
      if (options.cancelledBy === 'doctor') {
        // Doctor canceló -> notificar al paciente
        await createUserNotification(appt.patientId, {
          title: 'Cita cancelada por el médico',
          body: `Tu cita programada para ${when} ha sido cancelada por el médico.`,
          type: 'appointment-cancelled',
          data: { appointmentId },
        });
      } else {
        // Paciente canceló -> notificar al doctor
        await createUserNotification(appt.doctorId, {
          title: 'Cita cancelada',
          body: 'Una cita agendada ha sido cancelada por el paciente.',
          type: 'appointment-cancelled',
          data: { appointmentId },
        });
      }
      break;

    default:
      break;
  }
};

// Helpers de conveniencia
export const acceptAppointment = (id) => updateAppointmentStatus(id, 'accepted');
export const rejectAppointment = (id) => updateAppointmentStatus(id, 'rejected');
export const cancelAppointment = (id) => updateAppointmentStatus(id, 'cancelled');
export const cancelAppointmentByDoctor = (id) => updateAppointmentStatus(id, 'cancelled', { cancelledBy: 'doctor' });
export const completeAppointment = (id) => updateAppointmentStatus(id, 'completed');
export const noShowAppointment = (id) => updateAppointmentStatus(id, 'noShow');

// (Opcional) borrar cita
export const deleteAppointment = async (appointmentId) => {
  await deleteDoc(doc(db, 'appointments', appointmentId));
};

/* ─────────────────────────  Genéricos  ───────────────────────── */
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

/* ─────────────────────────  Registros Médicos  ───────────────────────── */
// Guardar o actualizar un registro médico
export const saveMedicalRecord = async (recordData, recordId = null) => {
  if (recordId) {
    // Actualizar registro existente
    const ref = doc(db, 'medicalRecords', recordId);
    await updateDoc(ref, {
      ...recordData,
      updatedAt: serverTimestamp(),
    });
    return recordId;
  } else {
    // Crear nuevo registro
    const ref = await addDoc(collection(db, 'medicalRecords'), {
      ...recordData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }
};

// Obtener registro médico por appointmentId
export const getMedicalRecordByAppointment = async (appointmentId) => {
  const q = query(
    collection(db, 'medicalRecords'),
    where('appointmentId', '==', appointmentId)
  );
  const snap = await getDocs(q);

  if (snap.empty) return null;

  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
};

// Obtener todos los registros médicos de un paciente
// Si se proporciona doctorId, solo trae los registros compartidos con ese doctor
export const getMedicalRecordsByPatient = async (patientId, doctorId = null) => {
  let q;

  if (doctorId) {
    // Filtrar solo los registros médicos enviados a este doctor específico
    q = query(
      collection(db, 'medicalRecords'),
      where('patientId', '==', patientId),
      where('doctorId', '==', doctorId),
      orderBy('createdAt', 'desc')
    );
  } else {
    // Sin filtro de doctor, traer todos (para uso del paciente)
    q = query(
      collection(db, 'medicalRecords'),
      where('patientId', '==', patientId),
      orderBy('createdAt', 'desc')
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Suscribirse a los registros médicos de un paciente en tiempo real
export const subscribeMedicalRecordsByPatient = (patientId, callback) => {
  const q = query(
    collection(db, 'medicalRecords'),
    where('patientId', '==', patientId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Firestore] subscribe medical records error:', err)
  );
};

// Obtener un registro médico específico por ID
export const getMedicalRecordById = async (recordId) => {
  const ref = doc(db, 'medicalRecords', recordId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return { id: snap.id, ...snap.data() };
};
