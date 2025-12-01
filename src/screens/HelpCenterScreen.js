import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Linking,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function HelpCenterScreen({ navigation }) {
  const { colors, darkMode } = useTheme();
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = [
    {
      id: 1,
      question: '¿Cómo registro mi cuenta como médico?',
      answer: 'Para registrarte como médico, selecciona "Médico" en la pantalla de registro, completa tus datos personales, información profesional (Junta de Vigilancia y número CSSP), y dirección de tu consultorio. Tu cuenta será verificada por nuestro equipo antes de ser activada.',
      icon: 'person-add',
    },
    {
      id: 2,
      question: '¿Cómo puedo agendar una cita con un médico?',
      answer: 'En la pantalla de inicio, busca el médico que necesitas por especialidad o nombre. Selecciona su perfil, elige una fecha y hora disponible del calendario, y confirma tu cita. Recibirás una notificación cuando el médico acepte tu solicitud.',
      icon: 'calendar',
    },
    {
      id: 3,
      question: '¿Cómo cambio mi contraseña?',
      answer: 'Ve a Configuración > Seguridad. Ingresa tu contraseña actual, luego tu nueva contraseña dos veces para confirmar. Asegúrate de usar una contraseña segura de al menos 8 caracteres.',
      icon: 'lock-closed',
    },
    {
      id: 4,
      question: '¿Por qué no puedo ver doctores verificados?',
      answer: 'Solo los médicos que han sido verificados por nuestro equipo aparecen en las búsquedas. La verificación puede tardar de 24 a 48 horas. Si eres médico y aún no has sido verificado, recibirás una notificación una vez completado el proceso.',
      icon: 'shield-checkmark',
    },
    {
      id: 5,
      question: '¿Cómo cancelo una cita?',
      answer: 'Ve a la sección de Citas, selecciona la cita que deseas cancelar y presiona el botón "Cancelar cita". Es importante cancelar con anticipación para que el médico pueda reorganizar su agenda.',
      icon: 'close-circle',
    },
    {
      id: 6,
      question: '¿Cómo funciona el chatbot de recomendaciones?',
      answer: 'El chatbot te ayuda a encontrar el médico adecuado según tus síntomas y ubicación. Describe tu situación y el chatbot te recomendará especialistas cercanos. Recuerda que es solo una guía y no sustituye un diagnóstico médico profesional.',
      icon: 'chatbubbles',
    },
    {
      id: 7,
      question: '¿Mis datos médicos están seguros?',
      answer: 'Sí, toda tu información está protegida con encriptación de alto nivel y almacenada en servidores seguros de Firebase. Solo compartes información básica con los médicos cuando agendas una cita. Consulta nuestra Política de Privacidad para más detalles.',
      icon: 'shield',
    },
    {
      id: 8,
      question: '¿Cómo actualizo mi perfil?',
      answer: 'Ve a Configuración > Editar perfil. Ahí puedes actualizar tu foto, información de contacto, dirección y otros datos personales. Los médicos también pueden actualizar su información profesional y horarios de atención.',
      icon: 'person-circle',
    },
    {
      id: 9,
      question: '¿Qué hago si un médico no confirma mi cita?',
      answer: 'Si tu cita permanece en estado "Pendiente" por más de 24 horas, puedes cancelarla y buscar otro médico. También puedes contactar directamente al médico por teléfono si es urgente.',
      icon: 'time',
    },
    {
      id: 10,
      question: '¿Cómo reporto un problema técnico?',
      answer: 'Usa el formulario de contacto en esta pantalla para reportar cualquier problema. Describe detalladamente el error y te responderemos a la brevedad. También puedes escribirnos a svmediconnect@outlook.com',
      icon: 'bug',
    },
  ];

  const contactOptions = [
    {
      id: 1,
      title: 'Enviar correo',
      subtitle: 'svmediconnect@outlook.com',
      icon: 'mail',
      color: '#2196F3',
      action: () => Linking.openURL('mailto:svmediconnect@outlook.com'),
    },
    {
      id: 2,
      title: 'Llamar a soporte',
      subtitle: '+503 7748-6619',
      icon: 'call',
      color: '#10B981',
      action: () => Linking.openURL('tel:+50377486619'),
    },
    {
      id: 3,
      title: 'WhatsApp',
      subtitle: 'Chat en vivo',
      icon: 'logo-whatsapp',
      color: '#25D366',
      action: () => Linking.openURL('https://wa.me/50377486619'),
    },
  ];

  const filteredFaqs = faqs.filter((faq) =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFaq = (id) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

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
    welcomeBanner: {
      ...styles.welcomeBanner,
      backgroundColor: colors.card,
    },
    welcomeTitle: {
      ...styles.welcomeTitle,
      color: colors.text,
    },
    welcomeSubtitle: {
      ...styles.welcomeSubtitle,
      color: colors.textSecondary,
    },
    searchBox: {
      ...styles.searchBox,
      backgroundColor: colors.card,
    },
    searchInput: {
      ...styles.searchInput,
      color: colors.inputText,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    sectionSubtitle: {
      ...styles.sectionSubtitle,
      color: colors.textSecondary,
    },
    faqCard: {
      ...styles.faqCard,
      backgroundColor: colors.card,
    },
    faqQuestion: {
      ...styles.faqQuestion,
      color: colors.text,
    },
    faqAnswer: {
      ...styles.faqAnswer,
      color: colors.textSecondary,
      borderTopColor: colors.border,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.textSecondary,
    },
    contactCard: {
      ...styles.contactCard,
      backgroundColor: colors.card,
    },
    contactTitle: {
      ...styles.contactTitle,
      color: colors.text,
    },
    contactSubtitle: {
      ...styles.contactSubtitle,
      color: colors.textSecondary,
    },
    hoursTitle: {
      ...styles.hoursTitle,
      color: colors.text,
    },
    hoursText: {
      ...styles.hoursText,
      color: colors.textSecondary,
    },
    hoursSection: {
      ...styles.hoursSection,
      backgroundColor: darkMode ? '#1E3A5F' : '#F0F9FF',
      borderColor: darkMode ? '#2C5282' : '#BFDBFE',
    },
    hoursIcon: {
      ...styles.hoursIcon,
      backgroundColor: darkMode ? '#2C5282' : '#fff',
    },
  };

  return (
    <View style={dynamicStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.header}
      />
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Centro de ayuda</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner de bienvenida */}
        <View style={dynamicStyles.welcomeBanner}>
          <View style={styles.welcomeIconCircle}>
            <MaterialCommunityIcons name="help-circle" size={40} color="#2196F3" />
          </View>
          <Text style={dynamicStyles.welcomeTitle}>¿En qué podemos ayudarte?</Text>
          <Text style={dynamicStyles.welcomeSubtitle}>
            Encuentra respuestas rápidas a las preguntas más frecuentes o contáctanos directamente
          </Text>
        </View>

        {/* Búsqueda */}
        <View style={styles.searchSection}>
          <View style={dynamicStyles.searchBox}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={dynamicStyles.searchInput}
              placeholder="Buscar en preguntas frecuentes..."
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Preguntas frecuentes */}
        <View style={styles.faqSection}>
          <Text style={dynamicStyles.sectionTitle}>Preguntas frecuentes</Text>
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => (
              <TouchableOpacity
                key={faq.id}
                style={dynamicStyles.faqCard}
                onPress={() => toggleFaq(faq.id)}
                activeOpacity={0.7}
              >
                <View style={styles.faqHeader}>
                  <View style={styles.faqIconContainer}>
                    <Ionicons name={faq.icon} size={20} color="#2196F3" />
                  </View>
                  <Text style={dynamicStyles.faqQuestion}>{faq.question}</Text>
                  <Ionicons
                    name={expandedFaq === faq.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#9CA3AF"
                  />
                </View>
                {expandedFaq === faq.id && (
                  <Text style={dynamicStyles.faqAnswer}>{faq.answer}</Text>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color="#D1D5DB" />
              <Text style={dynamicStyles.emptyText}>
                No se encontraron resultados para "{searchQuery}"
              </Text>
            </View>
          )}
        </View>

        {/* Opciones de contacto */}
        <View style={styles.contactSection}>
          <Text style={dynamicStyles.sectionTitle}>¿Necesitas más ayuda?</Text>
          <Text style={dynamicStyles.sectionSubtitle}>
            Nuestro equipo está disponible para asistirte
          </Text>
          {contactOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={dynamicStyles.contactCard}
              onPress={option.action}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIcon, { backgroundColor: `${option.color}15` }]}>
                <Ionicons name={option.icon} size={24} color={option.color} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={dynamicStyles.contactTitle}>{option.title}</Text>
                <Text style={dynamicStyles.contactSubtitle}>{option.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Horarios de atención */}
        <View style={dynamicStyles.hoursSection}>
          <View style={dynamicStyles.hoursIcon}>
            <Ionicons name="time-outline" size={24} color="#2196F3" />
          </View>
          <View style={styles.hoursInfo}>
            <Text style={dynamicStyles.hoursTitle}>Horario de atención</Text>
            <Text style={dynamicStyles.hoursText}>Lunes a Viernes: 8:00 AM - 6:00 PM</Text>
            <Text style={dynamicStyles.hoursText}>Sábados: 9:00 AM - 2:00 PM</Text>
            <Text style={dynamicStyles.hoursText}>Domingos: Cerrado</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  welcomeBanner: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  searchSection: {
    marginBottom: 24,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
  },
  clearButton: {
    padding: 4,
  },
  faqSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faqIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    lineHeight: 20,
  },
  faqAnswer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
  },
  contactSection: {
    marginBottom: 24,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  hoursSection: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  hoursIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hoursInfo: {
    flex: 1,
  },
  hoursTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  hoursText: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 4,
  },
});
