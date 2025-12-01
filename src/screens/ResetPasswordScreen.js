import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../firebase/config';
import { validatePassword as validatePasswordService } from '../services/passwordService';

export default function ResetPasswordScreen({ navigation, route }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [oobCode, setOobCode] = useState(null);
  const [email, setEmail] = useState('');

  // Obtener el código de verificación de los parámetros de la ruta
  useEffect(() => {
    const code = route.params?.oobCode;

    if (!code) {
      Alert.alert(
        'Enlace inválido',
        'El enlace de recuperación no es válido o ha expirado.',
        [{ text: 'OK', onPress: () => navigation.replace('Login') }]
      );
      return;
    }

    // Verificar que el código sea válido
    verifyPasswordResetCode(auth, code)
      .then((emailFromCode) => {
        setEmail(emailFromCode);
        setOobCode(code);
        setVerifying(false);
      })
      .catch((error) => {
        let errorMessage = 'El enlace no es válido o ha expirado';

        if (error.code === 'auth/expired-action-code') {
          errorMessage = 'El enlace ha expirado. Solicita uno nuevo.';
        } else if (error.code === 'auth/invalid-action-code') {
          errorMessage = 'El enlace no es válido o ya fue usado.';
        }

        Alert.alert(
          'Error',
          errorMessage,
          [{ text: 'OK', onPress: () => navigation.replace('Login') }]
        );
      });
  }, [route.params]);

  const handleResetPassword = async () => {
    // Validaciones de contraseña segura
    const passwordValidation = validatePasswordService(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors.join(', '));
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (!oobCode) {
      Alert.alert('Error', 'Código de verificación no encontrado');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Confirmar el restablecimiento de contraseña
      await confirmPasswordReset(auth, oobCode, password);

      Alert.alert(
        'Contraseña actualizada',
        'Tu contraseña ha sido actualizada correctamente. Ahora puedes iniciar sesión con tu nueva contraseña.',
        [
          {
            text: 'Iniciar sesión',
            onPress: () => navigation.replace('Login'),
          },
        ]
      );
    } catch (error) {
      let errorMessage = 'No se pudo restablecer la contraseña';

      if (error.code === 'auth/expired-action-code') {
        errorMessage = 'El enlace ha expirado. Solicita uno nuevo.';
      } else if (error.code === 'auth/invalid-action-code') {
        errorMessage = 'El enlace no es válido o ya fue usado.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'La contraseña es muy débil. Usa al menos 6 caracteres.';
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.verifyingText}>Verificando enlace...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Botón de regresar fijo */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.replace('Login')}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="key" size={48} color="#2196F3" />
              </View>
              <Text style={styles.title}>Nueva Contraseña</Text>
              <Text style={styles.subtitle}>
                Ingresa tu nueva contraseña para{'\n'}
                <Text style={styles.emailText}>{email}</Text>
              </Text>
            </View>

            {/* Formulario */}
            <View style={styles.formContainer}>
              {/* Campo de contraseña */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWithIcon}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.inputPassword, error && styles.inputError]}
                    placeholder="Nueva contraseña"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (error) setError('');
                    }}
                    editable={!loading}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="next"
                    autoFocus={true}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((p) => !p)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color="#6B7280"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Campo de confirmar contraseña */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWithIcon}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.inputPassword, error && styles.inputError]}
                    placeholder="Confirmar contraseña"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (error) setError('');
                    }}
                    editable={!loading}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((p) => !p)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color="#6B7280"
                    />
                  </TouchableOpacity>
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              {/* Requisitos de contraseña */}
              <View style={styles.requirementsContainer}>
                <Text style={styles.requirementsTitle}>La contraseña debe tener:</Text>
                <View style={styles.requirementItem}>
                  <Ionicons
                    name={password.length >= 6 ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={password.length >= 6 ? '#4CAF50' : '#9CA3AF'}
                  />
                  <Text
                    style={[
                      styles.requirementText,
                      password.length >= 6 && styles.requirementTextMet,
                    ]}
                  >
                    Al menos 6 caracteres
                  </Text>
                </View>
                <View style={styles.requirementItem}>
                  <Ionicons
                    name={
                      password === confirmPassword && password.length > 0
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={18}
                    color={
                      password === confirmPassword && password.length > 0
                        ? '#4CAF50'
                        : '#9CA3AF'
                    }
                  />
                  <Text
                    style={[
                      styles.requirementText,
                      password === confirmPassword &&
                        password.length > 0 &&
                        styles.requirementTextMet,
                    ]}
                  >
                    Las contraseñas coinciden
                  </Text>
                </View>
              </View>

              {/* Botón de restablecer */}
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
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Restablecer contraseña</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 24,
  },
  content: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    minHeight: '100%',
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
  emailText: {
    fontWeight: '700',
    color: '#2196F3',
  },
  verifyingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
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
  inputPassword: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    height: 44,
    width: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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
  requirementsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requirementText: {
    fontSize: 14,
    color: '#6B7280',
  },
  requirementTextMet: {
    color: '#4CAF50',
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
});
