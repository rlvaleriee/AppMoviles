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

export default function TermsScreen({ navigation }) {
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
    heading: {
      ...styles.heading,
      color: colors.text,
    },
    paragraph: {
      ...styles.paragraph,
      color: colors.textSecondary,
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
        <Text style={dynamicStyles.headerTitle}>Términos de uso</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.lastUpdated}>Última actualización: Noviembre 2025</Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>1. Aceptación de los Términos</Text>
            {'\n\n'}
            Al registrarte y utilizar esta aplicación, aceptas cumplir con estos términos y condiciones de uso. Si no estás de acuerdo con estos términos, no debes usar la aplicación.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>2. Uso de la Aplicación</Text>
            {'\n\n'}
            Esta aplicación está diseñada para facilitar la comunicación entre pacientes y profesionales de la salud. El uso de la aplicación debe ser exclusivamente para fines médicos y de salud legítimos.
            {'\n\n'}
            Los usuarios se comprometen a:
            {'\n'}• Utilizar la aplicación de manera responsable y ética
            {'\n'}• No realizar actividades fraudulentas o ilegales
            {'\n'}• No interferir con el funcionamiento de la aplicación
            {'\n'}• No intentar acceder a cuentas de otros usuarios
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>3. Registro y Cuenta de Usuario</Text>
            {'\n\n'}
            Para usar ciertas funciones de la aplicación, debes crear una cuenta. Te comprometes a:
            {'\n'}• Proporcionar información precisa, actual y completa
            {'\n'}• Mantener la seguridad de tu contraseña
            {'\n'}• Notificar inmediatamente cualquier uso no autorizado de tu cuenta
            {'\n'}• Ser responsable de todas las actividades que ocurran bajo tu cuenta
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>4. Verificación de Profesionales de la Salud</Text>
            {'\n\n'}
            Los médicos y profesionales de la salud deben registrarse con su información de Junta de Vigilancia (CSSP). Todas las cuentas de profesionales serán verificadas antes de ser activadas.
            {'\n\n'}
            Los profesionales se comprometen a:
            {'\n'}• Proporcionar credenciales válidas y verificables
            {'\n'}• Mantener actualizada su información profesional
            {'\n'}• Cumplir con los códigos de ética de su profesión
            {'\n'}• Proporcionar atención de calidad dentro del marco legal
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>5. Privacidad y Protección de Datos</Text>
            {'\n\n'}
            • Tus datos personales serán tratados de manera confidencial
            {'\n'}• La información médica compartida está protegida según las leyes de privacidad vigentes
            {'\n'}• No compartiremos tu información personal con terceros sin tu consentimiento
            {'\n'}• Para más detalles, consulta nuestra Política de Privacidad
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>6. Responsabilidades del Usuario</Text>
            {'\n\n'}
            Los usuarios son responsables de:
            {'\n'}• La veracidad de la información proporcionada
            {'\n'}• El uso adecuado de la aplicación
            {'\n'}• La confidencialidad de su cuenta
            {'\n'}• Respetar a otros usuarios y profesionales
            {'\n'}• Cumplir con las leyes y regulaciones aplicables
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>7. Citas y Consultas</Text>
            {'\n\n'}
            • Las citas programadas a través de la aplicación son compromisos formales
            {'\n'}• Los pacientes deben notificar con anticipación cualquier cancelación
            {'\n'}• Los profesionales deben respetar los horarios acordados
            {'\n'}• La aplicación facilita la comunicación pero no sustituye la atención médica presencial cuando sea necesaria
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>8. Limitación de Responsabilidad</Text>
            {'\n\n'}
            La aplicación es una herramienta de facilitación y no sustituye la atención médica profesional. Los usuarios son responsables de sus decisiones médicas.
            {'\n\n'}
            No nos hacemos responsables de:
            {'\n'}• Errores u omisiones en el contenido proporcionado por los usuarios
            {'\n'}• Pérdida de datos debido a problemas técnicos
            {'\n'}• Daños indirectos, incidentales o consecuentes
            {'\n'}• Decisiones médicas tomadas basándose en la información de la aplicación
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>9. Contenido Prohibido</Text>
            {'\n\n'}
            Está prohibido publicar o compartir:
            {'\n'}• Contenido ilegal, ofensivo o inapropiado
            {'\n'}• Información falsa o engañosa
            {'\n'}• Material protegido por derechos de autor sin autorización
            {'\n'}• Información que viole la privacidad de terceros
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>10. Suspensión y Terminación</Text>
            {'\n\n'}
            Nos reservamos el derecho de suspender o terminar tu cuenta si:
            {'\n'}• Violas estos términos de uso
            {'\n'}• Proporcionas información falsa o fraudulenta
            {'\n'}• Realizas actividades que dañen la aplicación o a otros usuarios
            {'\n'}• No cumples con las leyes aplicables
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>11. Propiedad Intelectual</Text>
            {'\n\n'}
            Todos los derechos de propiedad intelectual de la aplicación, incluyendo el diseño, código, gráficos y contenido original, son propiedad exclusiva de los desarrolladores de la aplicación.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>12. Modificaciones de los Términos</Text>
            {'\n\n'}
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados a través de la aplicación y entrarán en vigencia inmediatamente después de su publicación.
            {'\n\n'}
            El uso continuado de la aplicación después de las modificaciones constituye la aceptación de los nuevos términos.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>13. Ley Aplicable</Text>
            {'\n\n'}
            Estos términos se rigen por las leyes de El Salvador. Cualquier disputa será resuelta en los tribunales competentes de El Salvador.
          </Text>

          <Text style={dynamicStyles.paragraph}>
            <Text style={dynamicStyles.heading}>14. Contacto</Text>
            {'\n\n'}
            Para consultas, inquietudes o sugerencias sobre estos términos, puedes contactarnos a través de:
            {'\n'}• La sección de ayuda en la aplicación
            {'\n'}• Correo electrónico: svmediconnect@outlook.com
            {'\n\n'}
            Al usar esta aplicación, reconoces que has leído, entendido y aceptado estos términos y condiciones en su totalidad.
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
    marginBottom: 24,
    textAlign: 'center',
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  paragraph: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 20,
  },
});
