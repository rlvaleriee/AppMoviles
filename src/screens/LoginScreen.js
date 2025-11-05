import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const onLogin = async () => {
    const newErrors = {};

    // Validaciones
    if (!email.trim()) {
      newErrors.email = 'El correo electrónico es requerido';
    } else if (!validateEmail(email.trim())) {
      newErrors.email = 'El correo electrónico no es válido';
    }

    if (!password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    const res = await login(email.trim(), password);
    if (!res?.success) {
      // Manejo de errores específicos de Firebase
      let errorMessage = 'No se pudo iniciar sesión';

      if (res?.error?.code === 'auth/user-not-found') {
        errorMessage = 'No existe una cuenta con este correo electrónico';
      } else if (res?.error?.code === 'auth/wrong-password') {
        errorMessage = 'La contraseña es incorrecta';
      } else if (res?.error?.code === 'auth/invalid-email') {
        errorMessage = 'El correo electrónico no es válido';
      } else if (res?.error?.code === 'auth/user-disabled') {
        errorMessage = 'Esta cuenta ha sido deshabilitada';
      } else if (res?.error?.code === 'auth/too-many-requests') {
        errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
      } else if (res?.error?.code === 'auth/network-request-failed') {
        errorMessage = 'Error de conexión. Verifica tu internet';
      } else if (res?.error?.code === 'auth/invalid-credential') {
        errorMessage = 'Correo o contraseña incorrectos';
      } else if (res?.message) {
        errorMessage = res.message;
      }

      Alert.alert('Error de inicio de sesión', errorMessage);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Inicia sesión</Text>

        <View>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors({ ...errors, email: null });
            }}
            editable={!loading}
            returnKeyType="next"
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        {/* Contenedor para input de contraseña */}
        <View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, styles.inputPassword, errors.password && styles.inputError]}
              placeholder="Contraseña"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors({ ...errors, password: null });
              }}
              editable={!loading}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={onLogin}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((p) => !p)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#1976D2"
              />
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={onLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.replace('Register')} disabled={loading}>
          <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20, justifyContent: 'center' },
  content: { gap: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2196F3', marginBottom: 12, textAlign: 'center' },

  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd'
  },

  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputPassword: {
    paddingRight: 48, 
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 15, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#90CAF9' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  link: { color: '#2196F3', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  inputError: {
    borderColor: '#D32F2F',
    borderWidth: 1.5,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
    marginBottom: 4,
  },
});
