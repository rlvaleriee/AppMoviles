import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Guarda/actualiza un token FCM para el usuario.
 * (Preparado para cuando uses FCM real en un build nativo)
 */
export async function saveUserFcmToken({ uid, token, platform }) {
  if (!uid || !token) return;

  const ref = doc(db, 'users', uid, 'fcmTokens', token);
  await setDoc(
    ref,
    {
      token,
      platform,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Crea una notificación interna para el usuario.
 * Se guarda en: users/{uid}/notifications/{notifId}
 */
export async function createUserNotification(
  uid,
  { title, body, data = {}, type = 'general' }
) {
  if (!uid) return;

  await addDoc(collection(db, 'users', uid, 'notifications'), {
    title,
    body,
    type,      // ej: 'appointment-request', 'appointment-accepted', etc.
    data,      // info extra (id de cita, rol, etc.)
    read: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Envía notificación cuando un doctor es verificado
 */
export async function notifyDoctorVerification(doctorId) {
  if (!doctorId) return;

  await createUserNotification(doctorId, {
    title: '¡Cuenta verificada!',
    body: 'Tu cuenta de médico ha sido verificada exitosamente. Ahora los pacientes podrán encontrarte y agendar citas contigo.',
    type: 'account-verified',
    data: { verified: true },
  });
}

/**
 * Envía notificación al doctor cuando un paciente envía su cuadro médico
 */
export async function notifyDoctorMedicalRecord(doctorId, patientName, appointmentId) {
  if (!doctorId) return;

  await createUserNotification(doctorId, {
    title: 'Nuevo cuadro médico recibido',
    body: `${patientName} ha enviado su cuadro médico para la cita.`,
    type: 'medical-record-submitted',
    data: {
      appointmentId,
      patientName,
      timestamp: new Date().toISOString()
    },
  });
}

