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
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import botService from '../services/botService';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';

export default function ChatbotScreen({ navigation }) {
  const { colors, darkMode } = useTheme();
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text:
        '¡Hola! 👋 Soy MediBot, tu asistente de salud.\n\nContame cómo te sentís o qué molestia tenés, y te ayudo a encontrar el médico adecuado cerca de vos.\n\n¿En qué te puedo ayudar hoy?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [currentStep, setCurrentStep] = useState('initial');
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState({
    symptoms: '',
    specialtyKey: '',
    specialtyName: '',
    specialtyLabel: '',
    searchKeywords: [],  // Keywords para búsqueda
    doctor: null,
    date: '',
    time: '',
  });
  const scrollViewRef = useRef(null);
  const currentUser = auth.currentUser;
  const [patientLocation, setPatientLocation] = useState(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Cargar ubicación del paciente desde Firestore
  useEffect(() => {
    const loadUserLocation = async () => {
      try {
        if (!currentUser?.uid) return;
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return;

        const data = snap.data();
        if (
          data?.location?.latitude != null &&
          data?.location?.longitude != null
        ) {
          setPatientLocation({
            latitude: data.location.latitude,
            longitude: data.location.longitude,
          });
        }
      } catch (e) {
        // Error silencioso
      }
    };

    loadUserLocation();
  }, [currentUser?.uid]);

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

  const clearChat = () => {
    setMessages([
      {
        type: 'bot',
        text:
          '¡Hola! 👋 Soy MediBot, tu asistente de salud.\n\nContame cómo te sentís o qué molestia tenés, y te ayudo a encontrar el médico adecuado cerca de vos.\n\n¿En qué te puedo ayudar hoy?',
        timestamp: new Date(),
      },
    ]);
    setCurrentStep('initial');
    setUserData({
      symptoms: '',
      specialtyKey: '',
      specialtyName: '',
      specialtyLabel: '',
      searchKeywords: [],
      doctor: null,
      date: '',
      time: '',
    });
    setInput('');
  };

  // Distancia en km entre dos coordenadas 
  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Obtener médicos por especialidad usando keywords
  const fetchDoctorsBySpecialty = async (searchKeywords, userLocation) => {
    try {
      const base = collection(db, 'users');
      const q = query(base, where('role', '==', 'doctor'));
      const snap = await getDocs(q);

      // Si no hay keywords, devolver array vacío
      if (!searchKeywords || (Array.isArray(searchKeywords) && searchKeywords.length === 0)) {
        return [];
      }

      // Convertir a array si es string
      const keywords = Array.isArray(searchKeywords) ? searchKeywords : [searchKeywords];

      let items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => {
          // Filtrar solo doctores verificados
          if (!u?.verified) {
            return false;
          }

          const csspProf = (u?.cssp?.profession || '').toLowerCase();
          const specialty = (u?.specialty || '').toLowerCase();
          const arr = Array.isArray(u?.specialties) ? u.specialties.map(s => (s || '').toLowerCase()) : [];

          // Verificar si ALGUNA keyword matchea con ALGÚN campo del doctor
          const hasMatch = keywords.some(keyword => {
            const kw = keyword.toLowerCase();
            return csspProf.includes(kw) ||
                   specialty.includes(kw) ||
                   arr.some(s => s.includes(kw));
          });

          return hasMatch;
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

          let distanceKm = null;
          if (
            userLocation &&
            u?.location?.latitude != null &&
            u?.location?.longitude != null
          ) {
            distanceKm = getDistanceKm(
              userLocation.latitude,
              userLocation.longitude,
              u.location.latitude,
              u.location.longitude
            );
          }

          return {
            id: u.uid || u.id,
            name,
            specialties,
            rating,
            distanceKm,
          };
        });

      items = items.sort((a, b) => {
        const da = a.distanceKm ?? Infinity;
        const db = b.distanceKm ?? Infinity;
        return da - db;
      });

      return items.slice(0, 20);
    } catch (e) {
      return [];
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    addMessage(userInput, 'user');
    setInput('');
    setLoading(true);

    try {
      // 1) Verificar si hay una respuesta rápida antes de llamar a OpenAI
      const quickResponse = botService.getQuickResponse(userInput);
      if (quickResponse) {
        setTimeout(() => {
          addMessage(quickResponse);
          setLoading(false);
        }, 800);
        return;
      }

      // 2) Estado INITIAL: analizar síntomas con OpenAI
      if (currentStep === 'initial') {
        try {
          // Pasar historial de conversación para contexto
          const conversationHistory = messages
            .slice(-6) // Últimos 6 mensajes para contexto
            .map(msg => ({
              type: msg.type,
              text: msg.text
            }));

          const recommendation = await botService.analyzeSymptoms(userInput, conversationHistory);

          // Si OpenAI necesita más información
          if (recommendation.needsMoreInfo) {
            setTimeout(() => {
              // Mostrar alerta si es emergencia
              if (recommendation.urgencyLevel === 'emergencia') {
                addMessage(
                  '⚠️ IMPORTANTE: Basándome en lo que me cuentas, te recomiendo ir a emergencias de inmediato. Esta situación puede requerir atención médica urgente.'
                );
              }

              addMessage(recommendation.aiResponse || '¿Podrías contarme un poco más sobre tus síntomas?');
              setLoading(false);
            }, 800);
            return;
          }

          setUserData((prev) => ({
            ...prev,
            symptoms: userInput,
            specialtyKey: recommendation.key,
            specialtyName: recommendation.name,           // amigable
            specialtyLabel: recommendation.conademLabel,  // CONADEM / Firestore
            searchKeywords: recommendation.searchKeywords || [], // Keywords para búsqueda
          }));

          setTimeout(() => {
            // Mostrar respuesta conversacional de OpenAI
            if (recommendation.aiResponse) {
              addMessage(recommendation.aiResponse);
            }

            if (recommendation.hasDoctors) {
              // Si hay doctores disponibles, automáticamente mostrarlos
              setTimeout(async () => {
                const doctors = await fetchDoctorsBySpecialty(
                  recommendation.searchKeywords || [],
                  patientLocation
                );

                if (doctors.length > 0) {
                  const hasLocation = patientLocation?.latitude && patientLocation?.longitude;

                  // Si usamos fallback a medicina general, informar al usuario
                  let introMessage;
                  if (recommendation.fallbackToGeneral) {
                    introMessage = hasLocation
                      ? `No tenemos especialistas específicos registrados, pero un médico general puede evaluarte y referirte si es necesario. Aquí están los más cercanos:`
                      : `No tenemos especialistas específicos registrados, pero un médico general puede evaluarte y referirte si es necesario:`;
                  } else {
                    introMessage = hasLocation
                      ? `Aquí están los profesionales disponibles, ordenados por cercanía:`
                      : `Aquí están los profesionales disponibles:`;
                  }

                  addMessage(introMessage, 'bot', { type: 'doctors', doctors });
                  setCurrentStep('listing');
                } else {
                  addMessage(
                    `Hmm, no encontré médicos disponibles en este momento. ¿Querés que busquemos otra especialidad o puedo ayudarte con algo más?`
                  );
                  setCurrentStep('initial');
                }
                setLoading(false);
              }, recommendation.aiResponse ? 1200 : 800);
            } else {
              // No hay doctores para esta especialidad (esto ya no debería pasar con el fallback)
              setTimeout(() => {
                addMessage(
                  `No encontré especialistas disponibles, pero podés buscar en el directorio de médicos desde el inicio. ¿Hay algo más en lo que te pueda ayudar?`
                );
                setCurrentStep('initial');
              }, recommendation.aiResponse ? 1000 : 800);
            }
            setLoading(false);
          }, 800);
        } catch (error) {
          setTimeout(() => {
            addMessage(
              'Disculpa, tuve un problema procesando tu mensaje. ¿Podrías describir tu consulta de otra manera?'
            );
            setLoading(false);
          }, 800);
        }
        return;
      }

      // 3) Estado SHOW-DOCTORS
      if (currentStep === 'show-doctors') {
        const lowerInput = userInput.toLowerCase();

        if (
          lowerInput.includes('sí') ||
          lowerInput.includes('si') ||
          lowerInput.includes('ok') ||
          lowerInput.includes('dale') ||
          lowerInput.includes('claro') ||
          lowerInput.includes('ver') ||
          lowerInput.includes('muestra')
        ) {
          const doctors = await fetchDoctorsBySpecialty(
            userData.searchKeywords,
            patientLocation
          );

          setTimeout(async () => {
            if (doctors.length > 0) {
              const hasLocation = patientLocation?.latitude && patientLocation?.longitude;

              // Mensaje de introducción a la lista
              const message = hasLocation
                ? `Aquí están los profesionales disponibles, ordenados por cercanía:`
                : `Aquí están los profesionales disponibles:`;

              addMessage(message, 'bot', { type: 'doctors', doctors });
              setCurrentStep('listing');
            } else {
              addMessage(
                `Lo siento, no encontré especialistas en ${userData.specialtyName} registrados en este momento. ¿Te gustaría buscar otra especialidad?`
              );
              setCurrentStep('change-specialty');
            }
            setLoading(false);
          }, 800);
        } else {
          setTimeout(() => {
            addMessage(
              'Claro, dime qué especialidad necesitas o descríbeme tus síntomas para recomendarte el profesional adecuado.'
            );
            setCurrentStep('change-specialty');
            setLoading(false);
          }, 800);
        }
        return;
      }

      // 4) Estado CHANGE-SPECIALTY
      if (currentStep === 'change-specialty') {
        try {
          const conversationHistory = messages.slice(-6).map(msg => ({
            type: msg.type,
            text: msg.text
          }));

          const recommendation = await botService.analyzeSymptoms(userInput, conversationHistory);

          // Si OpenAI necesita más info
          if (recommendation.needsMoreInfo) {
            setTimeout(() => {
              addMessage(recommendation.aiResponse || '¿Podrías darme más detalles?');
              setLoading(false);
            }, 800);
            return;
          }

          setUserData((prev) => ({
            ...prev,
            specialtyKey: recommendation.key,
            specialtyName: recommendation.name,
            specialtyLabel: recommendation.conademLabel,
            searchKeywords: recommendation.searchKeywords || [],
          }));

          const doctors = await fetchDoctorsBySpecialty(
            recommendation.searchKeywords || [],
            patientLocation
          );

          setTimeout(async () => {
            if (doctors.length > 0) {
              const hasLocation = patientLocation?.latitude && patientLocation?.longitude;

              // Mostrar respuesta de IA primero si existe
              if (recommendation.aiResponse) {
                addMessage(recommendation.aiResponse);
                await new Promise(resolve => setTimeout(resolve, 800));
              }

              // Mensaje según si es fallback o no
              let introMessage;
              if (recommendation.fallbackToGeneral) {
                introMessage = hasLocation
                  ? `No tenemos esa especialidad específica, pero un médico general puede ayudarte. Aquí están los más cercanos:`
                  : `No tenemos esa especialidad específica, pero un médico general puede ayudarte:`;
              } else {
                introMessage = hasLocation
                  ? `Aquí están los profesionales disponibles, ordenados por cercanía:`
                  : `Aquí están los profesionales disponibles:`;
              }

              addMessage(introMessage, 'bot', { type: 'doctors', doctors });
              setCurrentStep('listing');
            } else {
              addMessage(
                `No encontré médicos disponibles para eso. ¿Querés buscar algo diferente?`
              );
            }
            setLoading(false);
          }, 800);
        } catch (error) {
          setTimeout(() => {
            addMessage(
              'No pude procesar tu solicitud. ¿Podrías ser más específico sobre qué especialidad necesitas?'
            );
            setLoading(false);
          }, 800);
        }
        return;
      }

      // 5) Estado LISTING (permite cambiar especialidad de nuevo)
      if (currentStep === 'listing') {
        try {
          const conversationHistory = messages.slice(-6).map(msg => ({
            type: msg.type,
            text: msg.text
          }));

          const recommendation = await botService.analyzeSymptoms(userInput, conversationHistory);

          if (recommendation.needsMoreInfo) {
            setTimeout(() => {
              addMessage(recommendation.aiResponse || '¿Qué más puedo ayudarte?');
              setLoading(false);
            }, 800);
            return;
          }

          setUserData((prev) => ({
            ...prev,
            specialtyKey: recommendation.key,
            specialtyName: recommendation.name,
            specialtyLabel: recommendation.conademLabel,
            searchKeywords: recommendation.searchKeywords || [],
          }));

          const doctors = await fetchDoctorsBySpecialty(
            recommendation.searchKeywords || [],
            patientLocation
          );

          setTimeout(async () => {
            if (doctors.length > 0) {
              const hasLocation = patientLocation?.latitude && patientLocation?.longitude;

              if (recommendation.aiResponse) {
                addMessage(recommendation.aiResponse);
                await new Promise(resolve => setTimeout(resolve, 800));
              }

              // Mensaje según si es fallback o no
              let introMessage;
              if (recommendation.fallbackToGeneral) {
                introMessage = hasLocation
                  ? `No tenemos esa especialidad, pero un médico general puede evaluarte. Aquí están los más cercanos:`
                  : `No tenemos esa especialidad, pero un médico general puede evaluarte:`;
              } else {
                introMessage = hasLocation
                  ? `Aquí están los profesionales disponibles, ordenados por cercanía:`
                  : `Aquí están los profesionales disponibles:`;
              }

              addMessage(introMessage, 'bot', { type: 'doctors', doctors });
            } else {
              addMessage(
                `No encontré médicos disponibles. ¿Querés buscar otra especialidad?`
              );
              setCurrentStep('change-specialty');
            }
            setLoading(false);
          }, 800);
        } catch (error) {
          setTimeout(() => {
            addMessage('¿Necesitas ver otra especialidad? Descríbeme lo que buscas.');
            setLoading(false);
          }, 800);
        }
        return;
      }

      // Fallback
      setTimeout(() => {
        addMessage('¿En qué más puedo ayudarte? Cuéntame qué especialidad necesitas.');
        setCurrentStep('initial');
        setLoading(false);
      }, 600);
    } catch (error) {
      setTimeout(() => {
        addMessage('Lo siento, hubo un error. Por favor intenta de nuevo.');
        setLoading(false);
      }, 800);
    }
  };

  // ====== LISTADO DE DOCTORES ======
  const dynamicStyles = {
    container: {
      ...styles.container,
      backgroundColor: colors.background,
    },
    header: {
      ...styles.header,
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.headerBorder,
    },
    headerTitle: {
      ...styles.headerTitle,
      color: colors.headerText,
    },
    headerSubtitle: {
      ...styles.headerSubtitle,
      color: colors.headerText,
    },
    messagesContainer: {
      ...styles.messagesContainer,
    },
    botMessage: {
      ...styles.botMessage,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    messageText: {
      ...styles.messageText,
      color: colors.text,
    },
    messageTextBold: {
      ...styles.messageTextBold,
      color: colors.text,
    },
    loadingContainer: {
      ...styles.loadingContainer,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    loadingText: {
      ...styles.loadingText,
      color: colors.textSecondary,
    },
    doctorCard: {
      ...styles.doctorCard,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    doctorName: {
      ...styles.doctorName,
      color: colors.text,
    },
    doctorExperience: {
      ...styles.doctorExperience,
      color: colors.textSecondary,
    },
    doctorDistance: {
      ...styles.doctorDistance,
      color: colors.textSecondary,
    },
    dateButton: {
      ...styles.dateButton,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    dateDay: {
      ...styles.dateDay,
      color: colors.text,
    },
    dateNumber: {
      ...styles.dateNumber,
      color: colors.textSecondary,
    },
    timeButton: {
      ...styles.timeButton,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    confirmationLabel: {
      ...styles.confirmationLabel,
      color: colors.textSecondary,
    },
    confirmationValue: {
      ...styles.confirmationValue,
      color: colors.text,
    },
    confirmationSpecialty: {
      ...styles.confirmationSpecialty,
      color: colors.textSecondary,
    },
    confirmationNoteText: {
      ...styles.confirmationNoteText,
      color: colors.textSecondary,
    },
    inputContainer: {
      ...styles.inputContainer,
      backgroundColor: colors.card,
      borderTopColor: colors.border,
    },
    input: {
      ...styles.input,
      backgroundColor: colors.inputBackground,
      color: colors.inputText,
    },
  };

  const renderDoctors = (doctors) => (
    <View style={styles.optionsContainer}>
      {doctors.map((doctor) => (
        <View key={doctor.id} style={dynamicStyles.doctorCard}>
          {/* Información del doctor */}
          <View style={styles.doctorIconContainer}>
            <Ionicons name="person" size={24} color="#3B82F6" />
          </View>
          <View style={styles.doctorInfo}>
            <Text style={dynamicStyles.doctorName}>{doctor.name}</Text>
            <Text style={dynamicStyles.doctorExperience}>
              {(doctor.specialties && doctor.specialties.join(' · ')) ||
                'Especialidad no especificada'}
            </Text>
            {doctor.distanceKm != null && (
              <Text style={dynamicStyles.doctorDistance}>
                📍 {doctor.distanceKm.toFixed(1)} km de distancia
              </Text>
            )}
            {doctor.rating != null && (
              <Text style={styles.doctorRating}>
                ⭐ {Number(doctor.rating).toFixed(1)}
              </Text>
            )}

            {/* Botón de acción */}
            <TouchableOpacity
              style={styles.scheduleButton}
              onPress={() => goToDoctorDetail(doctor.id)}
              disabled={loading}
            >
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={styles.scheduleButtonText}>Agendar Cita</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  const renderCalendar = () => {
    const dates = botService.getAvailableDates(7);
    return (
      <View style={styles.calendarContainer}>
        {dates.map((dateInfo, idx) => (
          <TouchableOpacity
            key={idx}
            style={dynamicStyles.dateButton}
            onPress={() => {}}
            disabled={loading}
          >
            <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
            <Text style={dynamicStyles.dateDay}>{dateInfo.displayDate.split(',')[0]}</Text>
            <Text style={dynamicStyles.dateNumber}>{dateInfo.displayDate.split(',')[1]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderTimes = (times) => (
    <View style={styles.timesContainer}>
      {times.map((time, idx) => (
        <TouchableOpacity
          key={idx}
          style={dynamicStyles.timeButton}
          onPress={() => {}}
          disabled={loading}
        >
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
          <Text style={dynamicStyles.confirmationLabel}>Doctor</Text>
          <Text style={dynamicStyles.confirmationValue}>{appointment.doctor.name}</Text>
          <Text style={dynamicStyles.confirmationSpecialty}>{appointment.specialty}</Text>
        </View>
      </View>

      <View style={styles.confirmationRow}>
        <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
        <View style={styles.confirmationInfo}>
          <Text style={dynamicStyles.confirmationLabel}>Fecha</Text>
          <Text style={dynamicStyles.confirmationValue}>{appointment.date}</Text>
        </View>
      </View>

      <View style={styles.confirmationRow}>
        <Ionicons name="time-outline" size={20} color="#3B82F6" />
        <View style={styles.confirmationInfo}>
          <Text style={dynamicStyles.confirmationLabel}>Horario</Text>
          <Text style={dynamicStyles.confirmationValue}>{appointment.time}</Text>
        </View>
      </View>

      <View style={styles.confirmationNote}>
        <Text style={dynamicStyles.confirmationNoteText}>
          Recibirás una notificación de confirmación. Te esperamos el día de tu cita.
        </Text>
      </View>
    </View>
  );

  const renderMessageContent = (message) => {
    if (!message.data) {
      return <Text style={dynamicStyles.messageText}>{message.text}</Text>;
    }

    switch (message.data.type) {
      case 'doctors':
        return (
          <View>
            <Text style={dynamicStyles.messageText}>{message.text}</Text>
            {renderDoctors(message.data.doctors)}
          </View>
        );
      case 'calendar':
        return (
          <View>
            <Text style={dynamicStyles.messageText}>{message.text}</Text>
            {renderCalendar()}
          </View>
        );
      case 'times':
        return (
          <View>
            <Text style={dynamicStyles.messageText}>{message.text}</Text>
            {renderTimes(message.data.times)}
          </View>
        );
      case 'confirmation':
        return (
          <View>
            <Text style={dynamicStyles.messageTextBold}>{message.text}</Text>
            {renderConfirmation(message.data.appointment)}
          </View>
        );
      default:
        return <Text style={dynamicStyles.messageText}>{message.text}</Text>;
    }
  };

  return (
    <View style={dynamicStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.header}
        translucent={false}
      />
      <KeyboardAvoidingView
        style={dynamicStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={dynamicStyles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="chatbubbles" size={24} color={colors.headerIcon} />
          </View>
          <View style={styles.headerContent}>
            <Text style={dynamicStyles.headerTitle}>Asistente Médico</Text>
            <Text style={dynamicStyles.headerSubtitle}>Agenda tu cita fácilmente</Text>
          </View>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearChat}
            disabled={loading}
          >
            <Ionicons name="refresh" size={24} color={colors.headerIcon} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={dynamicStyles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((message, idx) => (
            <View
              key={idx}
              style={[
                styles.messageWrapper,
                message.type === 'user'
                  ? styles.userMessageWrapper
                  : styles.botMessageWrapper,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  message.type === 'user'
                    ? styles.userMessage
                    : dynamicStyles.botMessage,
                ]}
              >
                {renderMessageContent(message)}
              </View>
            </View>
          ))}

          {loading && (
            <View style={dynamicStyles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={dynamicStyles.loadingText}>Escribiendo...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={dynamicStyles.inputContainer}>
          <TextInput
            style={dynamicStyles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe tu mensaje..."
            placeholderTextColor={colors.placeholder}
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
    </View>
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
    paddingTop: 40,
    paddingBottom: 16,
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
  headerContent: {
    flex: 1,
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
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
  doctorDistance: { fontSize: 12, color: '#4B5563', marginTop: 2 },
  doctorRating: { fontSize: 13, color: '#FBC02D', marginTop: 2 },

  // Botón de agendar cita
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scheduleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

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
