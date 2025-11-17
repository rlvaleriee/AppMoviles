import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

dayjs.locale('es');

// ---- util horario (igual que tu calendario) ----
const toMinutes = (hhmm) => {
  if (typeof hhmm !== 'string') return NaN;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return NaN;
  return h * 60 + mi;
};
const two = (n) => String(n).padStart(2, '0');
const fromMinutes = (m) => {
  m = Math.max(0, Math.min(24 * 60, m));
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${two(h)}:${two(mi)}`;
};
const sliceIntervalToSlots = (start, end, durationMin = 30) => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const d = Math.max(5, durationMin | 0);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];
  const result = [];
  let t = s;
  while (t + d <= e) {
    result.push(fromMinutes(t));
    t += d;
  }
  return result;
};
const deriveSlotsFromRanges = (ranges = [], duration = 30) => {
  const all = [];
  for (const r of ranges) {
    if (r?.start && r?.end) all.push(...sliceIntervalToSlots(r.start, r.end, duration));
  }
  return Array.from(new Set(all)).sort((a, b) => toMinutes(a) - toMinutes(b));
};

// ---- especialidades simples (para analyzeSymptoms / filtros) ----
const SPECIALTIES = {
  general: { key: 'general', name: 'Medicina General' },
  cardiology: { key: 'cardiology', name: 'Cardiología' },
  dermatology: { key: 'dermatology', name: 'Dermatología' },
  pediatrics: { key: 'pediatrics', name: 'Pediatría' },
  traumatology: { key: 'traumatology', name: 'Traumatología' },
  gynecology: { key: 'gynecology', name: 'Ginecología' },
};

function analyzeSymptoms(text) {
  const t = (text || '').toLowerCase();

  if (/(pecho|corazón|taquicardia|cardio)/.test(t)) return SPECIALTIES.cardiology;
  if (/(piel|erupción|dermat)/.test(t)) return SPECIALTIES.dermatology;
  if (/(niñ|bebé|pedi)/.test(t)) return SPECIALTIES.pediatrics;
  if (/(hues|fract|trauma|torced)/.test(t)) return SPECIALTIES.traumatology;
  if (/(gine|embaraz|menstru|mujer)/.test(t)) return SPECIALTIES.gynecology;

  return SPECIALTIES.general;
}

function getQuickResponse(text) {
  const t = (text || '').toLowerCase();
  if (/hola|buen[oa]s/.test(t)) return '¡Hola! Cuéntame tus síntomas o el tipo de consulta que buscas.';
  if (/ayuda|necesito/.test(t)) return 'Estoy aquí para ayudarte. ¿Qué te gustaría consultar?';
  return null;
}

// ---- Médicos desde Firestore ----
async function getDoctorsBySpecialty(specialtyKey) {
  const out = [];
  const spec = SPECIALTIES[specialtyKey] || SPECIALTIES.general;
  const display = spec.name;

  // 1) doctor_search (si existe tu índice/colección)
  try {
    const q1 = query(collection(db, 'doctor_search'), where('specialties', 'array-contains', display));
    const snap1 = await getDocs(q1);
    snap1.forEach((d) => {
      const x = d.data();
      out.push({
        id: x.doctorId || d.id,
        name: x.name || x.fullName || 'Médico/a',
        rating: x.ratingAvg ?? x.rating ?? 4.6,
        experience: x.experience || '5 años',
        raw: x,
      });
    });
  } catch (_) {}

  // 2) fallback: users (role=doctor, verified=true)
  if (out.length === 0) {
    const q2 = query(collection(db, 'users'), where('role', '==', 'doctor'));
    const snap2 = await getDocs(q2);
    snap2.forEach((d) => {
      const x = d.data();
      // filtro: verified y profesión/array que contenga la especialidad
      const okVerified = x.verified !== false; // si no existe el flag, lo consideramos OK
      const prof = x?.cssp?.profession || '';
      const specs = x?.specialties || [];
      const matches =
        prof.toLowerCase().includes(display.toLowerCase()) ||
        specs.map((s) => (s || '').toLowerCase()).includes(display.toLowerCase());

      if (okVerified && matches) {
        out.push({
          id: d.id,
          name: x.name && x.lastName ? `${x.name} ${x.lastName}` : (x.name || 'Médico/a'),
          rating: x.rating ?? 4.6,
          experience: x.experience || '5 años',
          raw: x,
        });
      }
    });
  }

  // ordena por rating desc
  out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return out.slice(0, 10);
}

// ---- Fechas disponibles (UI simple de los próximos n días) ----
function getAvailableDates(n = 7) {
  const days = [];
  const start = dayjs();
  for (let i = 0; i < n; i++) {
    const d = start.add(i, 'day');
    days.push({
      date: d.format('YYYY-MM-DD'),
      displayDate: d.format('ddd, D MMM'), // el UI hace split(',') para día y número
    });
  }
  return days;
}

// ---- Horarios disponibles reales (usa users/{doctorId}/availabilities/{date}) ----
async function getAvailableTimes(doctorId, dateYmd) {
  const ref = doc(db, 'users', doctorId, 'availabilities', dateYmd);
  const snap = await getDoc(ref);
  let slots = [];

  if (snap.exists()) {
    const data = snap.data();
    if (Array.isArray(data.slots)) slots = data.slots;
    else if (Array.isArray(data.ranges)) slots = deriveSlotsFromRanges(data.ranges, data.slotDuration || 30);
  }

  // quitar los horarios ya reservados en appointments
  const q = query(
    collection(db, 'appointments'),
    where('doctorId', '==', doctorId),
    where('date', '==', dateYmd)
  );
  const taken = new Set();
  const takenSnap = await getDocs(q);
  takenSnap.forEach((d) => {
    const x = d.data();
    if (x?.time) taken.add(x.time);
  });

  return slots.filter((t) => !taken.has(t));
}

async function isTimeSlotAvailable(doctorId, dateYmd, hhmm) {
  const times = await getAvailableTimes(doctorId, dateYmd);
  return times.includes(hhmm);
}

// ---- Crear cita ----
async function createAppointment(payload) {
  const docRef = await addDoc(collection(db, 'appointments'), {
    ...payload,
    status: 'scheduled',
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// ---- Guardar historial de chat ----
async function saveChatHistory(userId, messages) {
  const ref = await addDoc(collection(db, 'chat_history', userId, 'sessions'), {
    createdAt: Timestamp.now(),
    messages,
  });
  return ref.id;
}

export default {
  // NLU simple
  analyzeSymptoms,
  getQuickResponse,

  // Médicos / disponibilidad
  getDoctorsBySpecialty,
  getAvailableDates,
  getAvailableTimes,
  isTimeSlotAvailable,

  // Citas / historial
  createAppointment,
  saveChatHistory,
};
