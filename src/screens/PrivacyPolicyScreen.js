import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function PrivacyPolicyScreen({ navigation }) {
  const { colors } = useTheme();

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
    section: {
      ...styles.section,
      backgroundColor: colors.card,
    },
    lastUpdated: {
      ...styles.lastUpdated,
      color: colors.textSecondary,
    },
    intro: {
      ...styles.intro,
      color: colors.text,
      backgroundColor: colors.card,
    },
    heading: {
      ...styles.heading,
      color: colors.text,
    },
    subheading: {
      ...styles.subheading,
      color: colors.text,
    },
    paragraph: {
      ...styles.paragraph,
      color: colors.textSecondary,
    },
    footer: {
      ...styles.footer,
      color: colors.textSecondary,
      backgroundColor: colors.background,
    },
  };

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Política de privacidad</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.lastUpdated}>Última actualización: Noviembre 2025</Text>

          <Text style={dynamicStyles.intro}>
            En MediConnect, nos comprometemos a proteger tu privacidad y la confidencialidad de tu información personal y médica. Esta política describe cómo recopilamos, usamos, almacenamos y protegemos tus datos.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>1. Información que Recopilamos</Text>
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>1.1 Información de Registro</Text>
            {'\n'}
            Cuando te registras en nuestra aplicación, recopilamos:
            {'\n'}• Nombres
            {'\n'}• Apellidos
            {'\n'}• Correo electrónico
            {'\n'}• Número de teléfono
            {'\n'}• DUI (para pacientes)
            {'\n'}• Dirección
            {'\n'}• Fotografía de perfil (opcional)
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>1.2 Información Profesional (Para Médicos)</Text>
            {'\n'}
            • Junta de Vigilancia (CSSP)
            {'\n'}• Profesión médica
            {'\n'}• Número de registro profesional
            {'\n'}• Dirección del consultorio
            {'\n'}• Especialidades
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>1.3 Información de Ubicación</Text>
            {'\n'}
            Con tu consentimiento, podemos recopilar información de ubicación para:
            {'\n'}• Mostrar tu ubicación en el mapa
            {'\n'}• Ayudar a encontrar profesionales de salud cercanos
            {'\n'}• Facilitar la navegación a consultorios médicos
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>1.4 Información de Uso</Text>
            {'\n'}
            • Historial de citas médicas
            {'\n'}• Comunicaciones dentro de la aplicación
            {'\n'}• Preferencias y configuraciones
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>2. Cómo Usamos tu Información</Text>
            {'\n\n'}
            Utilizamos tu información personal para:
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>2.1 Proporcionar Nuestros Servicios</Text>
            {'\n'}• Crear y mantener tu cuenta
            {'\n'}• Facilitar la comunicación entre pacientes y profesionales
            {'\n'}• Procesar y gestionar citas médicas
            {'\n'}• Enviar notificaciones sobre citas y mensajes
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>2.2 Mejorar Nuestros Servicios</Text>
            {'\n'}• Analizar el uso de la aplicación
            {'\n'}• Identificar y solucionar problemas técnicos
            {'\n'}• Desarrollar nuevas funcionalidades
            {'\n'}• Personalizar tu experiencia
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>2.3 Seguridad y Verificación</Text>
            {'\n'}• Verificar la identidad de profesionales de la salud
            {'\n'}• Prevenir fraudes y abusos
            {'\n'}• Cumplir con requisitos legales
            {'\n'}• Proteger la seguridad de nuestros usuarios
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>3. Compartir tu Información</Text>
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>3.1 Con Profesionales de la Salud</Text>
            {'\n'}
            Cuando agendas una cita, compartimos tu información básica (nombre, teléfono) con el profesional correspondiente para facilitar la atención médica.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>3.2 Con Otros Usuarios</Text>
            {'\n'}
            La información de perfil de los profesionales (nombre, especialidad, ubicación del consultorio) es visible para los pacientes que buscan servicios médicos.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>3.3 No Vendemos tu Información</Text>
            {'\n'}
            Nunca vendemos, alquilamos o compartimos tu información personal con terceros para fines comerciales o publicitarios sin tu consentimiento explícito.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>3.4 Requisitos Legales</Text>
            {'\n'}
            Podemos divulgar tu información si es requerido por ley o en respuesta a procesos legales válidos.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>4. Seguridad de los Datos</Text>
            {'\n\n'}
            Implementamos medidas de seguridad para proteger tu información:
            {'\n\n'}
            • Encriptación de datos en tránsito y en reposo
            {'\n'}• Autenticación segura mediante Firebase Authentication
            {'\n'}• Acceso restringido a información personal
            {'\n'}• Monitoreo continuo de seguridad
            {'\n'}• Copias de seguridad regulares
            {'\n'}• Actualización constante de protocolos de seguridad
            {'\n\n'}
            Sin embargo, ningún sistema es completamente seguro. Te recomendamos mantener la confidencialidad de tu contraseña y notificar cualquier actividad sospechosa.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>5. Almacenamiento de Datos</Text>
            {'\n\n'}
            • Tus datos se almacenan en servidores seguros de Firebase
            {'\n'}• Los datos se almacenan mientras tu cuenta esté activa
            {'\n'}• Puedes solicitar la eliminación de tu cuenta en cualquier momento
            {'\n'}• Algunos datos pueden conservarse por requisitos legales o de auditoría
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>6. Tus Derechos</Text>
            {'\n\n'}
            Tienes derecho a:
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>6.1 Acceso</Text>
            {'\n'}
            Puedes acceder a tu información personal en cualquier momento desde tu perfil.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>6.2 Rectificación</Text>
            {'\n'}
            Puedes actualizar o corregir tu información desde la configuración de perfil.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>6.3 Eliminación</Text>
            {'\n'}
            Puedes solicitar la eliminación de tu cuenta y datos personales.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>6.4 Portabilidad</Text>
            {'\n'}
            Puedes solicitar una copia de tus datos en formato legible.
            {'\n\n'}
            <Text style={dynamicStyles.subheading}>6.5 Objeción</Text>
            {'\n'}
            Puedes objetar ciertos usos de tu información personal.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>7. Información de Menores</Text>
            {'\n\n'}
            Nuestra aplicación no está dirigida a menores de 18 años. No recopilamos intencionalmente información de menores sin el consentimiento de sus padres o tutores legales.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>8. Cambios en esta Política</Text>
            {'\n\n'}
            Podemos actualizar esta política de privacidad periódicamente. Te notificaremos sobre cambios significativos a través de:
            {'\n'}• Notificaciones en la aplicación
            {'\n'}• Correo electrónico
            {'\n'}• Avisos en pantalla
            {'\n\n'}
            El uso continuado de la aplicación después de los cambios constituye la aceptación de la nueva política.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>9. Contacto</Text>
            {'\n\n'}
            Si tienes preguntas, inquietudes o solicitudes sobre esta política de privacidad o el manejo de tus datos personales, puedes contactarnos:
            {'\n\n'}
            • Centro de ayuda en la aplicación
            {'\n'}• Correo electrónico: svmediconnect@outlook.com
            {'\n'}• Sección de seguridad en Configuración
            {'\n\n'}
            Responderemos a tu solicitud en un plazo máximo de 15 días hábiles.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>10. Autoridad de Protección de Datos</Text>
            {'\n\n'}
            Si consideras que tus derechos de privacidad han sido violados, tienes derecho a presentar una queja ante la autoridad de protección de datos competente en El Salvador.
          </Text>

          <Text style={dynamicStyles.footer}>
            Al usar MediConnect, confirmas que has leído y comprendido esta política de privacidad y consientes el procesamiento de tus datos personales de acuerdo con lo establecido.
          </Text>
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
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lastUpdated: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 20,
    textAlign: 'center',
  },
  intro: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
    fontWeight: '500',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  paragraph: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 20,
  },
  footer: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
    borderRadius: 12,
  },
});
