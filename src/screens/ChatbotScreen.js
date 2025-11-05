import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import botService from '../services/botService';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function ChatbotScreen({ navigation }) {
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text:
        '¡Hola! Soy tu asistente médico virtual. ¿En qué puedo ayudarte hoy? Puedes contarme tus síntomas o qué tipo de consulta necesitas.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [currentStep, setCurrentStep] = useState('initial');
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState({
    symptoms: '',
    specialty: '',
    specialtyName: '',
    doctor: null,
    date: '',
    time: '',
  });
  const scrollViewRef = useRef(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const addMessage = (text, type = 'bot', data = null) => {
    setMessages((prev) => [
      ...prev,
      {
        type,
        text,
        data,
        timestamp: new Date(),
      },
    ]);
  };

  const goToDoctorDetail = (doctorId) => {
    navigation.navigate('Home', {
      screen: 'DoctorDetail',
      params: { doctorId },
    });
  };

  // === Obtener médicos desde Firestore por especialidad (nombre legible) ===
  const fetchDoctorsBySpecialty = async (specialtyName) => {
    try {
      const base = collection(db, 'users');
      const q = query(base, where('role', '==', 'doctor'));
      const snap = await getDocs(q);

      const term = (specialtyName || '').toLowerCase().trim();

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => {
          const csspProf = u?.cssp?.profession || '';
          const specialty = u?.specialty || '';
          const arr = Array.isArray(u?.specialties) ? u.specialties : [];

          const hitCSSP = (csspProf || '').toLowerCase().includes(term);
          const hitSpecialty = (specialty || '').toLowerCase().includes(term);
          const hitArr = arr.some((s) => (s || '').toLowerCase().includes(term));
          return hitCSSP || hitSpecialty || hitArr;
        })
        .map((u) => {
          const name =
            u?.name && u?.lastName
              ? `${u.name} ${u.lastName}`
              : u?.name || u?.displayName || 'Médico/a';
          const specialties =
            (Array.isArray(u?.specialties) && u.specialties.length > 0
              ? u.specialties
              : u?.cssp?.profession
              ? [u.cssp.profession]
              : u?.specialty
              ? [u.specialty]
              : []) || [];
          const rating = u?.ratingAvg ?? u?.rating ?? null;

          return {
            id: u.uid || u.id, // usa este id en DoctorDetail
            name,
            specialties,
            rating,
          };
        });

      return items.slice(0, 20);
    } catch (e) {
      console.log('fetchDoctorsBySpecialty error:', e?.message);
      return [];
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userInput = input;
    addMessage(userInput, 'user');
    setInput('');
    setLoading(true);

    try {
      // Respuestas rápidas
      const quickResponse = botService.getQuickResponse(userInput);
      if (quickResponse && currentStep === 'initial') {
        setTimeout(() => {
          addMessage(quickResponse);
          setLoading(false);
        }, 800);
        return;
      }

      if (currentStep === 'initial') {
        // Analizar síntomas -> especialidad sugerida
        const recommendation = botService.analyzeSymptoms(userInput);
        setUserData((prev) => ({
          ...prev,
          symptoms: userInput,
          specialty: recommendation.key,
          specialtyName: recommendation.name,
        }));

        setTimeout(() => {
          addMessage(
            `Entiendo. Basándome en lo que me cuentas, te recomiendo consultar con ${recommendation.name}. ¿Te gustaría ver nuestros especialistas disponibles?`
          );
          setCurrentStep('show-doctors');
          setLoading(false);
        }, 800);
      } else if (currentStep === 'show-doctors') {
        const lowerInput = userInput.toLowerCase();

        if (
          lowerInput.includes('sí') ||
          lowerInput.includes('si') ||
          lowerInput.includes('ok') ||
          lowerInput.includes('dale') ||
          lowerInput.includes('claro')
        ) {
          // Obtener doctores desde Firestore
          const doctors = await fetchDoctorsBySpecialty(userData.specialtyName);

          setTimeout(() => {
            if (doctors.length > 0) {
              addMessage('Estos son nuestros especialistas disponibles:', 'bot', {
                type: 'doctors',
                doctors,
              });
              setCurrentStep('listing');
            } else {
              addMessage(
                'Lo siento, no hay especialistas disponibles en este momento. ¿Te gustaría probar con otra especialidad?'
              );
              setCurrentStep('change-specialty');
            }
            setLoading(false);
          }, 800);
        } else {
          setTimeout(() => {
            addMessage(
              '¿Qué especialidad prefieres? Puedo mostrarte: Medicina General, Cardiología, Dermatología, Pediatría, Traumatología, o Ginecología.'
            );
            setCurrentStep('change-specialty');
            setLoading(false);
          }, 800);
        }
      } else if (currentStep === 'change-specialty') {
        const recommendation = botService.analyzeSymptoms(userInput);
        setUserData((prev) => ({
          ...prev,
          specialty: recommendation.key,
          specialtyName: recommendation.name,
        }));

        const doctors = await fetchDoctorsBySpecialty(recommendation.name);

        setTimeout(() => {
          if (doctors.length > 0) {
            addMessage(
              `Perfecto, aquí están nuestros especialistas en ${recommendation.name}:`,
              'bot',
              { type: 'doctors', doctors }
            );
            setCurrentStep('listing');
          } else {
            addMessage(
              `No encontré especialistas en ${recommendation.name} por ahora. ¿Quieres intentar con otra especialidad?`
            );
            setCurrentStep('change-specialty');
          }
          setLoading(false);
        }, 800);
      } else {
        // Cualquier otro estado: respuesta por defecto
        setTimeout(() => {
          addMessage('Cuéntame qué especialidad necesitas y te muestro los doctores disponibles.');
          setLoading(false);
        }, 600);
      }
    } catch (error) {
      console.error('Error:', error);
      addMessage('Lo siento, hubo un error. Por favor intenta de nuevo.');
      setLoading(false);
    }
  };

  // ====== LISTADO DE DOCTORES (tap -> abre DoctorDetail dentro de HomeStack) ======
  const renderDoctors = (doctors) => (
    <View style={styles.optionsContainer}>
      {doctors.map((doctor) => (
        <TouchableOpacity
          key={doctor.id}
          style={styles.doctorCard}
          onPress={() => goToDoctorDetail(doctor.id)}
          disabled={loading}
        >
          <View style={styles.doctorIconContainer}>
            <Ionicons name="person" size={24} color="#3B82F6" />
          </View>
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>{doctor.name}</Text>
            <Text style={styles.doctorExperience}>
              {(doctor.specialties && doctor.specialties.join(' · ')) || 'Especialidad no especificada'}
            </Text>
            {doctor.rating != null && (
              <Text style={styles.doctorRating}>⭐ {Number(doctor.rating).toFixed(1)}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
        </TouchableOpacity>
      ))}
    </View>
  );

  // (Placeholders conservados)
  const renderCalendar = () => {
    const dates = botService.getAvailableDates(7);
    return (
      <View style={styles.calendarContainer}>
        {dates.map((dateInfo, idx) => (
          <TouchableOpacity key={idx} style={styles.dateButton} onPress={() => {}} disabled={loading}>
            <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
            <Text style={styles.dateDay}>{dateInfo.displayDate.split(',')[0]}</Text>
            <Text style={styles.dateNumber}>{dateInfo.displayDate.split(',')[1]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderTimes = (times) => (
    <View style={styles.timesContainer}>
      {times.map((time, idx) => (
        <TouchableOpacity key={idx} style={styles.timeButton} onPress={() => {}} disabled={loading}>
          <Ionicons name="time-outline" size={20} color="#3B82F6" />
          <Text style={styles.timeText}>{time}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderConfirmation = (appointment) => (
    <View style={styles.confirmationCard}>
      <Text style={styles.confirmationTitle}>Resumen de tu cita</Text>

      <View style={styles.confirmationRow}>
        <Ionicons name="person-outline" size={20} color="#3B82F6" />
        <View style={styles.confirmationInfo}>
          <Text style={styles.confirmationLabel}>Doctor</Text>
          <Text style={styles.confirmationValue}>{appointment.doctor.name}</Text>
          <Text style={styles.confirmationSpecialty}>{appointment.specialty}</Text>
        </View>
      </View>

      <View style={styles.confirmationRow}>
        <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
        <View style={styles.confirmationInfo}>
          <Text style={styles.confirmationLabel}>Fecha</Text>
          <Text style={styles.confirmationValue}>{appointment.date}</Text>
        </View>
      </View>

      <View style={styles.confirmationRow}>
        <Ionicons name="time-outline" size={20} color="#3B82F6" />
        <View style={styles.confirmationInfo}>
          <Text style={styles.confirmationLabel}>Horario</Text>
          <Text style={styles.confirmationValue}>{appointment.time}</Text>
        </View>
      </View>

      <View style={styles.confirmationNote}>
        <Text style={styles.confirmationNoteText}>
          Recibirás una notificación de confirmación. Te esperamos el día de tu cita.
        </Text>
      </View>
    </View>
  );

  const renderMessageContent = (message) => {
    if (!message.data) {
      return <Text style={styles.messageText}>{message.text}</Text>;
    }

    switch (message.data.type) {
      case 'doctors':
        return (
          <View>
            <Text style={styles.messageText}>{message.text}</Text>
            {renderDoctors(message.data.doctors)}
          </View>
        );
      case 'calendar':
        return (
          <View>
            <Text style={styles.messageText}>{message.text}</Text>
            {renderCalendar()}
          </View>
        );
      case 'times':
        return (
          <View>
            <Text style={styles.messageText}>{message.text}</Text>
            {renderTimes(message.data.times)}
          </View>
        );
      case 'confirmation':
        return (
          <View>
            <Text style={styles.messageTextBold}>{message.text}</Text>
            {renderConfirmation(message.data.appointment)}
          </View>
        );
      default:
        return <Text style={styles.messageText}>{message.text}</Text>;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="chatbubbles" size={24} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Asistente Médico</Text>
            <Text style={styles.headerSubtitle}>Agenda tu cita fácilmente</Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((message, idx) => (
            <View
              key={idx}
              style={[
                styles.messageWrapper,
                message.type === 'user' ? styles.userMessageWrapper : styles.botMessageWrapper,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  message.type === 'user' ? styles.userMessage : styles.botMessage,
                ]}
              >
                {renderMessageContent(message)}
              </View>
            </View>
          ))}

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>Escribiendo...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe tu mensaje..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={loading || !input.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===== Contenedor general =====
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // ===== Header =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1976D2',
    elevation: 4,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#64B5F6',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E3F2FD',
  },

  // ===== Mensajes =====
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16 },
  messageWrapper: { marginBottom: 12 },
  userMessageWrapper: { alignItems: 'flex-end' },
  botMessageWrapper: { alignItems: 'flex-start' },

  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  userMessage: { backgroundColor: '#2196F3' },
  botMessage: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  messageText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 20,
  },
  messageTextBold: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 20,
    fontWeight: '700',
  },

  // ===== Loading =====
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'flex-start',
  },
  loadingText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
  },

  // ===== Listado doctores =====
  optionsContainer: { marginTop: 8 },
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  doctorIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorInfo: { flex: 1 },
  doctorName: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  doctorExperience: { fontSize: 13, color: '#666', marginTop: 2 },
  doctorRating: { fontSize: 13, color: '#FBC02D', marginTop: 2 },

  // ===== Fechas/horarios (placeholder) =====
  calendarContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  dateButton: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dateDay: { fontSize: 13, fontWeight: '600', color: '#1F2937', marginTop: 4 },
  dateNumber: { fontSize: 12, color: '#666', marginTop: 2 },
  timesContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  timeButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 80,
  },
  timeText: { fontSize: 14, fontWeight: '600', color: '#2196F3' },

  // ===== Confirmación =====
  confirmationCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  confirmationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmationRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  confirmationInfo: { marginLeft: 12, flex: 1 },
  confirmationLabel: { fontSize: 12, color: '#666' },
  confirmationValue: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginTop: 2 },
  confirmationSpecialty: { fontSize: 12, color: '#666', textTransform: 'capitalize', marginTop: 2 },
  confirmationNote: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  confirmationNoteText: { fontSize: 12, color: '#666', textAlign: 'center' },

  // ===== Input inferior =====
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 8,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
});
