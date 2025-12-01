import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import openaiService from './openaiService';

// ========== MAPEO DE ESPECIALIDADES ==========
const SPECIALTY_MAPPING = {
  'medicina general': ['en medicina'],
  'nutrición': ['nutrici', 'dietética', 'dietetica'],
  'cardiología': ['cardio'],
  'dermatología': ['dermat'],
  'pediatría': ['pediatr'],
  'ginecología': ['gineco'],
  'gastroenterología': ['gastro'],
  'traumatología': ['trauma', 'ortopedia'],
  'ortopedia': ['trauma', 'ortopedia'],
  'fisioterapia': ['fisioterap', 'física', 'fisica', 'terapia ocupacional', 'rehabilitacion'],
  'quiropractico': ['quiropractico', 'quiropractica'],
  'psicología': ['psicol'],
  'odontología': ['dental', 'odont', 'cirugía dental', 'cirugia dental'],
  'oftalmología': ['optometr', 'oftalmol', 'vision'],
  'optometría': ['optometr', 'oftalmol', 'vision'],
  'urología': ['urolog'],
  'enfermería': ['enferm'],
  'veterinaria': ['veterinari'],
  'farmacia': ['farmaci', 'química', 'quimica'],
  'radiología': ['radiolog', 'imágenes', 'imagenes'],
  'laboratorio': ['laboratorio', 'bioanalisis', 'laboratorio clinico'],
};

// ========== ANÁLISIS DE SÍNTOMAS CON OPENAI ==========
async function analyzeSymptoms(text, conversationHistory = []) {
  try {
    // Llamar a OpenAI
    const aiAnalysis = await openaiService.analyzeMessageWithAI(text, conversationHistory);

    // Si OpenAI no tiene una recomendación clara, devolver sin especialidad
    if (!aiAnalysis.hasRecommendation || aiAnalysis.needsMoreInfo) {
      return {
        key: 'needs_more_info',
        name: null,
        conademLabel: null,
        hasDoctors: false,
        aiResponse: aiAnalysis.response,
        needsMoreInfo: true,
        urgencyLevel: aiAnalysis.urgencyLevel,
      };
    }

    // OpenAI tiene una recomendación, buscar keywords para esta especialidad
    const aiSpecialty = (aiAnalysis.specialty || '').toLowerCase();
    let matchedKeywords = SPECIALTY_MAPPING[aiSpecialty] || [];

    // Si no hay mapeo directo, intentar buscar por partes del nombre
    if (matchedKeywords.length === 0) {
      for (const [key, keywords] of Object.entries(SPECIALTY_MAPPING)) {
        if (aiSpecialty.includes(key) || key.includes(aiSpecialty)) {
          matchedKeywords = keywords;
          break;
        }
      }
    }

    // Si aún no hay keywords, usar medicina general como alternativa
    const hasDoctorsForSpecialty = matchedKeywords.length > 0;
    const fallbackToGeneral = !hasDoctorsForSpecialty;

    // Keywords finales: la especialidad solicitada o medicina general como fallback
    const finalKeywords = hasDoctorsForSpecialty
      ? matchedKeywords
      : SPECIALTY_MAPPING['medicina general'];

    return {
      key: normalizeKey(aiSpecialty),
      name: formatSpecialtyName(aiSpecialty),
      conademLabel: aiSpecialty,
      searchKeywords: finalKeywords,
      hasDoctors: true, // Siempre true porque tenemos fallback a medicina general
      originalSpecialtyHasDoctors: hasDoctorsForSpecialty,
      fallbackToGeneral,
      aiResponse: aiAnalysis.response,
      urgencyLevel: aiAnalysis.urgencyLevel,
      symptomsSummary: aiAnalysis.symptomsSummary,
    };

  } catch (error) {
    console.error('❌ Error en análisis:', error);
    return {
      key: 'error',
      name: null,
      conademLabel: null,
      hasDoctors: false,
      needsMoreInfo: true,
      aiResponse: 'Disculpa, tuve un problema. ¿Podrías contarme tus síntomas de nuevo?',
    };
  }
}

// ========== FORMATEAR NOMBRE DE ESPECIALIDAD ==========
function formatSpecialtyName(specialty) {
  const friendlyNames = {
    'medicina general': 'un médico general',
    'nutrición': 'un nutricionista',
    'cardiología': 'un cardiólogo',
    'dermatología': 'un dermatólogo',
    'pediatría': 'un pediatra',
    'ginecología': 'un ginecólogo',
    'gastroenterología': 'un gastroenterólogo',
    'traumatología': 'un traumatólogo',
    'fisioterapia': 'un fisioterapeuta',
    'quiropractico': 'un quiropráctico',
    'psicología': 'un psicólogo',
    'odontología': 'un odontólogo',
    'oftalmología': 'un oftalmólogo',
    'urología': 'un urólogo',
  };

  const specialtyLower = (specialty || '').toLowerCase();
  return friendlyNames[specialtyLower] || `un especialista en ${specialty}`;
}

function normalizeKey(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
}

// ========== RESPUESTAS RÁPIDAS ==========
// Respuestas variadas para parecer más natural
const GREETING_RESPONSES = [
  '¡Hola! 😊 ¿Cómo te puedo ayudar hoy? Si tenés algún malestar, contame y te recomiendo el médico adecuado.',
  '¡Qué tal! Soy MediBot, tu asistente de salud. ¿En qué te puedo ayudar?',
  '¡Hola! Con gusto te ayudo. ¿Necesitás encontrar un médico o tenés alguna consulta sobre la app?',
];

const THANKS_RESPONSES = [
  '¡Con mucho gusto! Si necesitás algo más, aquí estoy.',
  '¡De nada! Espero haberte ayudado. ¿Algo más en que te pueda servir?',
  '¡Para eso estamos! No dudés en escribirme si necesitás algo más.',
];

const FAREWELL_RESPONSES = [
  '¡Que estés bien! Recuerda que estoy aquí si me necesitás.',
  '¡Hasta pronto! Cuidate mucho.',
  '¡Nos vemos! Si te sentís mal, no dudés en buscar atención médica.',
];

function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

function getQuickResponse(text) {
  const t = (text || '').toLowerCase().trim();

  // Saludos
  if (/^(hola|hey|buenas|buenos días|buenas tardes|buenas noches|saludos|qué tal|que tal|ey)/.test(t)) {
    return getRandomResponse(GREETING_RESPONSES);
  }

  // Despedidas
  if (/^(adiós|adios|chao|bye|hasta luego|nos vemos|me voy)/.test(t) || t === 'gracias adios' || t === 'gracias, adios') {
    return getRandomResponse(FAREWELL_RESPONSES);
  }

  // Agradecimientos
  if (/(gracias|muchas gracias|te agradezco|muy amable)/.test(t) && t.length < 30) {
    return getRandomResponse(THANKS_RESPONSES);
  }

  // Confirmaciones simples (sí, ok, etc.) - dejar que el flujo principal maneje esto
  if (/^(sí|si|ok|dale|claro|va|está bien|listo)$/.test(t)) {
    return null; // Dejar que el flujo principal maneje
  }

  // Preguntas sobre medicamentos - respuesta empática
  if (/(qué medicina|qué medicamento|recomienda.*medicina|recomienda.*medicamento|pastilla|dosis|remedio|qué me tomo|que me tomo)/.test(t)) {
    return 'Entiendo que querés alivio rápido, pero no me es posible recetar medicamentos. Lo mejor es que un médico te evalúe. ¿Querés que te recomiende uno según tus síntomas?';
  }

  // Preguntas sobre contacto/horarios/precios
  if (/(teléfono|telefono|número|contacto|horario|precio|costo|cuánto cuesta|consulta.*precio)/.test(t)) {
    return 'Esa información la encontrás en el perfil de cada médico. Si me contás qué necesitás, te puedo recomendar especialistas y ahí ves sus datos de contacto.';
  }

  // Ayuda con la app - agendar cita
  if (/(cómo.*agendar|como.*agendar|agendar.*cita|hacer.*cita|reservar.*cita|sacar.*cita)/.test(t)) {
    return '¡Es fácil! Solo tocá el perfil del médico que te interese y seleccioná "Agendar cita". Ahí elegís fecha y hora disponible. ¿Necesitás que te recomiende un médico primero?';
  }

  // Ayuda con la app - ver citas
  if (/(dónde.*mis citas|donde.*mis citas|ver.*citas|consultar.*citas|mis citas)/.test(t)) {
    return 'Tus citas agendadas las encontrás en la sección "Citas" del menú principal. Ahí podés ver el estado de cada una.';
  }

  // Usuario dice que se siente bien
  if (/(me siento bien|estoy bien|todo bien|nada|no tengo nada)/.test(t)) {
    return '¡Qué bueno que estés bien! 😊 Si en algún momento necesitás encontrar un médico o tenés alguna consulta, aquí estaré para ayudarte.';
  }

  // Usuario pregunta qué puede hacer el bot
  if (/(qué puedes hacer|que puedes hacer|qué haces|que haces|para qué sirves|como funciona|cómo funciona)/.test(t)) {
    return 'Te ayudo a encontrar el médico adecuado según tus síntomas. Solo contame cómo te sentís o qué molestia tenés, y te recomiendo especialistas cerca de vos. También puedo ayudarte con dudas sobre la app.';
  }

  return null;
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
  saveChatHistory,
  ...openaiService,
};
