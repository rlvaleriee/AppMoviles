import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, ActivityIndicator
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getUserById, saveUserProfile } from '../services/firestore';

export default function ProfileScreen() {
  const { firebaseUser } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Cargar perfil desde Firestore
  useEffect(() => {
    (async () => {
      if (!firebaseUser?.uid) return;
      try {
        setLoading(true);
        const data = await getUserById(firebaseUser.uid);
        setForm(data || { role: 'patient' });
      } catch (e) {
        Alert.alert('Error', e?.message || 'No se pudo cargar el perfil');
      } finally {
        setLoading(false);
      }
    })();
  }, [firebaseUser?.uid]);

  if (loading || !form) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: '#555' }}>Cargando perfil…</Text>
      </View>
    );
  }

  const isDoctor = form.role === 'doctor';

  const onSave = async () => {
    try {
      setSaving(true);
      await saveUserProfile(firebaseUser.uid, {
        name: form.name || '',
        phone: form.phone || null,
        // Campos exclusivos por rol
        address: isDoctor ? null : (form.address || null),
        specialty: isDoctor ? (form.specialty || null) : null,
        clinicAddress: isDoctor ? (form.clinicAddress || null) : null,
        acceptsNewPatients: isDoctor ? !!form.acceptsNewPatients : null,
        role: form.role || 'patient',
      });
      Alert.alert('Listo', 'Perfil actualizado');
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mi perfil ({form.role})</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={form.name || ''}
        onChangeText={(v) => setForm({ ...form, name: v })}
      />

      <TextInput
        style={styles.input}
        placeholder="Teléfono"
        value={form.phone || ''}
        onChangeText={(v) => setForm({ ...form, phone: v })}
      />

      {!isDoctor && (
        <TextInput
          style={styles.input}
          placeholder="Dirección"
          value={form.address || ''}
          onChangeText={(v) => setForm({ ...form, address: v })}
        />
      )}

      {isDoctor && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Especialidad"
            value={form.specialty || ''}
            onChangeText={(v) => setForm({ ...form, specialty: v })}
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección de clínica"
            value={form.clinicAddress || ''}
            onChangeText={(v) => setForm({ ...form, clinicAddress: v })}
          />
          <TouchableOpacity
            style={[styles.toggle, form.acceptsNewPatients && styles.toggleOn]}
            onPress={() =>
              setForm({ ...form, acceptsNewPatients: !form.acceptsNewPatients })
            }
          >
            <Text style={styles.toggleText}>
              {form.acceptsNewPatients
                ? 'Aceptando nuevos pacientes'
                : 'No acepta nuevos pacientes'}
            </Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.button} disabled={saving} onPress={onSave}>
        <Text style={styles.buttonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, backgroundColor: '#f5f5f5', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#2196F3' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  toggle: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  toggleOn: { backgroundColor: '#E3F2FD', borderColor: '#2196F3' },
  toggleText: { fontWeight: '600', color: '#0D47A1' },
  button: {
    backgroundColor: '#2196F3',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
