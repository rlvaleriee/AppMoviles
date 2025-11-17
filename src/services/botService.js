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
  Timestamp,
} from 'firebase/firestore';

dayjs.locale('es');

// ========== UTILIDADES DE HORARIO ==========
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

// ========== CACHÉ DE ESPECIALIDADES ==========
let CACHED_SPECIALTIES = [];
let LAST_FETCH = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// ========== CARGAR ESPECIALIDADES DISPONIBLES ==========
async function loadAvailableSpecialties() {
  const now = Date.now();

  if (CACHED_SPECIALTIES.length > 0 && now - LAST_FETCH < CACHE_DURATION) {
    return CACHED_SPECIALTIES;
  }

  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'doctor')
    );
    const snap = await getDocs(q);

    const specialtiesSet = new Set();

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      if (data?.cssp?.profession) {
        specialtiesSet.add(data.cssp.profession);
      }
      if (data?.specialty) {
        specialtiesSet.add(data.specialty);
      }
      if (Array.isArray(data?.specialties)) {
        data.specialties.forEach((s) => {
          if (s && s.trim()) specialtiesSet.add(s.trim());
        });
      }
    });

    CACHED_SPECIALTIES = Array.from(specialtiesSet).filter(Boolean);
    LAST_FETCH = now;
    return CACHED_SPECIALTIES;
  } catch (error) {
    console.error('❌ Error cargando especialidades:', error);
    return [];
  }
}

// ========== VERIFICAR SI HAY DOCTORES CON UNA ESPECIALIDAD ==========
async function checkDoctorsAvailability(specialtyLabel) {
  try {
    const base = collection(db, 'users');
    const q = query(base, where('role', '==', 'doctor'));
    const snap = await getDocs(q);

    const term = (specialtyLabel || '').toLowerCase().trim();

    const doctors = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        const csspProf = u?.cssp?.profession || '';
        const specialty = u?.specialty || '';
        const arr = Array.isArray(u?.specialties) ? u.specialties : [];

        const hitCSSP = (csspProf || '').toLowerCase().includes(term);
        const hitSpecialty = (specialty || '').toLowerCase().includes(term);
        const hitArr = arr.some((s) => (s || '').toLowerCase().includes(term));
        return hitCSSP || hitSpecialty || hitArr;
      });

    return doctors.length > 0;
  } catch (error) {
    console.error('Error verificando disponibilidad de doctores:', error);
    return false;
  }
}

// Mapeo de patrones -> keywords 
const SYMPTOM_TO_KEYWORDS = {
  'bajar de peso|bajada de peso|perder peso|perdida de peso|adelgazar|obesidad|sobrepeso|dieta|nutrici|alimentaci|desnutri|peso ideal|engordar|anorexia|bulimia':
    ['nutrici', 'dietética', 'dietetica', 'nutricion'],
  'vomito|vómito|nausea|náusea|diarrea|estreñi|dolor de estomago|dolor estomacal|gastritis|reflujo|colon|digestivo':
    ['gastro', 'medicina', 'medico', 'doctor', 'general'],
  'fiebre|calentura|tos|grip|gripe|resfri|malestar general|cefalea|dolor de cabeza|mareo':
    ['medicina', 'medico', 'doctor', 'general'],
  'dolor de pecho|pecho|corazón|corazon|taquicardia|palpitaciones|cardio|presión alta|presion alta|hipertensi|tension alta':
    ['cardio'],
  'dient|muela|boca|caries|encía|encia|ortodon|dental|dolor de muela|sangrado de encías':
    ['dental', 'odont', 'cirugía dental', 'cirugia dental'],
  'fisioterap|rehabilit|terapia física|terapia fisica|dolor de espalda|espalda|lumbago|lumbar|esguince|contractura|cuello|cervical':
    ['fisioterap', 'física', 'fisica', 'terapia ocupacional', 'rehabilitacion'],
  'fractur|hueso roto|caída|caida|trauma|golpe|lesion deportiva|rodilla|tobillo|muñeca|luxacion':
    ['trauma', 'ortopedia'],
  'embaraz|embarazo|gesta|gestacion|materno|lactanc|lactancia|posparto|prenatal|bebe|bebé|recien nacido|parto':
    ['materno', 'infantil', 'maternidad', 'obstetric'],
  'ojo|ojos|visión|vision|ver borroso|miop|miopia|astigmat|astigmatismo|vista|lentes|conjuntivitis|orzuelo':
    ['optometr', 'oftalmol', 'vision'],
  'ansied|ansiedad|depresi|depresion|psicol|estrés|estres|pánico|panico|duelo|salud mental|tristeza|insomnio|angustia':
    ['psicol'],
  'farmaci|medicamento|pastilla|receta|dosis|interaccion|efectos secundarios':
    ['farmaci', 'química', 'quimica'],
  'mascota|perro|gato|veterinari|animal|ave|reptil|caballo':
    ['veterinari'],
  'piel|acné|acne|dermat|lunar|eczema|psoriasis|alergia cutanea|manchas|ronchas|sarpullido|comezon':
    ['dermat'],
  'niño|niña|pediatr|bebe|bebé|infante|vacuna infantil|control de niño sano':
    ['pediatr'],
  'mujer|gineco|menstruaci|menstruacion|menopausia|anticonceptivo|papanicolau|ovario|utero|matriz':
    ['gineco'],
  'enferm|curacion|curación|inyeccion|inyección|sutura|control de signos|presion arterial|toma de muestra':
    ['enferm'],
  'orina|orinar|riñon|riñones|prostata|próstata|vias urinarias|infeccion urinaria':
    ['urolog'],
  'radiolog|rayos x|tomograf|tomografia|resonancia|ecografia|ultrasonido|imagen medica':
    ['radiolog', 'imágenes', 'imagenes'],
  'laboratorio|examen de sangre|analisis clinico|bioanalisis|prueba de laboratorio':
    ['laboratorio', 'bioanalisis', 'laboratorio clinico'],
};

// Fallbacks de nombre amigable por patrón (para cuando NO hay médicos registrados)
const PATTERN_FRIENDLY_FALLBACK = {
  'bajar de peso|bajada de peso|perder peso|perdida de peso|adelgazar|obesidad|sobrepeso|dieta|nutrici|alimentaci|desnutri|peso ideal|engordar|anorexia|bulimia':
    'un nutricionista',
  'dolor de pecho|pecho|corazón|corazon|taquicardia|palpitaciones|cardio|presión alta|presion alta|hipertensi|tension alta':
    'un cardiólogo',
  'piel|acné|acne|dermat|lunar|eczema|psoriasis|alergia cutanea|manchas|ronchas|sarpullido|comezon':
    'un dermatólogo',
  'niño|niña|pediatr|bebe|bebé|infante|vacuna infantil|control de niño sano':
    'un pediatra',
  'mujer|gineco|menstruaci|menstruacion|menopausia|anticonceptivo|papanicolau|ovario|utero|matriz':
    'un ginecólogo',
  
};

// ========== ANÁLISIS DE SÍNTOMAS (SIN FALLBACK A MEDICINA GENERAL) ==========
async function analyzeSymptoms(text) {
  const availableSpecs = await loadAvailableSpecialties();
  console.log('📋 Especialidades disponibles:', availableSpecs);

  const textLower = (text || '').toLowerCase();
  console.log('🔍 Analizando texto:', textLower);

  if (availableSpecs.length === 0) {
    return {
      key: 'sin_especialidades',
      name: 'la especialidad adecuada',
      conademLabel: null,
      hasDoctors: false,
    };
  }

  // 1) PATRONES DE SÍNTOMAS -> ESPECIALIDADES REGISTRADAS
  for (const [pattern, keywords] of Object.entries(SYMPTOM_TO_KEYWORDS)) {
    const regex = new RegExp(pattern);

    if (regex.test(textLower)) {
      console.log('✅ Patrón coincidente:', pattern);
      console.log('🔑 Keywords a buscar:', keywords);

      let matchedSpec = null;

      for (const spec of availableSpecs) {
        const specLower = spec.toLowerCase();
        console.log('   Comparando', `"${spec}"`, 'con keywords...');
        if (keywords.some((kw) => specLower.includes(kw))) {
          matchedSpec = spec;
          break;
        }
      }

      if (matchedSpec) {
        console.log('✅ Especialidad registrada encontrada:', matchedSpec);
        return {
          key: normalizeKey(matchedSpec),
          name: formatSpecialtyName(matchedSpec),
          conademLabel: matchedSpec,
          hasDoctors: true,
        };
      }

      // Patrón detectado pero NO hay esa especialidad en la BD
      console.log(
        '⚠️ No se encontró especialidad registrada para este patrón (no se hará fallback a Medicina General).'
      );

      const friendlyFallback =
        PATTERN_FRIENDLY_FALLBACK[pattern] || 'un especialista adecuado';

      return {
        key: normalizeKey(keywords[0] || 'sin_especialidad'),
        name: friendlyFallback,      
        conademLabel: null,          
        hasDoctors: false,           
      };
    }
  }

  // 2) SIN PATRÓN: intentar matchear el texto directamente con alguna especialidad registrada
  const fuzzyMatch = availableSpecs.find((spec) => {
    const specLower = spec.toLowerCase();
    return (
      specLower.includes(textLower) ||      
      textLower.includes(specLower)         
    );
  });

  if (fuzzyMatch) {
    console.log('✅ Coincidencia directa con especialidad registrada:', fuzzyMatch);
    return {
      key: normalizeKey(fuzzyMatch),
      name: formatSpecialtyName(fuzzyMatch),
      conademLabel: fuzzyMatch,
      hasDoctors: true,
    };
  }

  // 3) NO HAY PATRÓN NI ESPECIALIDAD REGISTRADA COINCIDENTE
  console.log(
    '⚠️ No se encontró ninguna especialidad registrada que coincida con el texto (no se recomendará Medicina General).'
  );

  return {
    key: 'sin_especialidad',
    name: 'la especialidad que corresponda a tus síntomas',
    conademLabel: null,
    hasDoctors: false,
  };
}

// ========== FORMATEAR NOMBRE DE ESPECIALIDAD ==========
function formatSpecialtyName(specialty) {
  const text = (specialty || '').trim().toUpperCase();
  
  const friendlyNames = {
    'DOCTOR(A)EN MEDICINA': 'un médico general',
    'DOCTOR(A) EN MEDICINA': 'un médico general',
    'MEDICO(A) INTEGRAL COMUNITARIO': 'un médico general',

    'DOCTOR(A) EN CIRUGÍA DENTAL': 'un odontólogo',
    'DOCTOR(A) EN CIRUGIA DENTAL': 'un odontólogo',

    'LIC. EN NUTRICION Y DIETETICA': 'un nutricionista',
    'LIC. EN NUTRICION': 'un nutricionista',

    'LIC. EN FISIOTERAPIA': 'un fisioterapeuta',
    'TERAPIA FISICA': 'un fisioterapeuta',
    'LIC. EN SALUD EN TERAPIA FISICA': 'un fisioterapeuta',
    'LICENCIADO(A) EN TERAPIA FISICA': 'un fisioterapeuta',

    'LIC. EN SALUD PERFIL TRAUMATOLOGIA': 'un traumatólogo',

    'LIC. EN OPTOMETRIA': 'un optometrista',
    'TEC. OPTOMETRIA': 'un optometrista',

    'LICENCIADO(A) EN PSICOLOGIA': 'un psicólogo',

    'LIC. EN QUIMICA Y FARMACIA': 'un profesional en farmacia',
    'DOCTOR(A) EN QUIMICA Y FARMACIA': 'un profesional en farmacia',

    'MÉDICO(A) VETERINARIO': 'un médico veterinario',
    'MEDICO(A) VETERINARIO': 'un médico veterinario',

    'LIC. EN ENFERMERIA': 'un profesional de enfermería',
    'ENFERMERO(A) GRADUADO': 'un profesional de enfermería',

    'LIC. EN SALUD MATERNO INFANTIL': 'un especialista en salud materno-infantil',
  };
  
  if (friendlyNames[text]) return friendlyNames[text];
  
  for (const [key, value] of Object.entries(friendlyNames)) {
    if (text.includes(key) || key.includes(text)) {
      return value;
    }
  }
  
  const cleaned = text
    .replace(/^(LIC\.|LICENCIADO\(A\)|TEC\.|TECNICO\(A\)|DOCTOR\(A\)|MEDICO\(A\))\s*/gi, '')
    .replace(/\s+EN\s+/gi, ' ')
    .toLowerCase()
    .trim();
  
  return `un especialista en ${cleaned}`;
}

function normalizeKey(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
}

// ========== RESPUESTAS RÁPIDAS ==========
function getQuickResponse(text) {
  const t = (text || '').toLowerCase();
  
  if (/^(hola|buenos días|buenas tardes|buenas noches|saludos)/.test(t)) {
    return '¡Hola! 👋 Cuéntame tus síntomas o el tipo de consulta que buscas.';
  }
  
  if (/(ayuda|necesito|urgente)/.test(t)) {
    return 'Estoy aquí para ayudarte. ¿Qué te gustaría consultar?';
  }
  
  if (/(gracias|muchas gracias)/.test(t)) {
    return '¡De nada! ¿Hay algo más en lo que pueda ayudarte? 😊';
  }
  
  return null;
}

// ========== FECHAS DISPONIBLES ==========
function getAvailableDates(n = 7) {
  const days = [];
  const start = dayjs();
  for (let i = 0; i < n; i++) {
    const d = start.add(i, 'day');
    days.push({
      date: d.format('YYYY-MM-DD'),
      displayDate: d.format('ddd, D MMM'),
    });
  }
  return days;
}

// ========== HORARIOS DISPONIBLES ==========
async function getAvailableTimes(doctorId, dateYmd) {
  const ref = doc(db, 'users', doctorId, 'availabilities', dateYmd);
  const snap = await getDoc(ref);
  let slots = [];

  if (snap.exists()) {
    const data = snap.data();
    if (Array.isArray(data.slots)) slots = data.slots;
    else if (Array.isArray(data.ranges))
      slots = deriveSlotsFromRanges(data.ranges, data.slotDuration || 30);
  }

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

// ========== CREAR CITA ==========
async function createAppointment(payload) {
  const docRef = await addDoc(collection(db, 'appointments'), {
    ...payload,
    status: 'scheduled',
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// ========== GUARDAR HISTORIAL ==========
async function saveChatHistory(userId, messages) {
  const ref = await addDoc(collection(db, 'chat_history', userId, 'sessions'), {
    createdAt: Timestamp.now(),
    messages,
  });
  return ref.id;
}

export default {
  analyzeSymptoms,
  getQuickResponse,
  loadAvailableSpecialties,
  checkDoctorsAvailability,
  getAvailableDates,
  getAvailableTimes,
  isTimeSlotAvailable,
  createAppointment,
  saveChatHistory,
};
