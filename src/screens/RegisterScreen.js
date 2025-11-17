import React, { useRef, useState } from 'react';
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
import { app } from '../firebase'; // para Storage
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const GEOAPIFY_KEY = '18200d83a8c440c2b3421eff1cf14a35'; // ej: '18200d83a8c440c2b3421eff1cf14a35'

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

// Centro por defecto (San Salvador) 
const DEFAULT_CENTER = { latitude: 13.6929, longitude: -89.2182 };

export default function RegisterScreen({ navigation }) {
  // Rol
  const [role, setRole] = useState('patient');

  // Campos comunes
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Mostrar/ocultar
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Solo doctor
  const [clinicAddress, setClinicAddress] = useState('');

  // CSSP
  const [board, setBoard] = useState('');
  const [profession, setProfession] = useState('');
  const [boardNumber, setBoardNumber] = useState('');

  // Foto local
  const [profileUri, setProfileUri] = useState(null);

  // Geolocalización
  const [location, setLocation] = useState(null); // { latitude, longitude }
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Picker de mapa
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [selectedCoord, setSelectedCoord] = useState(null);

  // Autocomplete (Geoapify)
  const [placesQuery, setPlacesQuery] = useState('');
  const [placesResults, setPlacesResults] = useState([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const searchTO = useRef(null);

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

  // -------- Ubicación actual --------
  const requestLocation = async () => {
    try {
      setLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos de ubicación', 'Se requiere acceso a tu ubicación.');
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

      setMapRegion((prev) => ({ ...prev, latitude, longitude }));
      Alert.alert('Éxito', 'Ubicación obtenida correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo obtener tu ubicación.');
    } finally {
      setLoadingLocation(false);
    }
  };

  // -------- Map Picker --------
  const openMapPicker = () => {
    const center = location || DEFAULT_CENTER;
    setSelectedCoord(center);
    setMapRegion({
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setMapVisible(true);
  };

  const onMapPress = (e) => {
    const coord = e.nativeEvent.coordinate;
    setSelectedCoord({ latitude: coord.latitude, longitude: coord.longitude });
  };

  const confirmMapSelection = async () => {
    if (!selectedCoord) {
      Alert.alert('Mapa', 'Selecciona un punto en el mapa.');
      return;
    }
    try {
      const { latitude, longitude } = selectedCoord;
      setLocation({ latitude, longitude });

      // Reverse geocode básico para rellenar address (si no viene de autocomplete)
      const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addressData && addressData.length > 0) {
        const addr = addressData[0];
        const formattedAddress = [addr.street, addr.streetNumber, addr.district, addr.city, addr.region]
          .filter(Boolean)
          .join(', ');
        if (formattedAddress) setAddress((old) => old || formattedAddress);
      }

      setMapVisible(false);
      Alert.alert('Listo', 'Ubicación seleccionada.');
    } catch (err) {
      setMapVisible(false);
      Alert.alert('Mapa', 'No se pudo procesar la ubicación.');
    }
  };

  // -------- Autocomplete (Geoapify)  --------
  const searchPlaces = async (q) => {
    if (!GEOAPIFY_KEY) return;

    try {
      setSearchingPlaces(true);

      const bias = location
        ? `&bias=proximity:${location.longitude},${location.latitude}`
        : '';

      const url =
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}` +
        `&limit=6&lang=es&filter=countrycode:sv${bias}&apiKey=${GEOAPIFY_KEY}`;

      const res = await fetch(url);
      const json = await res.json();
      const feats = Array.isArray(json?.features) ? json.features : [];
      setPlacesResults(feats);
    } catch {
      setPlacesResults([]);
    } finally {
      setSearchingPlaces(false);
    }
  };

  const onChangePlacesQuery = (text) => {
    setPlacesQuery(text);
    if (searchTO.current) clearTimeout(searchTO.current);
    if (!text || text.trim().length < 2) {
      setPlacesResults([]);
      return;
    }
    searchTO.current = setTimeout(() => searchPlaces(text.trim()), 350);
  };

  const pickFromPlaces = (feat) => {
    // GeoJSON: geometry.coordinates = [lon, lat]
    const coords = feat?.geometry?.coordinates || [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const coord = { latitude: lat, longitude: lon };
      setSelectedCoord(coord);
      setMapRegion((r) => ({ ...r, latitude: lat, longitude: lon }));
      setLocation(coord);
    }
    const formatted = feat?.properties?.formatted || feat?.properties?.address_line1 || '';
    if (formatted) setAddress(formatted);
    setPlacesResults([]);
    setPlacesQuery(
      feat?.properties?.address_line1 ||
      feat?.properties?.formatted ||
      feat?.properties?.name ||
      ''
    );
  };

  // ---------- Imagen de perfil ----------
  const requestMediaPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permisos', 'Se requieren permisos para acceder a tus fotos.');
      return false;
    }
    return true;
  };

  const getPickerMediaTypes = () => {
    return ImagePicker.MediaType
      ? { mediaTypes: [ImagePicker.MediaType.Image] }
      : { mediaTypes: ImagePicker.MediaTypeOptions.Images };
  };

  const pickImage = async () => {
    try {
      const ok = await requestMediaPermissions();
      if (!ok) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        ...getPickerMediaTypes(),
        allowsEditing: true,
        quality: 0.8,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setProfileUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Imagen', 'No fue posible abrir el selector de imágenes.');
    }
  };

  const robustReadBlob = async (uri) => {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      if (blob && blob.size) {
        const type = blob.type || 'image/jpeg';
        const ext = type.includes('png') ? 'png' : 'jpg';
        return { blob, contentType: type, ext };
      }
    } catch (_) {}
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const lower = (uri || '').toLowerCase();
    const isPng = lower.endsWith('.png') || lower.includes('image/png');
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${base64}`;
    const res2 = await fetch(dataUrl);
    const blob2 = await res2.blob();
    return { blob: blob2, contentType: mime, ext: isPng ? 'png' : 'jpg' };
  };

  const validate = () => {
    const newErrors = {};
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

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const { user } = cred;

      // Subir foto opcional
      let uploadedPhotoURL = null;
      if (profileUri) {
        try {
          const bucket = app?.options?.storageBucket;
          const storageInstance = bucket ? getStorage(app, `gs://${bucket}`) : getStorage(app);

          const { blob, contentType, ext } = await robustReadBlob(profileUri);
          const fileRef = ref(storageInstance, `avatars/${user.uid}.${ext}`);
          const task = uploadBytesResumable(fileRef, blob, { contentType });

          await new Promise((resolve, reject) => {
            task.on('state_changed', () => {}, reject, resolve);
          });

          uploadedPhotoURL = await getDownloadURL(fileRef);
        } catch (e) {
          console.log('[Storage upload error]', e?.code, e?.message);
        }
      }

      // Actualizar perfil Auth
      try {
        const display = lastName.trim() ? `${name.trim()} ${lastName.trim()}` : name.trim();
        await updateProfile(user, { displayName: display, photoURL: uploadedPhotoURL || null });
      } catch {}

      // Guardar en Firestore
      const userDoc = {
        uid: user.uid,
        name: name.trim(),
        lastName: lastName.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        role,
        verified: role === 'doctor' ? false : true,
        createdAt: serverTimestamp(),
        photoURL: uploadedPhotoURL || null,
        location: location ? { latitude: location.latitude, longitude: location.longitude } : null,
      };

      if (role === 'doctor') {
        const finalBoard = useOtherBoard ? customBoard.trim() : board.trim();
        const finalProfession = useOtherProfession ? customProfession.trim() : profession.trim();

        userDoc.clinicAddress = clinicAddress.trim();
        userDoc.cssp = {
          board: finalBoard || null,
          profession: finalProfession || null,
          boardNumber: boardNumber.trim() || null,
        };
        userDoc.reviewStatus = 'pending';
      }

      await setDoc(doc(db, 'users', user.uid), userDoc);

      if (role === 'doctor') {
        Alert.alert('Registro enviado', 'Tu cuenta será revisada antes de activarse.');
      }
      navigation.replace('Login');
    } catch (err) {
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
            {/* Foto de perfil (opcional) */}
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

            {/* Nombre */}
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              value={name}
              onChangeText={setName}
              editable={!loading}
            />
            {renderError('name')}

            {/* Apellido */}
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

            {/* Dirección + Ubicación */}
            <View>
              <TextInput
                style={styles.input}
                placeholder="Dirección"
                value={address}
                onChangeText={setAddress}
                editable={!loading}
              />

              <View style={styles.locActionsRow}>
                <TouchableOpacity
                  style={[styles.locationBtn, { flex: 1 }]}
                  onPress={requestLocation}
                  disabled={loading || loadingLocation}
                >
                  {loadingLocation ? (
                    <ActivityIndicator size="small" color="#2196F3" />
                  ) : (
                    <Text style={styles.locationBtnText}>
                      📍 {location ? 'Usar mi ubicación' : 'Ubicación actual'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  style={[styles.locationBtn, { flex: 1 }]}
                  onPress={openMapPicker}
                  disabled={loading}
                >
                  <Text style={styles.locationBtnText}>🗺️ Elegir en el mapa</Text>
                </TouchableOpacity>
              </View>

              {location ? (
                <Text style={styles.coordsHint}>
                  Seleccionado: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </Text>
              ) : null}

              {renderError('address')}
            </View>

            {/* Campos SOLO doctor */}
            {role === 'doctor' && (
              <>
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
                
                <TextInput
                  style={styles.input}
                  placeholder="Número de Junta (CSSP)"
                  value={boardNumber}
                  onChangeText={setBoardNumber}
                  autoCapitalize="characters"
                  editable={!loading}
                />
                {renderError('boardNumber')}

                <TextInput
                  style={styles.input}
                  placeholder="Dirección del consultorio"
                  value={clinicAddress}
                  onChangeText={setClinicAddress}
                  editable={!loading}
                />
                {renderError('clinicAddress')}
              </>
            )}

            {/* Passwords */}
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

      {/* MODAL MAPA + AUTOCOMPLETE (Geoapify) */}
      <Modal
        visible={mapVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMapVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { padding: 0, overflow: 'hidden' }]}>
            {/* Autocomplete simple */}
            <View style={styles.autocompleteWrapper}>
              <TextInput
                style={styles.placesInput}
                placeholder="Buscar dirección o lugar"
                value={placesQuery}
                onChangeText={onChangePlacesQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchingPlaces ? <ActivityIndicator style={{ marginTop: 6 }} /> : null}
              {placesResults.length > 0 && (
                <FlatList
                  keyboardShouldPersistTaps="handled"
                  style={styles.placesList}
                  data={placesResults}
                  keyExtractor={(item, idx) => (item?.properties?.place_id || '') + idx}
                  ItemSeparatorComponent={() => <View style={styles.placesSeparator} />}
                  renderItem={({ item }) => {
                    const title =
                      item?.properties?.address_line1 ||
                      item?.properties?.formatted ||
                      item?.properties?.name ||
                      'Resultado';
                    const subtitle = item?.properties?.address_line2 || '';
                    return (
                      <TouchableOpacity
                        style={styles.placesRow}
                        onPress={() => pickFromPlaces(item)}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600' }}>{title}</Text>
                        {!!subtitle && (
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                            {subtitle}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>

            {/* Info */}
            <View style={styles.mapHeader}>
              <Text style={styles.mapTitle}>Elige una ubicación</Text>
              <Text style={styles.mapHint}>
                Busca un lugar o toca el mapa para colocar el pin (puedes arrastrarlo).
              </Text>
            </View>

            {/* Mapa */}
            <View style={{ height: 320, width: '100%' }}>
              <MapView
                style={{ flex: 1 }}
                provider={PROVIDER_GOOGLE}
                initialRegion={mapRegion}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                onPress={onMapPress}
              >
                {selectedCoord && (
                  <Marker
                    draggable
                    coordinate={selectedCoord}
                    onDragEnd={(e) => setSelectedCoord(e.nativeEvent.coordinate)}
                  />
                )}
              </MapView>
            </View>

            {/* Acciones */}
            <View style={styles.mapActions}>
              <TouchableOpacity
                style={[styles.locationBtn, { flex: 1, backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}
                onPress={() => setMapVisible(false)}
              >
                <Text style={[styles.locationBtnText, { color: '#1976D2' }]}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ width: 8 }} />
              <TouchableOpacity
                style={[styles.locationBtn, { flex: 1, backgroundColor: '#2196F3', borderColor: '#2196F3' }]}
                onPress={confirmMapSelection}
              >
                <Text style={[styles.locationBtnText, { color: '#fff' }]}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  roleActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
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

  // Foto
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

  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  inputWrapper: { position: 'relative', justifyContent: 'center' },
  inputPassword: { paddingRight: 48 },
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

  // Ubicación
  locActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  locationBtn: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#90CAF9',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  locationBtnText: { color: '#1976D2', fontWeight: '600', fontSize: 14 },
  coordsHint: { marginTop: 6, marginLeft: 4, color: '#666' },

  // Botón principal
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

  // Modal base
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

  // Autocomplete (Geoapify)
  autocompleteWrapper: {
    position: 'relative',
    width: '100%',
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  placesInput: {
    backgroundColor: '#fff',
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  placesList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    marginTop: 6,
    maxHeight: 220,
  },
  placesRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  placesSeparator: {
    height: 1,
    backgroundColor: '#eee',
  },

  // Modal mapa
  mapHeader: { paddingHorizontal: 16, paddingTop: 8 },
  mapTitle: { fontSize: 18, fontWeight: '700' },
  mapHint: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 8 },
  mapActions: { flexDirection: 'row', padding: 12 },

  // Modal listas
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  optionItem: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});
