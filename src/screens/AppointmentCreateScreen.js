import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { createAppointment } from '../services/firestore';

export default function AppointmentCreateScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const { firebaseUser } = useAuth();
  const [reason, setReason] = useState('');
  const [dateISO, setDateISO] = useState(''); 
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!dateISO.trim()) {
      Alert.alert('Fecha requerida', 'Por favor ingresa una fecha y hora válidas');
      return;
    }

    try {
      setLoading(true);
      await createAppointment({
        patientId: firebaseUser?.uid,
        doctorId,
        reason,
        slotStart: dateISO, 
      });
      Alert.alert('Solicitud enviada', 'Tu cita fue registrada correctamente.');
      navigation.goBack();
    } catch (e) {
      console.error('Error creando cita:', e);
      Alert.alert('Error', e?.message || 'No se pudo crear la cita.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f5f5f5' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Nueva cita</Text>

        <TextInput
          style={styles.input}
          placeholder="Motivo (opcional)"
          value={reason}
          onChangeText={setReason}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD HH:mm"
          value={dateISO}
          onChangeText={setDateISO}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Solicitar cita</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2196F3',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#90CAF9',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
