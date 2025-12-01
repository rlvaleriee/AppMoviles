import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Keyboard,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/index';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { uploadImageToCloudinary } from '../services/cloudinaryService';

import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { validateDUIFormat, formatDUI, isDUIRegistered } from '../services/duiService';
import { validatePhoneFormat, formatPhone } from '../services/phoneService';
import { validatePassword } from '../services/passwordService';
import { Ionicons } from '@expo/vector-icons';

const GEOAPIFY_KEY = '18200d83a8c440c2b3421eff1cf14a35';

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

// Profesiones según CONADEM
const PROFESSION_OPTIONS = [
  'DOCTOR(A)EN MEDICINA',
  'LIC. FISIOTERAPIA Y TERAPIA OCUPACIONAL',
  'LIC. EN SALUD MATERNO INFANTIL',
  'LIC. EN NUTRICION Y DIETETICA',
  'LIC. EN ANESTESIOLOGIA E INHALOTERAPIA',
  'LIC. EN RADIOLOGIA E IMÁGENES',
  'TEC. OPTOMETRIA',
  'TEC. EN ORTESIS Y PROTESIS',
  'TECNOLOGO(A) EN RADIOTECNOLOGIA',
  'TECNOLOGO(A) EN FISIOTERAPIA',
  'TECNOLOGO(A) EN ANESTESIOLOGIA',
  'TEC. AUX. AUDIOMETRIA Y AUDIOPROTESIS',
  'TECNOLOGO(A) EN SALUD MATERNO INFANTIL',
  'TERAPIA FISICA',
  'TECNOLOGO(A) EN TERAPIA DE LENGUAJE',
  'TEC. EN TERAPIA OCUPACIONAL',
  'TECNOLOGO(A) EN HIGIENE MATERNAL',
  'TECNOLOGO(A) EN HIGIENE INFANTIL',
  'TERAPIA RESPIRATORIA',
  'TEC. PRACTICO EN AUDIOMETRIA',
  'TEC.) EN SALUD AMBIENTAL',
  'DOCTOR(A) EN QUIROPRACTICO',
  'TEC. PRACTICO EN RAYOS X',
  'TEC. PRACTICO EN MEDICINA NUCLEAR',
  'TEC. EN AUDIOLOGIA',
  'TEC. PRACTICO COBALTO',
  'TEC. FISIATRIA',
  'AUX. EN AUDIOLOGIA',
  'AUX. EN AUDIOPROTESIS',
  'LIC. EN EDUCACION PARA LA SALUD',
  'TECNOLOGO EN RADIOLOGIA E IMAGENES',
  'LIC. EN OPTOMETRIA',
  'LIC. EN SALUD EN TERAPIA FISICA ',
  'LIC. EN SALUD HIGIENE Y EPIDEMIOLOGIA',
  'LIC. EN FONOAUDIOLOGIA',
  'LICENCIADO(A) EN ORTESIS Y PROTESIS',
  'LIC. EN SALUD PERFIL TRAUMATOLOGIA',
  'LICENCIADO(A) EN SALUD AMBIENTAL',
  'QUIROPRACTICO',
  'TEC. ESP. EN ANATOMIA PATOLOGICA',
  'LICENCIADO(A) EN TERAPIA FISICA',
  'LIC. EN FISIOTERAPIA',
  'LIC. EN NUTRICION',
  'MEDICO(A) INTEGRAL COMUNITARIO',
  'INGENIERIA BIOMEDICA',
  'LIC. EN REHABILITACION EN SALUD',
  'TECNOLOGO EN TERAPIA OCUPACIONAL',
  'TEC. EN INGENIERIA BIOMEDICA',
  'TEC. EN EMERGENCIA SANITARIA',
  'LICENCIATURA EN EMERGENCIA PREHOSPITALARIA',
  'LICENCIATURA EN RADIOTERAPIA',
  'DOCTOR(A) EN CIRUGÍA DENTAL',
  'HIGIENISTA',
  'ASISTENTES DENTALES',
  'MECANICO(A) DENTAL',
  'LIC. EN ENFERMERIA',
  'ENFERMERO(A) GRADUADO',
  'AUXILIAR DE ENFERMERIA',
  'TECNICO(A) EN ENFERMERIA',
  'TECNOLOGO(A) EN ENFERMERIA',
  'LIC. EN LABORATORIO CLINICO',
  'TEC. EN LABORATORIO CLINICO',
  'LIC. EN BIO ANALISIS CLINICO',
  'LIC. EN BACTERIOLOGIA Y LABORATORISTA CLINICO',
  'LICENCIADO(A) EN PSICOLOGIA',
  'LIC. EN QUIMICA Y FARMACIA',
  'INGENIERIA QUIMICA',
  'IDONEOS',
  'AUXILIAR DE FARMACIA',
  'DOCTOR(A) EN QUIMICA Y FARMACIA',
  'LIC. EN CIENCIAS QUIMICAS',
  'LIC. EN QUIMICA AGRICOLA',
  'LIC. EN QUIMICA',
  'DOCTOR(A) EN QUIMICA INDUSTRIAL',
  'LIC. EN QUIMICA INDUSTRIAL',
  'MÉDICO(A) VETERINARIO',
  'TECNICO(A) EN MÉDICINA VETERINARIA',
  'Otros (escribir)',
];

// Centro por defecto (San Salvador) 
const DEFAULT_CENTER = { latitude: 13.6929, longitude: -89.2182 };

export default function RegisterScreen({ navigation }) {
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();

  // Sistema de pasos
  const [currentStep, setCurrentStep] = useState(1);

  // Rol
  const [role, setRole] = useState('patient');

  // Campos comunes
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dui, setDui] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Mostrar/ocultar
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Términos y condiciones
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const toggleRole = (nextRole) => {
    setRole(nextRole);
    setErrors({});
    setCurrentStep(1);
    if (nextRole === 'patient') {
      setClinicAddress('');
      setBoard('');
      setProfession('');
      setBoardNumber('');
      setUseOtherBoard(false);
      setCustomBoard('');
      setUseOtherProfession(false);
      setCustomProfession('');
    } else {
      // Si es doctor, limpiar address y DUI porque usará clinicAddress
      setAddress('');
      setDui('');
    }
  };

  // Determinar el número total de pasos
  const getTotalSteps = () => {
    return role === 'patient' ? 3 : 4;
  };

  // Función para validar formato de email
  const isValidEmail = (emailValue) => {
    if (!emailValue || !emailValue.includes('@')) return false;

    // Regex más estricto para validar email
    // Verifica: usuario@dominio.extension
    // La extensión debe ser de 2-6 caracteres (ej: .com, .org, .co, .info)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,6}$/;

    if (!emailRegex.test(emailValue)) return false;

    // Verificar que el dominio no tenga caracteres extraños después de la extensión válida
    const parts = emailValue.split('@');
    if (parts.length !== 2) return false;

    const domain = parts[1].toLowerCase();

    // Lista de extensiones válidas comunes
    const validExtensions = [
      '.com', '.net', '.org', '.edu', '.gov', '.mil',
      '.co', '.io', '.app', '.dev', '.info', '.biz',
      '.sv', '.es', '.mx', '.ar', '.cl', '.pe', '.gt', '.hn', '.ni', '.cr', '.pa',
      '.com.sv', '.edu.sv', '.gob.sv', '.org.sv'
    ];

    // Verificar que termine con una extensión válida
    const hasValidExtension = validExtensions.some(ext => domain.endsWith(ext));

    return hasValidExtension;
  };

  // Validar paso actual
  const validateCurrentStep = () => {
    const newErrors = {};

    if (currentStep === 1) {
      // Paso 1: Información básica
      if (!name.trim()) newErrors.name = 'Nombre requerido';
      if (role === 'doctor' && !lastName.trim()) newErrors.lastName = 'Apellido requerido';
      if (!email.trim()) {
        newErrors.email = 'Email requerido';
      } else if (!isValidEmail(email.trim())) {
        newErrors.email = 'Email inválido. Verifica el formato (ej: usuario@dominio.com)';
      }
      if (!phone.trim()) {
        newErrors.phone = 'Teléfono requerido';
      } else if (!validatePhoneFormat(phone.trim())) {
        newErrors.phone = 'Formato inválido (####-####). Debe iniciar con 2, 6 o 7';
      }
    } else if (currentStep === 2 && role === 'patient') {
      // Paso 2 Paciente: DUI y Dirección
      if (!dui.trim()) {
        newErrors.dui = 'DUI requerido';
      } else if (!validateDUIFormat(dui.trim())) {
        newErrors.dui = 'DUI inválido. Verifica el número y dígito verificador';
      }
      if (!address.trim()) {
        newErrors.address = 'Dirección requerida';
      }
    } else if (currentStep === 2 && role === 'doctor') {
      // Paso 2 Doctor: Información profesional
      const finalBoard = useOtherBoard ? customBoard.trim() : board.trim();
      if (!finalBoard) newErrors.board = 'Junta de Vigilancia requerida';
      if (useOtherBoard && !customBoard.trim()) newErrors.customBoard = 'Escribe la Junta';

      const finalProfession = useOtherProfession ? customProfession.trim() : profession.trim();
      if (!finalProfession) newErrors.profession = 'Profesión requerida';
      if (useOtherProfession && !customProfession.trim())
        newErrors.customProfession = 'Escribe la profesión';

      if (!boardNumber.trim()) newErrors.boardNumber = 'Número de Junta requerido';
      if (boardNumber && !/^[0-9]+$/.test(boardNumber.trim()))
        newErrors.boardNumber = 'Solo se permiten números';
    } else if (currentStep === 3 && role === 'doctor') {
      // Paso 3 Doctor: Dirección del consultorio
      if (!clinicAddress.trim()) newErrors.clinicAddress = 'Dirección de consultorio requerida';
    } else if ((currentStep === 3 && role === 'patient') || (currentStep === 4 && role === 'doctor')) {
      // Último paso: Contraseñas y términos
      if (!password) {
        newErrors.password = 'Contraseña requerida';
      } else {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          newErrors.password = passwordValidation.errors[0]; // Mostrar el primer error
        }
      }
      if (!confirmPassword) newErrors.confirmPassword = 'Confirmar contraseña';
      if (password && confirmPassword && password !== confirmPassword)
        newErrors.confirmPassword = 'Las contraseñas no coinciden';
      if (!acceptedTerms) {
        newErrors.terms = 'Debes aceptar los términos y condiciones';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navegar al siguiente paso
  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setCurrentStep(currentStep + 1);
    setErrors({});
  };

  // Navegar al paso anterior
  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setErrors({});
  };

  // -------- Ubicación actual --------
  const requestLocation = async () => {
    try {
      setLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permisos de ubicación', 'Se requiere acceso a tu ubicación.');
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = currentLocation.coords;
      setLocation({ latitude, longitude });

      // Intentar reverse geocode, pero no es obligatorio
      try {
        const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressData && addressData.length > 0) {
          const addr = addressData[0];
          const formattedAddress = [addr.street, addr.streetNumber, addr.district, addr.city, addr.region]
            .filter(Boolean)
            .join(', ');

          // Actualizar dirección según el rol
          if (formattedAddress) {
            if (role === 'patient') {
              setAddress(formattedAddress);
            } else if (role === 'doctor') {
              setClinicAddress(formattedAddress);
            }
          }
        }
      } catch (geocodeError) {
        // Si falla el reverse geocode, solo mostrar las coordenadas
        const coordText = `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
        if (role === 'patient') {
          setAddress(coordText);
        } else if (role === 'doctor') {
          setClinicAddress(coordText);
        }
      }

      showAlert('Éxito', 'Ubicación obtenida correctamente');
    } catch (error) {
      showAlert('Error', 'No se pudo obtener tu ubicación. Verifica que los permisos estén activados.');
    } finally {
      setLoadingLocation(false);
    }
  };

  // -------- Map Picker --------
  const openMapPicker = () => {
    const center = location || DEFAULT_CENTER;
    setSelectedCoord(center);
    setMapVisible(true);
  };

  const onMapPress = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setSelectedCoord({ latitude, longitude });
  };

  const confirmMapSelection = async () => {
    if (!selectedCoord) {
      showAlert('Mapa', 'Selecciona un punto en el mapa.');
      return;
    }
    try {
      const { latitude, longitude } = selectedCoord;
      setLocation({ latitude, longitude });

      // Intentar reverse geocode, pero no es obligatorio
      try {
        const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressData && addressData.length > 0) {
          const addr = addressData[0];
          const formattedAddress = [addr.street, addr.streetNumber, addr.district, addr.city, addr.region]
            .filter(Boolean)
            .join(', ');

          // Actualizar dirección según el rol
          if (formattedAddress) {
            if (role === 'patient') {
              setAddress((old) => old || formattedAddress);
            } else if (role === 'doctor') {
              setClinicAddress((old) => old || formattedAddress);
            }
          }
        }
      } catch (geocodeError) {
        // Si falla el reverse geocode, solo mostrar las coordenadas
        const coordText = `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
        if (role === 'patient') {
          setAddress((old) => old || coordText);
        } else if (role === 'doctor') {
          setClinicAddress((old) => old || coordText);
        }
      }

      setMapVisible(false);
      showAlert('Listo', 'Ubicación seleccionada correctamente.');
    } catch (err) {
      setMapVisible(false);
      showAlert('Error', 'Hubo un problema al guardar la ubicación. Intenta nuevamente.');
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
      setLocation(coord);
    }
    const formatted = feat?.properties?.formatted || feat?.properties?.address_line1 || '';

    // Actualizar dirección según el rol
    if (formatted) {
      if (role === 'patient') {
        setAddress(formatted);
      } else if (role === 'doctor') {
        setClinicAddress(formatted);
      }
    }

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
      showAlert('Permisos', 'Se requieren permisos para acceder a tus fotos.');
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
      showAlert('Imagen', 'No fue posible abrir el selector de imágenes.');
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = 'Nombre requerido';
    if (!email.trim()) newErrors.email = 'Email requerido';

    // Validar teléfono
    if (!phone.trim()) {
      newErrors.phone = 'Teléfono requerido';
    } else if (!validatePhoneFormat(phone.trim())) {
      newErrors.phone = 'Formato inválido (####-####). Debe iniciar con 2, 6 o 7';
    }

    // Validar dirección y DUI solo para pacientes
    if (role === 'patient') {
      if (!address.trim()) {
        newErrors.address = 'Dirección requerida';
      }

      if (!dui.trim()) {
        newErrors.dui = 'DUI requerido';
      } else if (!validateDUIFormat(dui.trim())) {
        newErrors.dui = 'DUI inválido. Verifica el número y dígito verificador';
      }
    }

    if (!password) {
      newErrors.password = 'Contraseña requerida';
    } else {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        newErrors.password = passwordValidation.errors[0]; // Mostrar el primer error
      }
    }

    if (!confirmPassword) newErrors.confirmPassword = 'Confirmar contraseña';

    if (email && !isValidEmail(email.trim())) {
      newErrors.email = 'Email inválido. Verifica el formato (ej: usuario@dominio.com)';
    }
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
      if (boardNumber && !/^[0-9]+$/.test(boardNumber.trim()))
        newErrors.boardNumber = 'Solo se permiten números';

      if (!clinicAddress.trim()) newErrors.clinicAddress = 'Dirección de consultorio requerida';
    }

    // Validar aceptación de términos
    if (!acceptedTerms) {
      newErrors.terms = 'Debes aceptar los términos y condiciones';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateCurrentStep()) return;

    try {
      setLoading(true);

      // Verificar DUI único para pacientes
      if (role === 'patient' && dui.trim()) {
        const duiExists = await isDUIRegistered(dui.trim());
        if (duiExists) {
          showAlert('DUI ya registrado', 'Este número de DUI ya está asociado a otra cuenta.');
          setLoading(false);
          return;
        }
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const { user } = cred;

      // Subir foto a Cloudinary si existe
      let cloudinaryPhotoUrl = null;
      if (profileUri) {
        try {
          const uploadResult = await uploadImageToCloudinary(profileUri, user.uid);
          cloudinaryPhotoUrl = uploadResult.url;
        } catch (e) {
          showAlert(
            'Aviso',
            'No se pudo subir la foto de perfil, pero tu cuenta fue creada. Puedes agregar una foto después.',
            [{ text: 'Continuar' }]
          );
        }
      }

      // Actualizar perfil Auth
      try {
        const display = lastName.trim() ? `${name.trim()} ${lastName.trim()}` : name.trim();
        await updateProfile(user, { displayName: display, photoURL: cloudinaryPhotoUrl || null });
      } catch {}

      // Guardar en Firestore
      const userDoc = {
        uid: user.uid,
        name: name.trim(),
        lastName: lastName.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        verified: role === 'doctor' ? false : true,
        createdAt: serverTimestamp(),
        photoURL: cloudinaryPhotoUrl || null,
        location: location ? { latitude: location.latitude, longitude: location.longitude } : null,
      };

      // Solo agregar address y DUI para pacientes
      if (role === 'patient') {
        userDoc.address = address.trim();
        userDoc.dui = dui.trim();
      }

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

      // No redirigir manualmente - dejar que el flujo de autenticación tome control
      // El onAuthStateChanged en AuthContext detectará automáticamente el nuevo usuario
      if (role === 'doctor') {
        showAlert(
          'Registro exitoso',
          'Tu cuenta será revisada antes de activarse. Mientras tanto, puedes explorar la aplicación.',
          [{ text: 'Continuar' }]
        );
      } else {
        showAlert(
          'Registro exitoso',
          '¡Bienvenido! Tu cuenta ha sido creada correctamente.',
          [{ text: 'Continuar' }]
        );
      }
      // El usuario será redirigido automáticamente al MainNavigator por el AuthContext
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

      showAlert('Error', msg);
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

  // Renderizar contenido del paso actual
  const renderStepContent = () => {
    if (currentStep === 1) {
      return renderStep1();
    } else if (currentStep === 2 && role === 'patient') {
      return renderStep2Patient();
    } else if (currentStep === 2 && role === 'doctor') {
      return renderStep2Doctor();
    } else if (currentStep === 3 && role === 'doctor') {
      return renderStep3Doctor();
    } else if ((currentStep === 3 && role === 'patient') || (currentStep === 4 && role === 'doctor')) {
      return renderStepFinal();
    }
  };

  // Paso 1: Información básica
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      {/* Foto de perfil (opcional) */}
      <View style={styles.photoRow}>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={pickImage}
          disabled={loading}
        >
          {profileUri ? (
            <Image source={{ uri: profileUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholderSmall}>
              <MaterialCommunityIcons name="camera" size={24} color="#2196F3" />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.photoTextContainer}>
          <Text style={styles.photoLabel}>Foto de perfil</Text>
          <Text style={styles.photoHint}>Opcional · Toca para {profileUri ? 'cambiar' : 'agregar'}</Text>
        </View>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        editable={!loading}
      />
      {renderError('name')}

      <TextInput
            style={styles.input}
            placeholder="Apellido"
            placeholderTextColor="#999"
            value={lastName}
            onChangeText={setLastName}
            editable={!loading}
      />
      {renderError('lastName')}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
      {renderError('email')}

      {/* Nota informativa sobre el email */}
      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={18} color="#2196F3" />
        <Text style={styles.infoNoteText}>
          Este correo se utilizará para recuperar tu cuenta si olvidas la contraseña
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Teléfono "
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => setPhone(formatPhone(text))}
        keyboardType="number-pad"
        maxLength={9}
        editable={!loading}
      />
      {renderError('phone')}
    </View>
  );

  // Paso 2 Paciente: DUI y Dirección
  const renderStep2Patient = () => (
    <View style={styles.stepContainer}>
      <TextInput
        style={styles.input}
        placeholder="DUI "
        placeholderTextColor="#999"
        value={dui}
        onChangeText={(text) => setDui(formatDUI(text))}
        keyboardType="number-pad"
        maxLength={10}
        editable={!loading}
      />
      {renderError('dui')}

      <TextInput
        style={styles.input}
        placeholder="Dirección"
        placeholderTextColor="#999"
        value={address}
        onChangeText={setAddress}
        editable={!loading}
      />

      <View style={styles.locationButtonsRow}>
        <TouchableOpacity
          style={[styles.locationBtnSmall, { flex: 1 }]}
          onPress={requestLocation}
          disabled={loading || loadingLocation}
        >
          {loadingLocation ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#2196F3" />
              <Text style={styles.locationBtnSmallText}>Mi ubicación</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ width: 12 }} />

        <TouchableOpacity
          style={[styles.locationBtnSmall, { flex: 1 }]}
          onPress={openMapPicker}
          disabled={loading}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color="#2196F3" />
          <Text style={styles.locationBtnSmallText}>Elegir en mapa</Text>
        </TouchableOpacity>
      </View>

      {location && (
        <Text style={styles.locationHint}>
          📍 Ubicación guardada
        </Text>
      )}

      {renderError('address')}
    </View>
  );

  // Paso 2 Doctor: Información profesional
  const renderStep2Doctor = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Información profesional</Text>

      <Text style={styles.label}>Junta de Vigilancia</Text>
      <TouchableOpacity
        style={[styles.input, styles.selectInput]}
        onPress={() => setBoardModalVisible(true)}
        disabled={loading}
      >
        <Text style={board ? styles.selectText : styles.selectPlaceholder}>
          {useOtherBoard && customBoard ? customBoard : board || 'Selecciona la Junta'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={24} color="#999" />
      </TouchableOpacity>
      {renderError('board')}

      {useOtherBoard && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Escribe la Junta"
            placeholderTextColor="#999"
            value={customBoard}
            onChangeText={setCustomBoard}
            editable={!loading}
          />
          {renderError('customBoard')}
        </>
      )}

      <Text style={styles.label}>Profesión</Text>
      <TouchableOpacity
        style={[styles.input, styles.selectInput]}
        onPress={() => setProfessionModalVisible(true)}
        disabled={loading}
      >
        <Text style={profession ? styles.selectText : styles.selectPlaceholder}>
          {useOtherProfession && customProfession
            ? customProfession
            : profession || 'Selecciona la profesión'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={24} color="#999" />
      </TouchableOpacity>
      {renderError('profession')}

      {useOtherProfession && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Escribe la profesión"
            placeholderTextColor="#999"
            value={customProfession}
            onChangeText={setCustomProfession}
            editable={!loading}
          />
          {renderError('customProfession')}
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Número de Junta (CSSP)"
        placeholderTextColor="#999"
        value={boardNumber}
        onChangeText={(text) => setBoardNumber(text.replace(/[^0-9]/g, ''))}
        keyboardType="numeric"
        editable={!loading}
      />
      {renderError('boardNumber')}
    </View>
  );

  // Paso 3 Doctor: Dirección del consultorio
  const renderStep3Doctor = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Dirección del consultorio</Text>

      <TextInput
        style={styles.input}
        placeholder="Dirección del consultorio"
        placeholderTextColor="#999"
        value={clinicAddress}
        onChangeText={setClinicAddress}
        editable={!loading}
      />

      <View style={styles.locationButtonsRow}>
        <TouchableOpacity
          style={[styles.locationBtnSmall, { flex: 1 }]}
          onPress={requestLocation}
          disabled={loading || loadingLocation}
        >
          {loadingLocation ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#2196F3" />
              <Text style={styles.locationBtnSmallText}>Mi ubicación</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ width: 12 }} />

        <TouchableOpacity
          style={[styles.locationBtnSmall, { flex: 1 }]}
          onPress={openMapPicker}
          disabled={loading}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color="#2196F3" />
          <Text style={styles.locationBtnSmallText}>Elegir en mapa</Text>
        </TouchableOpacity>
      </View>

      {location && (
        <Text style={styles.locationHint}>
          📍 Ubicación guardada
        </Text>
      )}

      {renderError('clinicAddress')}
    </View>
  );

  // Validación en tiempo real de requisitos de contraseña
  const passwordRequirements = {
    minLength: password.length >= 8,
    hasUpperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumberOrSpecial: /[0-9]/.test(password) || /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(password),
  };

  // Paso final: Contraseñas y términos
  const renderStepFinal = () => (
    <View style={styles.stepContainer}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, styles.inputPassword]}
          placeholder="Contraseña"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((v) => !v)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={showPassword ? 'eye-off' : 'eye'}
            size={22}
            color="#2196F3"
          />
        </TouchableOpacity>
      </View>
      {renderError('password')}

      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, styles.inputPassword]}
          placeholder="Confirmar contraseña"
          placeholderTextColor="#999"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowConfirm((v) => !v)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={showConfirm ? 'eye-off' : 'eye'}
            size={22}
            color="#2196F3"
          />
        </TouchableOpacity>
      </View>
      {renderError('confirmPassword')}

      {/* Requisitos de contraseña con validación en tiempo real */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Requisitos de contraseña</Text>
        <View style={styles.tip}>
          <Ionicons
            name={passwordRequirements.minLength ? "checkmark-circle" : "ellipse-outline"}
            size={18}
            color={passwordRequirements.minLength ? "#10B981" : "#9CA3AF"}
          />
          <Text style={[
            styles.tipText,
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
            styles.tipText,
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
            styles.tipText,
            passwordRequirements.hasNumberOrSpecial && styles.tipTextMet
          ]}>Incluye números o caracteres especiales</Text>
        </View>
        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
          <Text style={styles.tipText}>No uses información personal obvia</Text>
        </View>
      </View>

      <View style={styles.termsContainer}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAcceptedTerms(!acceptedTerms)}
          disabled={loading}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && (
              <MaterialCommunityIcons name="check" size={18} color="#fff" />
            )}
          </View>
          <Text style={styles.termsText}>
            Acepto los{' '}
            <Text
              style={styles.termsLink}
              onPress={() => setTermsModalVisible(true)}
            >
              términos y condiciones de uso
            </Text>
          </Text>
        </TouchableOpacity>
        {renderError('terms')}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          keyboardHeight > 0 && Platform.OS === 'android' && { paddingBottom: keyboardHeight }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Header compacto */}
          <View style={styles.headerCompact}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Selección de Rol */}
            <View style={styles.roleContainerCompact}>
              <TouchableOpacity
                style={[styles.roleBtnCompact, role === 'patient' && styles.roleBtnCompactActive]}
                onPress={() => toggleRole('patient')}
                disabled={loading}
              >
                <Text style={[styles.roleTextCompact, role === 'patient' && styles.roleTextCompactActive]}>
                  Paciente
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleBtnCompact, role === 'doctor' && styles.roleBtnCompactActive]}
                onPress={() => toggleRole('doctor')}
                disabled={loading}
              >
                <Text style={[styles.roleTextCompact, role === 'doctor' && styles.roleTextCompactActive]}>
                  Médico
                </Text>
              </TouchableOpacity>
            </View>

            {/* Indicador de pasos */}
            <View style={styles.stepsIndicator}>
              {Array.from({ length: getTotalSteps() }, (_, i) => i + 1).map((step) => (
                <View key={step} style={styles.stepIndicatorContainer}>
                  <View style={[
                    styles.stepDot,
                    currentStep >= step && styles.stepDotActive
                  ]} />
                  {step < getTotalSteps() && (
                    <View style={[
                      styles.stepLine,
                      currentStep > step && styles.stepLineActive
                    ]} />
                  )}
                </View>
              ))}
            </View>

            <Text style={styles.stepIndicatorText}>
              Paso {currentStep} de {getTotalSteps()}
            </Text>
          </View>

          <View style={styles.formCompact}>
            {/* Renderizar contenido del paso actual */}
            {renderStepContent()}

            {/* Botones de navegación */}
            <View style={styles.navigationButtons}>
              {currentStep > 1 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonBack]}
                  onPress={handleBack}
                  disabled={loading}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color="#2196F3" />
                  <Text style={styles.navButtonBackText}>Atrás</Text>
                </TouchableOpacity>
              )}

              {currentStep < getTotalSteps() ? (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonNext, currentStep === 1 && { flex: 1 }]}
                  onPress={handleNext}
                  disabled={loading}
                >
                  <Text style={styles.navButtonNextText}>Siguiente</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonNext]}
                  onPress={handleRegister}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.navButtonNextText}>Crear cuenta</Text>
                      <MaterialCommunityIcons name="check" size={20} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Login')} disabled={loading}>
              <Text style={styles.loginText}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* MODAL Términos y Condiciones */}
      {termsModalVisible && (
        <Modal
          visible={termsModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setTermsModalVisible(false)}
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Términos y Condiciones de Uso</Text>

              <ScrollView
                style={styles.termsScrollView}
                removeClippedSubviews={true}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.termsContent}>
                {'\n'}
                <Text style={styles.termsHeading}>1. Aceptación de los Términos</Text>
                {'\n\n'}
                Al registrarte y utilizar esta aplicación, aceptas cumplir con estos términos y condiciones de uso. Si no estás de acuerdo con estos términos, no debes usar la aplicación.
                {'\n\n'}
                <Text style={styles.termsHeading}>2. Uso de la Aplicación</Text>
                {'\n\n'}
                Esta aplicación está diseñada para facilitar la comunicación entre pacientes y profesionales de la salud. El uso de la aplicación debe ser exclusivamente para fines médicos y de salud legítimos.
                {'\n\n'}
                <Text style={styles.termsHeading}>3. Privacidad y Protección de Datos</Text>
                {'\n\n'}
                • Tus datos personales serán tratados de manera confidencial.
                {'\n'}
                • La información médica compartida está protegida según las leyes de privacidad vigentes.
                {'\n'}
                • No compartiremos tu información personal con terceros sin tu consentimiento.
                {'\n\n'}
                <Text style={styles.termsHeading}>4. Responsabilidades del Usuario</Text>
                {'\n\n'}
                • Proporcionar información veraz y actualizada.
                {'\n'}
                • Mantener la confidencialidad de tu cuenta.
                {'\n'}
                • No usar la aplicación para fines ilegales o no autorizados.
                {'\n'}
                • Respetar a otros usuarios y profesionales de la salud.
                {'\n\n'}
                <Text style={styles.termsHeading}>5. Verificación de Profesionales</Text>
                {'\n\n'}
                Los médicos y profesionales de la salud deben registrarse con su información de Junta de Vigilancia (CSSP). Todas las cuentas de profesionales serán verificadas antes de ser activadas.
                {'\n\n'}
                <Text style={styles.termsHeading}>6. Limitación de Responsabilidad</Text>
                {'\n\n'}
                La aplicación es una herramienta de facilitación y no sustituye la atención médica profesional. Los usuarios son responsables de sus decisiones médicas.
                {'\n\n'}
                <Text style={styles.termsHeading}>7. Modificaciones</Text>
                {'\n\n'}
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados a través de la aplicación.
                {'\n\n'}
                <Text style={styles.termsHeading}>8. Contacto</Text>
                {'\n\n'}
                Para consultas o inquietudes sobre estos términos, puedes contactarnos a través de la aplicación.
                {'\n\n'}
              </Text>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
              <TouchableOpacity
                onPress={() => setTermsModalVisible(false)}
                style={[styles.photoBtn, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}
              >
                <Text style={{ fontWeight: '600', color: '#1976D2' }}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setAcceptedTerms(true);
                  setTermsModalVisible(false);
                }}
                style={[styles.photoBtn, { backgroundColor: '#2196F3', borderColor: '#2196F3' }]}
              >
                <Text style={{ fontWeight: '600', color: '#fff' }}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </Modal>
      )}

      {/* MODAL Junta de Vigilancia */}
      {role === 'doctor' && (
        <Modal
          visible={boardModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setBoardModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '90%' }]}>
                <Text style={styles.modalTitle}>Seleccionar Junta</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Filtrar..."
                  placeholderTextColor="#808080"
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
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '90%' }]}>
                <Text style={styles.modalTitle}>Seleccionar profesión</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Filtrar..."
                  placeholderTextColor="#808080"
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
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* MODAL Términos y Condiciones */}
      {termsModalVisible && (
        <Modal
          visible={termsModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setTermsModalVisible(false)}
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Términos y Condiciones de Uso</Text>

              <ScrollView
                style={styles.termsScrollView}
                removeClippedSubviews={true}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.termsContent}>
                {'\n'}
                <Text style={styles.termsHeading}>1. Aceptación de los Términos</Text>
                {'\n\n'}
                Al registrarte y utilizar esta aplicación, aceptas cumplir con estos términos y condiciones de uso. Si no estás de acuerdo con estos términos, no debes usar la aplicación.
                {'\n\n'}
                <Text style={styles.termsHeading}>2. Uso de la Aplicación</Text>
                {'\n\n'}
                Esta aplicación está diseñada para facilitar la comunicación entre pacientes y profesionales de la salud. El uso de la aplicación debe ser exclusivamente para fines médicos y de salud legítimos.
                {'\n\n'}
                <Text style={styles.termsHeading}>3. Privacidad y Protección de Datos</Text>
                {'\n\n'}
                • Tus datos personales serán tratados de manera confidencial.
                {'\n'}
                • La información médica compartida está protegida según las leyes de privacidad vigentes.
                {'\n'}
                • No compartiremos tu información personal con terceros sin tu consentimiento.
                {'\n\n'}
                <Text style={styles.termsHeading}>4. Responsabilidades del Usuario</Text>
                {'\n\n'}
                • Proporcionar información veraz y actualizada.
                {'\n'}
                • Mantener la confidencialidad de tu cuenta.
                {'\n'}
                • No usar la aplicación para fines ilegales o no autorizados.
                {'\n'}
                • Respetar a otros usuarios y profesionales de la salud.
                {'\n\n'}
                <Text style={styles.termsHeading}>5. Verificación de Profesionales</Text>
                {'\n\n'}
                Los médicos y profesionales de la salud deben registrarse con su información de Junta de Vigilancia (CSSP). Todas las cuentas de profesionales serán verificadas antes de ser activadas.
                {'\n\n'}
                <Text style={styles.termsHeading}>6. Limitación de Responsabilidad</Text>
                {'\n\n'}
                La aplicación es una herramienta de facilitación y no sustituye la atención médica profesional. Los usuarios son responsables de sus decisiones médicas.
                {'\n\n'}
                <Text style={styles.termsHeading}>7. Modificaciones</Text>
                {'\n\n'}
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados a través de la aplicación.
                {'\n\n'}
                <Text style={styles.termsHeading}>8. Contacto</Text>
                {'\n\n'}
                Para consultas o inquietudes sobre estos términos, puedes contactarnos a través de la aplicación.
                {'\n\n'}
              </Text>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
              <TouchableOpacity
                onPress={() => setTermsModalVisible(false)}
                style={[styles.photoBtn, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}
              >
                <Text style={{ fontWeight: '600', color: '#1976D2' }}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setAcceptedTerms(true);
                  setTermsModalVisible(false);
                }}
                style={[styles.photoBtn, { backgroundColor: '#2196F3', borderColor: '#2196F3' }]}
              >
                <Text style={{ fontWeight: '600', color: '#fff' }}>Aceptar</Text>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { padding: 0, overflow: 'hidden', maxHeight: '90%' }]}>
              {/* Autocomplete simple */}
              <View style={styles.autocompleteWrapper}>
                <TextInput
                  style={styles.placesInput}
                  placeholder="Buscar dirección o lugar"
                  placeholderTextColor="#808080"
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

              <View style={{ height: 320, width: '100%' }}>
                <MapView
                  style={{ flex: 1 }}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude: selectedCoord?.latitude || DEFAULT_CENTER.latitude,
                    longitude: selectedCoord?.longitude || DEFAULT_CENTER.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  onPress={onMapPress}
                >
                  {selectedCoord && (
                    <Marker
                      coordinate={{
                        latitude: selectedCoord.latitude,
                        longitude: selectedCoord.longitude,
                      }}
                      draggable
                      onDragEnd={(event) => {
                        const { latitude, longitude } = event.nativeEvent.coordinate;
                        setSelectedCoord({ latitude, longitude });
                      }}
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
        </KeyboardAvoidingView>
      </Modal>

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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
  },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
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

  label: {
    marginLeft: 2,
    marginBottom: 8,
    color: '#374151',
    fontWeight: '600',
    fontSize: 15,
  },

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
    marginBottom: 32,
    marginTop: 16,
  },
  footerText: { color: '#6B7280', fontSize: 15 },
  loginText: { color: '#2196F3', fontSize: 15, fontWeight: '700' },

  errorText: {
    color: '#EF4444',
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '500',
  },

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
    color: '#000',
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

  // Términos y condiciones elegantes
  termsContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  termsLink: {
    color: '#2196F3',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  termsScrollView: {
    maxHeight: 400,
    marginVertical: 12,
  },
  termsContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  termsHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1976D2',
  },

  // Nuevo diseño moderno con pasos
  headerCompact: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  logoContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  roleContainerCompact: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 30,
    padding: 4,
    marginBottom: 20,
  },
  roleBtnCompact: {
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 26,
  },
  roleBtnCompactActive: {
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  roleTextCompact: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  roleTextCompactActive: {
    color: '#fff',
  },

  // Indicador de pasos elegante
  stepsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  stepDotActive: {
    backgroundColor: '#2196F3',
    width: 32,
    height: 8,
    borderRadius: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: '#2196F3',
  },
  stepIndicatorText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 4,
  },

  // Formulario elegante
  formCompact: {
    flex: 1,
    paddingHorizontal: 4,
  },
  stepContainer: {
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
    textAlign: 'left',
    letterSpacing: -0.3,
  },

  // Foto de perfil compacta y horizontal
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginRight: 16,
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  avatarPlaceholderSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#90CAF9',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTextContainer: {
    flex: 1,
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  photoHint: {
    fontSize: 13,
    color: '#6B7280',
  },

  // Botones de ubicación modernos
  locationButtonsRow: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 10,
    gap: 10,
  },
  locationBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  locationBtnSmallText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  locationHint: {
    fontSize: 13,
    color: '#10B981',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Select inputs mejorados
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  selectText: {
    color: '#1A1A1A',
    fontSize: 16,
    flex: 1,
  },
  selectPlaceholder: {
    color: '#9CA3AF',
    fontSize: 16,
    flex: 1,
  },

  // Botones de navegación premium
  navigationButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  navButtonBack: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  navButtonBackText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '700',
  },
  navButtonNext: {
    backgroundColor: '#2196F3',
    borderWidth: 0,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  navButtonNextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Consejos de seguridad
  tipsSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  tipTextMet: {
    color: '#10B981',
    fontWeight: '500',
  },

  // Nota informativa
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
});
