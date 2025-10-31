import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';

import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/index';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons'; 

// Juntas de Vigilancia (CSSP y afines de salud)
const BOARD_OPTIONS = [
  'Junta Médica',
  'Junta de Odontólogos',
  'Junta de Farmacéuticos',
  'Junta de Químicos',
  'Junta de Biólogos',
  'Junta de Psicólogos',
  'Junta de Enfermería',
  'Junta de Medicina Veterinaria',
  'Junta de Tecnólogos Médicos / Laboratorio',
  'Junta de Nutrición / Dietética',
  'Junta de Fisioterapia / Terapia Física',
  'Junta de Fonoaudiología / Terapia del Lenguaje',
  'Junta de Trabajo Social en Salud',
  'Otros (escribir)',
];

// Profesiones
const PROFESSION_OPTIONS = [
  'Doctor(a) en Medicina',
  'Odontólogo(a)',
  'Farmacéutico(a)',
  'Químico(a)',
  'Biólogo(a)',
  'Psicólogo(a)',
  'Enfermero(a)',
  'Médico Veterinario',
  'Tecnólogo(a) Médico(a) / Laboratorista',
  'Nutricionista / Dietista',
  'Fisioterapeuta / Terapeuta Físico',
  'Fonoaudiólogo(a) / Terapeuta del Lenguaje',
  'Trabajador(a) Social en Salud',
  'Otros (escribir)',
];

export default function RegisterScreen({ navigation }) {
  // Rol
  const [role, setRole] = useState('patient'); // 'doctor' | 'patient'

  // Campos comunes
  const [name, setName] = useState(''); 
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Estados para mostrar/ocultar
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Campos solo doctor 
  const [clinicAddress, setClinicAddress] = useState('');

  // CSSP: Junta, Profesión, Nº de Junta
  const [board, setBoard] = useState('');
  const [profession, setProfession] = useState('');
  const [boardNumber, setBoardNumber] = useState('');

  // (Opcional) Foto de perfil local (sin subir a Storage)
  const [profileUri, setProfileUri] = useState(null);

  // Geolocalización
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Modales Junta/Profesión
  const [boardModalVisible, setBoardModalVisible] = useState(false);
  const [boardQuery, setBoardQuery] = useState('');
  const [useOtherBoard, setUseOtherBoard] = useState(false);
  const [customBoard, setCustomBoard] = useState('');

  const [professionModalVisible, setProfessionModalVisible] = useState(false);
  const [professionQuery, setProfessionQuery] = useState('');
  const [useOtherProfession, setUseOtherProfession] = useState(false);
  const [customProfession, setCustomProfession] = useState('');

  // Estado
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const toggleRole = (nextRole) => {
    setRole(nextRole);
    // Reset de errores y campos específicos del rol
    setErrors({});
    if (nextRole === 'patient') {
      setClinicAddress('');
      setBoard('');
      setProfession('');
      setBoardNumber('');
      setUseOtherBoard(false);
      setCustomBoard('');
      setUseOtherProfession(false);
      setCustomProfession('');
    }
  };

  const requestLocation = async () => {
    try {
      setLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos de ubicación',
          'Se requiere acceso a tu ubicación para mostrarte doctores cercanos.'
        );
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = currentLocation.coords;
      setLocation({ latitude, longitude });

      const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addressData && addressData.length > 0) {
        const addr = addressData[0];
        const formattedAddress = [addr.street, addr.streetNumber, addr.district, addr.city, addr.region]
          .filter(Boolean)
          .join(', ');
        if (formattedAddress) setAddress(formattedAddress);
      }

      Alert.alert('Éxito', 'Ubicación obtenida correctamente');
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      Alert.alert('Error', 'No se pudo obtener tu ubicación. Intenta nuevamente.');
    } finally {
      setLoadingLocation(false);
    }
  };

  const pickImage = async () => {
    try {
      const { requestMediaLibraryPermissionsAsync, launchImageLibraryAsync, MediaTypeOptions } =
        await import('expo-image-picker');

      const perm = await requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permisos', 'Se requieren permisos para acceder a tus fotos.');
        return;
      }

      const result = await launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setProfileUri(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Imagen', 'No fue posible abrir el selector de imágenes.');
    }
  };

  const validate = () => {
    const newErrors = {};

    // Comunes
    if (!name.trim()) newErrors.name = 'Nombre requerido';
    if (!email.trim()) newErrors.email = 'Email requerido';
    if (!phone.trim()) newErrors.phone = 'Teléfono requerido';
    if (!address.trim()) newErrors.address = 'Dirección requerida';
    if (!password) newErrors.password = 'Contraseña requerida';
    if (!confirmPassword) newErrors.confirmPassword = 'Confirmar contraseña';

    if (email && !email.includes('@')) newErrors.email = 'Email inválido';
    if (password && password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    if (password && confirmPassword && password !== confirmPassword)
      newErrors.confirmPassword = 'Las contraseñas no coinciden';

    // Solo doctor (requerimos Apellido y campos CSSP)
    if (role === 'doctor') {
      if (!lastName.trim()) newErrors.lastName = 'Apellido requerido';

      const finalBoard = useOtherBoard ? customBoard.trim() : board.trim();
      if (!finalBoard) newErrors.board = 'Junta de Vigilancia requerida';
      if (useOtherBoard && !customBoard.trim()) newErrors.customBoard = 'Escribe la Junta';

      const finalProfession = useOtherProfession ? customProfession.trim() : profession.trim();
      if (!finalProfession) newErrors.profession = 'Profesión requerida';
      if (useOtherProfession && !customProfession.trim())
        newErrors.customProfession = 'Escribe la profesión';

      if (!boardNumber.trim()) newErrors.boardNumber = 'Número de Junta requerido';
      if (boardNumber && !/^[A-Za-z0-9\-\/]+$/.test(boardNumber.trim()))
        newErrors.boardNumber = 'Solo letras, números y - /';

      if (!clinicAddress.trim()) newErrors.clinicAddress = 'Dirección de consultorio requerida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    try {
      setLoading(true);

      // 1) Crear usuario en Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const { user } = cred;

      // Opcional: set displayName en profile (name + apellido si lo dieron)
      try {
        const display = lastName.trim() ? `${name.trim()} ${lastName.trim()}` : name.trim();
        await updateProfile(user, { displayName: display });
      } catch (_) {}

      // 2) Guardar datos en Firestore
      const userDoc = {
        uid: user.uid,
        name: name.trim(), 
        lastName: lastName.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        role: role, 
        verified: role === 'doctor' ? false : true, // médicos requieren revisión
        createdAt: serverTimestamp(),
      };

      if (role === 'doctor') {
        const finalBoard = useOtherBoard ? customBoard.trim() : board.trim();
        const finalProfession = useOtherProfession ? customProfession.trim() : profession.trim();

        userDoc.clinicAddress = clinicAddress.trim();

        // Datos para validación manual (CSSP)
        userDoc.cssp = {
          board: finalBoard,
          profession: finalProfession,
          boardNumber: boardNumber.trim(),
        };

        userDoc.reviewStatus = 'pending';
      }

      if (profileUri) userDoc.profileLocalUri = profileUri;

      if (location) {
        userDoc.location = {
          latitude: location.latitude,
          longitude: location.longitude,
        };
      }

      await setDoc(doc(db, 'users', user.uid), userDoc);

      // 3) Navegación
      if (role === 'doctor') {
        Alert.alert(
          'Registro enviado',
          'Tu cuenta será revisada por el equipo administrativo antes de activarse completamente.'
        );
        navigation.replace('Login');
      } else {
        navigation.replace('Login');
      }
    } catch (err) {
      console.log('[Auth error]', err?.code, err?.message, err);
      const serverMessage =
        err?.customData?._tokenResponse?.error?.message || err?.message || 'UNKNOWN';

      let msg = 'No se pudo crear la cuenta';
      if (err?.code === 'auth/email-already-in-use') msg = 'El correo ya está registrado';
      else if (err?.code === 'auth/invalid-email') msg = 'Email inválido';
      else if (err?.code === 'auth/weak-password') msg = 'La contraseña es muy débil';
      else if (err?.code === 'auth/network-request-failed') msg = 'Error de red, intenta nuevamente';
      else if (err?.code === 'auth/operation-not-allowed') msg = 'El método Email/Password no está habilitado';
      else msg = `No se pudo crear la cuenta: ${serverMessage}`;

      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const renderError = (key) =>
    errors[key] ? <Text style={styles.errorText}>{errors[key]}</Text> : null;

  // Listas filtradas para los buscadores (Junta y Profesión)
  const filteredBoards = [
    ...BOARD_OPTIONS.filter((s) =>
      s.toLowerCase().includes((boardQuery || '').toLowerCase())
    ),
  ];

  const filteredProfessions = [
    ...PROFESSION_OPTIONS.filter((s) =>
      s.toLowerCase().includes((professionQuery || '').toLowerCase())
    ),
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Crear Cuenta</Text>
            <Text style={styles.subtitle}>Regístrate para comenzar a usar la app</Text>
          </View>

          {/* Selección de Rol */}
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'patient' ? styles.roleActive : null]}
              onPress={() => toggleRole('patient')}
              disabled={loading}
            >
              <Text style={[styles.roleText, role === 'patient' && styles.roleTextActive]}>
                Paciente
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleBtn, role === 'doctor' ? styles.roleActive : null]}
              onPress={() => toggleRole('doctor')}
              disabled={loading}
            >
              <Text style={[styles.roleText, role === 'doctor' && styles.roleTextActive]}>
                Médico
              </Text>
            </TouchableOpacity>
          </View>

          {role === 'doctor' && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Tu cuenta será revisada por el equipo administrativo antes de activarse completamente.
              </Text>
            </View>
          )}

          <View style={styles.form}>
            {/* Nombre */}
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              value={name}
              onChangeText={setName}
              editable={!loading}
            />
            {renderError('name')}

            {/* Apellido (nuevo) */}
            <TextInput
              style={styles.input}
              placeholder="Apellido"
              value={lastName}
              onChangeText={setLastName}
              editable={!loading}
            />
            {role === 'doctor' && renderError('lastName')}

            {/* Email */}
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            {renderError('email')}

            {/* Teléfono */}
            <TextInput
              style={styles.input}
              placeholder="Teléfono"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />
            {renderError('phone')}

            {/* Dirección */}
            <View>
              <TextInput
                style={styles.input}
                placeholder="Dirección"
                value={address}
                onChangeText={setAddress}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={requestLocation}
                disabled={loading || loadingLocation}
              >
                {loadingLocation ? (
                  <ActivityIndicator size="small" color="#2196F3" />
                ) : (
                  <Text style={styles.locationBtnText}>
                    📍 {location ? 'Ubicación obtenida' : 'Obtener mi ubicación'}
                  </Text>
                )}
              </TouchableOpacity>
              {renderError('address')}
            </View>

            {/* Campos SOLO doctor */}
            {role === 'doctor' && (
              <>
                {/* Junta de Vigilancia */}
                <View>
                  <Text style={styles.label}>Junta de Vigilancia</Text>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setBoardModalVisible(true)}
                    disabled={loading}
                  >
                    <Text style={{ color: board ? '#000' : '#999' }}>
                      {useOtherBoard && customBoard ? customBoard : board || 'Selecciona la Junta'}
                    </Text>
                  </TouchableOpacity>
                  {renderError('board')}
                </View>

                {useOtherBoard && (
                  <View>
                    <TextInput
                      style={styles.input}
                      placeholder="Escribe la Junta"
                      value={customBoard}
                      onChangeText={setCustomBoard}
                      editable={!loading}
                    />
                    {renderError('customBoard')}
                  </View>
                )}

                {/* Profesión */}
                <View>
                  <Text style={styles.label}>Profesión</Text>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setProfessionModalVisible(true)}
                    disabled={loading}
                  >
                    <Text style={{ color: profession ? '#000' : '#999' }}>
                      {useOtherProfession && customProfession
                        ? customProfession
                        : profession || 'Selecciona la profesión'}
                    </Text>
                  </TouchableOpacity>
                  {renderError('profession')}
                </View>

                {useOtherProfession && (
                  <View>
                    <TextInput
                      style={styles.input}
                      placeholder="Escribe la profesión"
                      value={customProfession}
                      onChangeText={setCustomProfession}
                      editable={!loading}
                    />
                    {renderError('customProfession')}
                  </View>
                )}

                {/* Número de Junta */}
                <TextInput
                  style={styles.input}
                  placeholder="Número de Junta (CSSP)"
                  value={boardNumber}
                  onChangeText={setBoardNumber}
                  autoCapitalize="characters"
                  editable={!loading}
                />
                {renderError('boardNumber')}

                {/* Dirección del consultorio */}
                <TextInput
                  style={styles.input}
                  placeholder="Dirección del consultorio"
                  value={clinicAddress}
                  onChangeText={setClinicAddress}
                  editable={!loading}
                />
                {renderError('clinicAddress')}

                {/* (Opcional) Foto de perfil local */}
                <View style={styles.photoRow}>
                  <TouchableOpacity
                    style={styles.photoBtn}
                    onPress={pickImage}
                    disabled={loading}
                  >
                    <Text style={styles.photoBtnText}>
                      {profileUri ? 'Cambiar foto' : 'Subir foto (opcional)'}
                    </Text>
                  </TouchableOpacity>
                  {profileUri ? (
                    <Image source={{ uri: profileUri }} style={styles.avatarPreview} />
                  ) : null}
                </View>
              </>
            )}

            {/* Passwords con mostrar/ocultar */}
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, styles.inputPassword]}
                placeholder="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                textContentType="password"
                returnKeyType="next"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#1976D2"
                />
              </TouchableOpacity>
            </View>
            {renderError('password')}

            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, styles.inputPassword]}
                placeholder="Confirmar contraseña"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirm((v) => !v)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}
              >
                <MaterialCommunityIcons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#1976D2"
                />
              </TouchableOpacity>
            </View>
            {renderError('confirmPassword')}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Registrarse</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Login')} disabled={loading}>
              <Text style={styles.loginText}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* MODAL Junta de Vigilancia */}
      {role === 'doctor' && (
        <Modal
          visible={boardModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setBoardModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Seleccionar Junta</Text>

              <TextInput
                style={styles.input}
                placeholder="Filtrar..."
                value={boardQuery}
                onChangeText={setBoardQuery}
              />

              <FlatList
                style={{ maxHeight: 300 }}
                data={[...filteredBoards]}
                keyExtractor={(item, idx) => item + idx}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => {
                      if (item.includes('Otros')) {
                        setUseOtherBoard(true);
                        setBoard('Otros');
                      } else {
                        setUseOtherBoard(false);
                        setCustomBoard('');
                        setBoard(item);
                      }
                      setBoardModalVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{item}</Text>
                  </TouchableOpacity>
                )}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => setBoardModalVisible(false)}
                  style={[styles.photoBtn, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}
                >
                  <Text style={{ fontWeight: '600', color: '#1976D2' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL Profesión */}
      {role === 'doctor' && (
        <Modal
          visible={professionModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setProfessionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Seleccionar profesión</Text>

              <TextInput
                style={styles.input}
                placeholder="Filtrar..."
                value={professionQuery}
                onChangeText={setProfessionQuery}
              />

              <FlatList
                style={{ maxHeight: 300 }}
                data={[...filteredProfessions]}
                keyExtractor={(item, idx) => item + idx}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => {
                      if (item.includes('Otros')) {
                        setUseOtherProfession(true);
                        setProfession('Otros');
                      } else {
                        setUseOtherProfession(false);
                        setCustomProfession('');
                        setProfession(item);
                      }
                      setProfessionModalVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{item}</Text>
                  </TouchableOpacity>
                )}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => setProfessionModalVisible(false)}
                  style={[styles.photoBtn, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}
                >
                  <Text style={{ fontWeight: '600', color: '#1976D2' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2196F3', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center' },

  roleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  roleBtn: {
    flex: 1,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  roleActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  roleText: { color: '#1976D2', fontWeight: '600' },
  roleTextActive: { color: '#fff' },

  notice: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEEBA',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  noticeText: { color: '#8a6d3b', fontSize: 13 },

  form: { marginTop: 4, marginBottom: 20 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
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

  label: { marginLeft: 4, marginBottom: 4, color: '#333', fontWeight: '600' },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  photoBtn: {
    backgroundColor: '#EEE',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  photoBtnText: { color: '#333', fontWeight: '600' },
  avatarPreview: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#ccc' },

  button: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { backgroundColor: '#90CAF9' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 6,
  },
  footerText: { color: '#666', fontSize: 14 },
  loginText: { color: '#2196F3', fontSize: 14, fontWeight: 'bold' },

  errorText: { color: '#D32F2F', marginBottom: 6, marginLeft: 4, fontSize: 12 },

  locationBtn: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#90CAF9',
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  locationBtnText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  optionItem: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});
