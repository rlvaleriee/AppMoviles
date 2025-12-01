import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useTheme } from '../context/ThemeContext';
import { validatePassword } from '../services/passwordService';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function SecurityScreen({ navigation }) {
  const { colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Validación en tiempo real de requisitos de contraseña
  const passwordRequirements = {
    minLength: newPassword.length >= 8,
    hasUpperLower: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
    hasNumberOrSpecial: /[0-9]/.test(newPassword) || /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(newPassword),
  };

  const handleChangePassword = async () => {
    const newErrors = {};

    // Validaciones
    if (!currentPassword) {
      newErrors.currentPassword = 'La contraseña actual es requerida';
    }
    if (!newPassword) {
      newErrors.newPassword = 'La nueva contraseña es requerida';
    } else {
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        newErrors.newPassword = passwordValidation.errors.join(', ');
      }
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Confirmar contraseña es requerido';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      newErrors.newPassword = 'La nueva contraseña debe ser diferente a la actual';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      setLoading(true);
      const user = auth.currentUser;

      if (!user || !user.email) {
        throw new Error('No se encontró usuario autenticado');
      }

      // Reautenticar usuario
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Cambiar contraseña
      await updatePassword(user, newPassword);

      showAlert(
        'Contraseña actualizada',
        'Tu contraseña ha sido cambiada exitosamente.',
        [
          {
            text: 'OK',
            onPress: () => {
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      let errorMessage = 'No se pudo cambiar la contraseña';
      let shouldShowCurrentPasswordError = false;

      // Mapeo completo de errores de Firebase a español
      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'La contraseña actual es incorrecta';
          shouldShowCurrentPasswordError = true;
          break;
        case 'auth/invalid-login-credentials':
          errorMessage = 'La contraseña actual no es válida';
          shouldShowCurrentPasswordError = true;
          break;
        case 'auth/requires-recent-login':
          errorMessage = 'Por seguridad, debes cerrar sesión y volver a iniciarla antes de cambiar tu contraseña';
          break;
        case 'auth/weak-password':
          errorMessage = 'La contraseña nueva es demasiado débil. Debe tener al menos 6 caracteres';
          break;
        case 'auth/user-mismatch':
          errorMessage = 'Las credenciales no corresponden al usuario actual';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No se encontró el usuario';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Error de conexión. Verifica tu internet e intenta nuevamente';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
          break;
        default:
          // Si hay un mensaje de error personalizado, usarlo
          if (error.message && error.message.includes('auth/')) {
            errorMessage = 'Error de autenticación. Por favor intenta nuevamente';
          }
          break;
      }

      // Si el error es de contraseña incorrecta, también mostrar en el campo
      if (shouldShowCurrentPasswordError) {
        setErrors({ ...errors, currentPassword: errorMessage });
      }

      showAlert('Error al cambiar contraseña', errorMessage);
    } finally {
      setLoading(false);
    }
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
    section: {
      ...styles.section,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    sectionSubtitle: {
      ...styles.sectionSubtitle,
      color: colors.textSecondary,
    },
    label: {
      ...styles.label,
      color: colors.text,
    },
    input: {
      ...styles.input,
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      color: colors.inputText,
    },
    tipsSection: {
      ...styles.tipsSection,
      backgroundColor: colors.card,
    },
    tipsTitle: {
      ...styles.tipsTitle,
      color: colors.text,
    },
    tipText: {
      ...styles.tipText,
      color: colors.textSecondary,
    },
  };

  return (
    <KeyboardAvoidingView
      style={dynamicStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Seguridad</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={dynamicStyles.section}>
          <View style={styles.iconHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={40} color="#2196F3" />
            </View>
            <Text style={dynamicStyles.sectionTitle}>Cambiar contraseña</Text>
            <Text style={dynamicStyles.sectionSubtitle}>
              Asegúrate de usar una contraseña segura de al menos 6 caracteres
            </Text>
          </View>

          {/* Contraseña actual */}
          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.label}>Contraseña actual</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={[dynamicStyles.input, styles.inputPassword, errors.currentPassword && styles.inputError]}
                placeholder="Ingresa tu contraseña actual"
                placeholderTextColor={colors.placeholder}
                value={currentPassword}
                onChangeText={(text) => {
                  setCurrentPassword(text);
                  if (errors.currentPassword) setErrors({ ...errors, currentPassword: null });
                }}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowCurrent(!showCurrent)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={showCurrent ? 'eye-off' : 'eye'}
                  size={22}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.currentPassword && <Text style={styles.errorText}>{errors.currentPassword}</Text>}
          </View>

          {/* Nueva contraseña */}
          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.label}>Nueva contraseña</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={[dynamicStyles.input, styles.inputPassword, errors.newPassword && styles.inputError]}
                placeholder="Ingresa tu nueva contraseña"
                placeholderTextColor={colors.placeholder}
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errors.newPassword) setErrors({ ...errors, newPassword: null });
                }}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNew(!showNew)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={showNew ? 'eye-off' : 'eye'}
                  size={22}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.newPassword && <Text style={styles.errorText}>{errors.newPassword}</Text>}
          </View>

          {/* Confirmar contraseña */}
          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.label}>Confirmar nueva contraseña</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={[dynamicStyles.input, styles.inputPassword, errors.confirmPassword && styles.inputError]}
                placeholder="Confirma tu nueva contraseña"
                placeholderTextColor={colors.placeholder}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: null });
                }}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirm(!showConfirm)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={showConfirm ? 'eye-off' : 'eye'}
                  size={22}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
          </View>

          {/* Botón de guardar */}
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleChangePassword}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Cambiar contraseña</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Consejos de seguridad */}
        <View style={dynamicStyles.tipsSection}>
          <Text style={dynamicStyles.tipsTitle}>Requisitos de contraseña</Text>
          <View style={styles.tip}>
            <Ionicons
              name={passwordRequirements.minLength ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={passwordRequirements.minLength ? "#10B981" : "#9CA3AF"}
            />
            <Text style={[
              dynamicStyles.tipText,
              passwordRequirements.minLength && styles.tipTextMet
            ]}>Usa al menos 8 caracteres</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons
              name={passwordRequirements.hasUpperLower ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={passwordRequirements.hasUpperLower ? "#10B981" : "#9CA3AF"}
            />
            <Text style={[
              dynamicStyles.tipText,
              passwordRequirements.hasUpperLower && styles.tipTextMet
            ]}>Combina letras mayúsculas y minúsculas</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons
              name={passwordRequirements.hasNumberOrSpecial ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={passwordRequirements.hasNumberOrSpecial ? "#10B981" : "#9CA3AF"}
            />
            <Text style={[
              dynamicStyles.tipText,
              passwordRequirements.hasNumberOrSpecial && styles.tipTextMet
            ]}>Incluye números o caracteres especiales</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
            <Text style={dynamicStyles.tipText}>No uses información personal obvia</Text>
          </View>
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
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrapper: {
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
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#93C5FD',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  tipsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  tipTextMet: {
    color: '#10B981',
    fontWeight: '500',
  },
});
