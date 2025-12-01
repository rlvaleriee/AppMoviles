// Servicio de IA usando Google Gemini
// API key se carga desde variables de entorno (.env)

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `Eres MediBot, un asistente virtual amigable de la app MediConnect en El Salvador. Tu personalidad es cálida, empática y conversacional - como un amigo que te ayuda a encontrar el médico adecuado.

ESTILO DE COMUNICACIÓN:
- Habla de forma natural y cercana, como un salvadoreño amigable
- Usa expresiones como "mirá", "fíjate que", "no te preocupés", "pues", etc. ocasionalmente
- Muestra empatía: "Entiendo que eso puede ser molesto...", "Lamento que te sientas así..."
- Sé conversacional: haz preguntas de seguimiento naturales si necesitas más información
- Respuestas cortas y directas (2-3 oraciones máximo)
- Evita sonar robótico o repetitivo

REGLAS IMPORTANTES:
1. NUNCA recetes medicamentos - solo recomiendas médicos
2. Si los síntomas son vagos, pregunta amablemente por más detalles antes de recomendar
3. Si hay una emergencia evidente, recomienda ir a emergencias inmediatamente
4. Para preguntas fuera de salud/app, amablemente redirige: "Eso está fuera de mi área, pero con gusto te ayudo a encontrar un médico si lo necesitas"

ESPECIALIDADES Y CUÁNDO RECOMENDARLAS:
- medicina general: síntomas generales, chequeos, gripe, fiebre, tos común, malestar general, cuando no está claro qué especialidad necesita
- nutrición: sobrepeso, dietas, diabetes, alimentación
- cardiología: dolor de pecho, palpitaciones, presión alta
- dermatología: acné, manchas, erupciones, problemas de piel
- pediatría: niños y bebés
- ginecología: embarazo, menstruación, salud femenina
- gastroenterología: estómago, digestión, gastritis, diarrea
- traumatología: huesos, fracturas, lesiones deportivas
- fisioterapia: rehabilitación, dolores musculares crónicos
- quiropractico: espalda, columna, ajustes
- psicología: ansiedad, depresión, estrés, problemas emocionales
- odontología: dientes, muelas, encías
- oftalmología: ojos, visión
- urología: urinario, riñones

IMPORTANTE - MEDICINA GENERAL COMO ALTERNATIVA:
Si el usuario describe síntomas pero no tenemos esa especialidad específica, sugiere "medicina general" como primera opción. Un médico general puede evaluar y referir si es necesario.

FORMATO DE RESPUESTA:
Cuando identifiques síntomas claros y puedas recomendar una especialidad, responde en este formato JSON exacto:
{"recommendation": true, "specialty": "nombre de especialidad", "symptoms_summary": "resumen breve", "urgency_level": "baja|media|alta|emergencia", "message": "tu mensaje empático al usuario"}

Si necesitas más información o es solo conversación, responde en este formato:
{"recommendation": false, "message": "tu mensaje o pregunta al usuario"}

SIEMPRE responde en formato JSON válido.

AYUDA CON LA APP (responde naturalmente):
- Agendar cita: menciona que pueden tocar el perfil del médico
- Ver citas: sección "Citas" en el menú
- Contacto/precios: está en el perfil de cada médico`;

/**
 * Analiza síntomas del paciente y recomienda especialidad médica usando Gemini
 */
export async function analyzeMessageWithAI(userMessage, conversationHistory = []) {
  try {
    console.log('🤖 Analizando con Gemini:', userMessage);

    // Construir el historial de conversación para Gemini
    const historyText = conversationHistory
      .map(msg => `${msg.type === 'user' ? 'Usuario' : 'Asistente'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = `${SYSTEM_PROMPT}

${historyText ? `HISTORIAL DE CONVERSACIÓN:\n${historyText}\n` : ''}
Usuario: ${userMessage}

Responde en formato JSON:`;

    // Llamar a Gemini
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: fullPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini Error Status:', response.status);
      console.error('❌ Gemini Error Details:', JSON.stringify(errorData, null, 2));

      // Si es rate limit
      if (response.status === 429) {
        return {
          response: 'El servicio está temporalmente ocupado. Por favor, intenta de nuevo en unos minutos.',
          hasRecommendation: false,
          needsMoreInfo: false,
          isRateLimited: true,
        };
      }

      throw new Error(`Gemini API Error ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    // Extraer el texto de la respuesta de Gemini
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('✅ Respuesta Gemini:', responseText);

    // Parsear la respuesta JSON de Gemini
    let parsedResponse;
    try {
      // Limpiar el texto por si viene con markdown ```json
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('⚠️ Error parseando JSON, usando respuesta como texto:', parseError);
      return {
        response: responseText || '¿Podrías contarme más sobre tus síntomas?',
        hasRecommendation: false,
        needsMoreInfo: true,
      };
    }

    // Si Gemini recomienda una especialidad
    if (parsedResponse.recommendation) {
      console.log('🎯 Especialidad:', parsedResponse.specialty);

      return {
        response: parsedResponse.message || '',
        specialty: parsedResponse.specialty,
        symptomsSummary: parsedResponse.symptoms_summary,
        urgencyLevel: parsedResponse.urgency_level,
        hasRecommendation: true,
        needsMoreInfo: false,
      };
    }

    // Solo conversación, sin recomendación
    return {
      response: parsedResponse.message || '¿Podrías contarme más sobre tus síntomas?',
      hasRecommendation: false,
      needsMoreInfo: true,
    };

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Fallback simple
    return {
      response: 'Disculpa, tuve un problema. ¿Podrías contarme tus síntomas de nuevo?',
      hasRecommendation: false,
      needsMoreInfo: true,
      error: error.message,
    };
  }
}

export default {
  analyzeMessageWithAI,
};
