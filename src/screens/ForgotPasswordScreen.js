import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

export default function ForgotPasswordScreen({ navigation }) {
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleResetPassword = async () => {
    // Validaciones
    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Por favor ingresa un correo electrónico válido');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Configuración para que el enlace abra la app
      const actionCodeSettings = {
        url: 'https://app-citas-2c83a.firebaseapp.com/__/auth/action',
        handleCodeInApp: true,
        iOS: {
          bundleId: 'com.rlvaleriee.Appcitas',
        },
        android: {
          packageName: 'com.rlvaleriee.Appcitas',
          installApp: true,
          minimumVersion: '1',
        },
        dynamicLinkDomain: 'app-citas-2c83a.firebaseapp.com',
      };

      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      setEmailSent(true);
    } catch (error) {
      let errorMessage = 'No se pudo enviar el correo de recuperación';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No existe una cuenta con este correo electrónico';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'El correo electrónico no es válido';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Demasiadas solicitudes. Intenta más tarde';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Error de conexión. Verifica tu internet';
      }

      showAlert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Ícono de éxito */}
          <View style={styles.successIconContainer}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={60} color="#fff" />
            </View>
          </View>

          {/* Mensaje de éxito */}
          <Text style={styles.successTitle}>Correo Enviado</Text>
          <Text style={styles.successMessage}>
            Se ha enviado un enlace de recuperación a{'\n'}
            <Text style={styles.emailText}>{email.trim()}</Text>
          </Text>

          {/* Instrucciones */}
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                Revisa tu bandeja de entrada y la carpeta de spam
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                Haz clic en el enlace del correo
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                Crea tu nueva contraseña
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>4</Text>
              </View>
              <Text style={styles.instructionText}>
                Vuelve a la app e inicia sesión
              </Text>
            </View>
          </View>

          {/* Botones */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              navigation.reset({
                index: 1,
                routes: [{ name: 'Welcome' }, { name: 'Login' }],
              });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Volver al inicio de sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={() => setEmailSent(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="mail-outline" size={18} color="#2196F3" />
            <Text style={styles.resendButtonText}>Enviar nuevamente</Text>
          </TouchableOpacity>
        </View>

        <CustomAlert
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          buttons={alertConfig.buttons}
          onDismiss={hideAlert}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed" size={48} color="#2196F3" />
              </View>
              <Text style={styles.title}>Recuperar Contraseña</Text>
              <Text style={styles.subtitle}>
                Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña
              </Text>
            </View>

            {/* Formulario */}
            <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <View style={styles.inputWithIcon}>
                <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, error && styles.inputError]}
                  placeholder="Correo electrónico"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError('');
                  }}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Enviar enlace de recuperación</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Nota de seguridad */}
            <View style={styles.securityNote}>
              <Ionicons name="shield-checkmark" size={18} color="#6B7280" />
              <Text style={styles.securityNoteText}>
                El enlace expirará en 1 hora por seguridad
              </Text>
            </View>
          </View>

          {/* Link de regresar */}
          <TouchableOpacity
            style={styles.backLinkContainer}
            onPress={() => {
              navigation.reset({
                index: 1,
                routes: [{ name: 'Welcome' }, { name: 'Login' }],
              });
            }}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={16} color="#6B7280" />
            <Text style={styles.backLinkText}>Regresar a inicio</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onDismiss={hideAlert}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formContainer: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  inputWithIcon: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    color: '#1A1A1A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#93C5FD',
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  securityNoteText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },

  // Estilos para pantalla de éxito
  successIconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  successIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  successMessage: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emailText: {
    fontWeight: '700',
    color: '#2196F3',
  },
  instructionsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    gap: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    paddingTop: 4,
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 12,
  },
  resendButtonText: {
    color: '#2196F3',
    fontSize: 15,
    fontWeight: '600',
  },
  backLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 24,
  },
  backLinkText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
});
