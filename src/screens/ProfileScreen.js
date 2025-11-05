import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, ActivityIndicator, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { app } from '../firebase';

import { useAuth } from '../context/AuthContext';
import { getUserById, saveUserProfile } from '../services/firestore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { firebaseUser, currentUserData, logout } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Cargar perfil desde Firestore
  useEffect(() => {
    (async () => {
      if (!firebaseUser?.uid) return;
      try {
        setLoading(true);
        const data = await getUserById(firebaseUser.uid);
        setForm(data ? { ...data, profileLocalUri: null } : { role: 'patient' });
      } catch (e) {
        Alert.alert('Error', e?.message || 'No se pudo cargar el perfil');
      } finally {
        setLoading(false);
      }
    })();
  }, [firebaseUser?.uid]);

  const isDoctor = form?.role === 'doctor';

  const requestMediaPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos para actualizar el perfil.');
      return false;
    }
    return true;
  };

  const MEDIA_TYPES =
    ImagePicker.MediaType ? [ImagePicker.MediaType.Image] : ImagePicker.MediaTypeOptions.Images;

  const pickImage = async () => {
    const ok = await requestMediaPermissions();
    if (!ok) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setForm((prev) => ({ ...prev, profileLocalUri: uri })); 
      await uploadProfilePhoto(uri);
    } catch (err) {
      Alert.alert('Error', err?.message || 'No se pudo abrir la galería');
    }
  };

  const fetchBlob = async (uri) => {
    const res = await fetch(uri);
    return await res.blob();
  };

  const base64ToUint8Array = (base64) => {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary_string.charCodeAt(i);
    return bytes;
  };

  const robustReadAsBytes = async (uri) => {
    try {
      const blob = await fetchBlob(uri);
      if (blob && blob.size)
        return {
          bytes: blob,
          contentType: blob.type || 'image/jpeg',
          ext: (blob.type || '').includes('png') ? 'png' : 'jpg',
          asBlob: true,
        };
    } catch (_) {}

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToUint8Array(base64);
    const lower = (uri || '').toLowerCase();
    const isPng = lower.endsWith('.png') || lower.includes('image/png');
    return { bytes, contentType: isPng ? 'image/png' : 'image/jpeg', ext: isPng ? 'png' : 'jpg', asBlob: false };
  };

  const uploadProfilePhoto = async (uri) => {
    if (!firebaseUser?.uid) {
      Alert.alert('Error', 'Usuario no autenticado.');
      return;
    }

    try {
      setUploadingPhoto(true);

      const bucket = app?.options?.storageBucket;
      const storageInstance = bucket ? getStorage(app, `gs://${bucket}`) : getStorage(app);

      const fileData = await robustReadAsBytes(uri);
      const { bytes, contentType, ext } = fileData;

      const fileRef = ref(storageInstance, `avatars/${firebaseUser.uid}.${ext}`);
      const task = uploadBytesResumable(fileRef, bytes, { contentType });

      await new Promise((resolve, reject) => {
        task.on('state_changed', (err) => reject(err), () => resolve());
      });

      const url = await getDownloadURL(fileRef);
      await saveUserProfile(firebaseUser.uid, { photoURL: url });
      setForm((prev) => ({ ...prev, photoURL: url, profileLocalUri: null }));

      Alert.alert('Foto actualizada', 'Tu foto de perfil se actualizó correctamente.');
    } catch (e) {
      let extra = '';
      try {
        if (e?.serverResponse) extra = `\nServer: ${e.serverResponse}`;
        else if (e?.customData?.serverResponse) extra = `\nServer: ${e.customData.serverResponse}`;
      } catch (_) {}
      console.log('uploadProfilePhoto error >>>', e?.code, e?.message, extra);
      Alert.alert('Error al subir', e?.message || 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading || !form) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={{ marginTop: 8, color: '#555' }}>Cargando perfil…</Text>
      </View>
    );
  }

  const onSave = async () => {
    try {
      setSaving(true);
      await saveUserProfile(firebaseUser.uid, {
        name: form.name || '',
        lastName: form.lastName || null,
        phone: form.phone || null,
        email: form.email || null,
        photoURL: form.photoURL || null,
        address: isDoctor ? null : (form.address || null),
        specialty: isDoctor ? (form.specialty || null) : null,
        clinicAddress: isDoctor ? (form.clinicAddress || null) : null,
        acceptsNewPatients: isDoctor ? !!form.acceptsNewPatients : null,
        role: form.role || 'patient',
      });
      Alert.alert('Listo', 'Perfil actualizado correctamente');
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro que deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (e) {
            Alert.alert('Error', e?.message || 'No se pudo cerrar sesión');
          }
        },
      },
    ]);
  };

  const avatarUri = form.profileLocalUri || form.photoURL || currentUserData?.photoURL || null;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={48} color="#2196F3" />
              </View>
            )}

            {/* Botón para cambiar foto */}
            <TouchableOpacity onPress={pickImage} style={styles.editPhotoBtn} activeOpacity={0.8}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.headerText}>
            {/* Nombres arriba, apellidos abajo */}
            <View style={styles.nameBlock}>
              <Text style={styles.headerFirstName} numberOfLines={1} ellipsizeMode="tail">
                {form.name || ''}
              </Text>
              {Boolean(form.lastName) && (
                <Text style={styles.headerLastName} numberOfLines={1} ellipsizeMode="tail">
                  {form.lastName}
                </Text>
              )}
            </View>

            <View style={styles.roleBadge}>
              <MaterialCommunityIcons
                name={isDoctor ? 'stethoscope' : 'account'}
                size={14}
                color="#fff"
              />
              <Text style={styles.roleText}>{isDoctor ? 'Médico' : 'Paciente'}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButtonHeader} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Información del perfil */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información Personal</Text>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu nombre"
            value={form.name || ''}
            onChangeText={(v) => setForm({ ...form, name: v })}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Apellido</Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu apellido"
            value={form.lastName || ''}
            onChangeText={(v) => setForm({ ...form, lastName: v })}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            placeholder="Email"
            value={form.email || firebaseUser?.email || ''}
            editable={false}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu teléfono"
            value={form.phone || ''}
            onChangeText={(v) => setForm({ ...form, phone: v })}
            keyboardType="phone-pad"
          />
        </View>

        {!isDoctor && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu dirección"
              value={form.address || ''}
              onChangeText={(v) => setForm({ ...form, address: v })}
              multiline
            />
          </View>
        )}
      </View>

      {/* Información profesional (solo médicos) */}
      {isDoctor && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Profesional</Text>

          {form.cssp && (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Junta de Vigilancia:</Text>
                <Text style={styles.infoValue}>{form.cssp.board}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Profesión:</Text>
                <Text style={styles.infoValue}>{form.cssp.profession}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Número de Junta:</Text>
                <Text style={styles.infoValue}>{form.cssp.boardNumber}</Text>
              </View>
            </View>
          )}

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Dirección del consultorio</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa la dirección de tu consultorio"
              value={form.clinicAddress || ''}
              onChangeText={(v) => setForm({ ...form, clinicAddress: v })}
              multiline
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Disponibilidad</Text>
            <TouchableOpacity
              style={[styles.toggle, form.acceptsNewPatients && styles.toggleOn]}
              onPress={() => setForm({ ...form, acceptsNewPatients: !form.acceptsNewPatients })}
            >
              <MaterialCommunityIcons
                name={form.acceptsNewPatients ? 'check-circle' : 'close-circle'}
                size={24}
                color={form.acceptsNewPatients ? '#4CAF50' : '#999'}
              />
              <Text style={[styles.toggleText, form.acceptsNewPatients && styles.toggleTextOn]}>
                {form.acceptsNewPatients ? 'Aceptando nuevos pacientes' : 'No acepta nuevos pacientes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Botones de acción */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, (saving || uploadingPhoto) && styles.buttonDisabled]}
          disabled={saving || uploadingPhoto}
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Guardar Cambios</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5',
  },
  scrollView: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { paddingBottom: 32 },

  header: {
    backgroundColor: '#2196F3',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    position: 'relative',
  },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  logoutButtonHeader: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },

  avatarContainer: { marginRight: 16 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  editPhotoBtn: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  headerText: { flex: 1, paddingRight: 56 },
  nameBlock: { maxWidth: '90%', marginBottom: 8 },
  headerFirstName: { fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 28 },
  headerLastName: { fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 28, marginTop: -2 },

  headerName: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },

  roleBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start', gap: 6,
  },
  roleText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  section: {
    backgroundColor: '#fff', marginTop: 16, marginHorizontal: 16, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16 },

  fieldContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  input: {
    backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0',
    padding: 12, borderRadius: 8, fontSize: 16, color: '#333',
  },
  inputDisabled: { backgroundColor: '#f0f0f0', color: '#999' },

  infoCard: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 12, marginBottom: 16 },
  infoRow: { marginBottom: 8 },
  infoLabel: { fontSize: 12, color: '#1976D2', fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#0D47A1', fontWeight: '500' },

  toggle: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#f9f9f9', gap: 12,
  },
  toggleOn: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  toggleText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#666' },
  toggleTextOn: { color: '#2E7D32' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: '#f9f9f9', borderRadius: 8, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  statLabel: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 8 },
  statValue: { fontSize: 14, color: '#2196F3', fontWeight: '600', marginTop: 4 },

  actions: { marginHorizontal: 16, marginTop: 24, gap: 12 },
  button: {
    backgroundColor: '#2196F3', padding: 16, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#90CAF9' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
