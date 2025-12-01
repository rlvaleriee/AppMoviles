import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { updateEmail } from 'firebase/auth';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { getUserById, saveUserProfile } from '../services/firestore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { validatePhoneFormat, formatPhone } from '../services/phoneService';
import { uploadImageToCloudinary } from '../services/cloudinaryService';

export default function ProfileScreen({ navigation }) {
  const { firebaseUser, currentUserData, refreshUserData } = useAuth();
  const { colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [imageKey, setImageKey] = useState(Date.now()); // Para forzar recarga de imagen

  // Estado para el modal de ubicación
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempLocation, setTempLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Estado para búsqueda de ubicaciones
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const mapRef = React.useRef(null);

  // Cargar perfil desde Firestore
  useEffect(() => {
    (async () => {
      if (!firebaseUser?.uid) return;
      try {
        setLoading(true);
        const data = await getUserById(firebaseUser.uid);
        setForm(data || { role: 'patient' });
      } catch (e) {
        showAlert('Error', e?.message || 'No se pudo cargar el perfil');
      } finally {
        setLoading(false);
      }
    })();
  }, [firebaseUser?.uid]);

  const isDoctor = form?.role === 'doctor';

  // Estilos dinámicos
  const dynamicStyles = {
    container: {
      ...styles.containerMain,
      backgroundColor: colors.background,
    },
    center: {
      ...styles.center,
      backgroundColor: colors.background,
    },
    header: {
      ...styles.header,
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.headerBorder,
    },
    scrollView: {
      ...styles.scrollView,
      backgroundColor: colors.background,
    },
    section: {
      ...styles.section,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    label: {
      ...styles.label,
      color: colors.textSecondary,
    },
    input: {
      ...styles.input,
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      color: colors.inputText,
    },
    inputDisabled: {
      ...styles.inputDisabled,
      backgroundColor: colors.inputBackground,
      color: colors.textLight,
    },
    toggle: {
      ...styles.toggle,
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
    },
    toggleText: {
      ...styles.toggleText,
      color: colors.textSecondary,
    },
    locationButton: {
      ...styles.locationButton,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
    },
    locationButtonText: {
      ...styles.locationButtonText,
      color: colors.text,
    },
    locationCoordinates: {
      ...styles.locationCoordinates,
      color: colors.textSecondary,
    },
  };

  const requestMediaPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso requerido', 'Necesitamos acceso a tus fotos para actualizar el perfil.');
      return false;
    }
    return true;
  };

  const MEDIA_TYPES =
    ImagePicker.MediaType ? [ImagePicker.MediaType.Image] : ImagePicker.MediaTypeOptions.Images;

  const showPhotoOptions = () => {
    setShowPhotoModal(true);
  };

  const handleChangePhoto = () => {
    setShowPhotoModal(false);
    setTimeout(() => pickImage(), 300);
  };

  const handleDeletePhoto = () => {
    setShowPhotoModal(false);
    setTimeout(() => deleteProfilePhoto(), 300);
  };

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

      await uploadProfilePhoto(uri);
    } catch (err) {
      showAlert('Error', err?.message || 'No se pudo abrir la galería');
    }
  };

  const uploadProfilePhoto = async (uri) => {
    if (!firebaseUser?.uid) {
      showAlert('Error', 'Usuario no autenticado.');
      return;
    }

    try {
      setUploadingPhoto(true);

      // Subir imagen a Cloudinary
      const uploadResult = await uploadImageToCloudinary(uri, firebaseUser.uid);
      const cloudinaryUrl = uploadResult.url;

      // Actualizar Firestore con la URL de Cloudinary
      await saveUserProfile(firebaseUser.uid, { photoURL: cloudinaryUrl });

      // Actualizar estado local
      setForm((prev) => ({
        ...prev,
        photoURL: cloudinaryUrl,
      }));

      // Forzar recarga de la imagen cambiando la key
      setImageKey(Date.now());

      // Refrescar datos del usuario en el contexto
      await refreshUserData();

      showAlert('Foto actualizada', 'Tu foto de perfil se actualizó correctamente.');
    } catch (e) {
      showAlert('Error al guardar', e?.message || 'No se pudo guardar la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deleteProfilePhoto = async () => {
    showAlert(
      'Eliminar foto',
      '¿Estás seguro de que deseas eliminar tu foto de perfil?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploadingPhoto(true);

              // Actualizar Firestore (establecer photoURL a null)
              await saveUserProfile(firebaseUser.uid, { photoURL: null });

              // Actualizar estado local
              setForm((prev) => ({
                ...prev,
                photoURL: null,
              }));

              // Forzar recarga de la imagen
              setImageKey(Date.now());

              // Refrescar datos del usuario en el contexto
              await refreshUserData();

              showAlert('Foto eliminada', 'Tu foto de perfil se eliminó correctamente.');
            } catch (e) {
              showAlert('Error', 'No se pudo eliminar la foto');
            } finally {
              setUploadingPhoto(false);
            }
          },
        },
      ]
    );
  };

  // Funciones para manejo de ubicación
  const requestLocationPermissions = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso requerido', 'Necesitamos acceso a tu ubicación para actualizar tu ubicación en el mapa.');
      return false;
    }
    return true;
  };

  const handleOpenLocationPicker = async () => {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) return;

    setLoadingLocation(true);

    // Obtener ubicación actual o usar la guardada
    let initialLocation = form?.location || null;

    // Si no hay ubicación guardada, intentar obtener la ubicación actual
    if (!initialLocation) {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        initialLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      } catch (error) {
        // Si no se puede obtener ubicación actual, usar San Salvador como default
        initialLocation = {
          latitude: 13.6929,
          longitude: -89.2182,
        };
      }
    }

    setTempLocation(initialLocation);
    setLoadingLocation(false);
    setShowLocationModal(true);
  };

  const handleSaveLocation = async () => {
    if (!tempLocation) {
      showAlert('Error', 'No se ha seleccionado una ubicación');
      return;
    }

    try {
      // Obtener la dirección usando geocodificación inversa
      const GEOAPIFY_KEY = '18200d83a8c440c2b3421eff1cf14a35';
      const url =
        `https://api.geoapify.com/v1/geocode/reverse?lat=${tempLocation.latitude}&lon=${tempLocation.longitude}` +
        `&lang=es&apiKey=${GEOAPIFY_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      let addressText = '';
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        // Usar la dirección formateada o construir una
        addressText = feature.properties.formatted ||
                     feature.properties.address_line1 ||
                     `${tempLocation.latitude.toFixed(6)}, ${tempLocation.longitude.toFixed(6)}`;
      }

      // Actualizar el form con la ubicación y la dirección
      const updatedForm = {
        ...form,
        location: tempLocation,
      };

      // Actualizar el campo de dirección según el tipo de usuario
      if (isDoctor) {
        updatedForm.clinicAddress = addressText;
      } else {
        updatedForm.address = addressText;
      }

      setForm(updatedForm);
      setShowLocationModal(false);
      showAlert('Ubicación actualizada', 'La dirección se actualizó automáticamente. Recuerda guardar los cambios.');
    } catch (error) {
      // Si falla, solo guardar la ubicación sin actualizar la dirección
      setForm({
        ...form,
        location: tempLocation,
      });
      setShowLocationModal(false);
      showAlert('Ubicación actualizada', 'Recuerda guardar los cambios para que se apliquen.');
    }
  };

  const handleMapPress = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setTempLocation({ latitude, longitude });
  };

  const handleGetCurrentLocation = async () => {
    try {
      setLoadingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setTempLocation(newLocation);

      // Animar el mapa a la ubicación actual
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
    } catch (error) {
      showAlert('Error', 'No se pudo obtener tu ubicación actual. Verifica que los permisos de ubicación estén activados.');
    } finally {
      setLoadingLocation(false);
    }
  };

  // Función para buscar ubicaciones con Geoapify (autocomplete)
  const searchLocation = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchingLocation(true);
      const GEOAPIFY_KEY = '18200d83a8c440c2b3421eff1cf14a35';

      // Agregar bias si ya hay una ubicación temporal para mejorar resultados
      const bias = tempLocation
        ? `&bias=proximity:${tempLocation.longitude},${tempLocation.latitude}`
        : '';

      const url =
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}` +
        `&limit=6&lang=es&filter=countrycode:sv${bias}&apiKey=${GEOAPIFY_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && Array.isArray(data.features)) {
        const results = data.features.map((feature) => ({
          name: feature.properties.formatted || feature.properties.address_line1 || '',
          address: feature.properties.address_line1 || feature.properties.formatted || '',
          city: feature.properties.city || '',
          latitude: feature.geometry.coordinates[1],
          longitude: feature.geometry.coordinates[0],
          feature: feature, // Guardar el feature completo por si se necesita
        }));
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      setSearchResults([]);
    } finally {
      setSearchingLocation(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    const newLocation = {
      latitude: result.latitude,
      longitude: result.longitude,
    };

    setTempLocation(newLocation);
    setSearchQuery('');
    setSearchResults([]);

    // Animar el mapa a la nueva ubicación
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: newLocation.latitude,
        longitude: newLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  // Debounce para la búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchLocation(searchQuery.trim());
      } else {
        setSearchResults([]);
      }
    }, 350); // 350ms como en RegisterScreen

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (loading || !form) {
    return (
      <View style={dynamicStyles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={{ marginTop: 8, color: colors.textSecondary }}>Cargando perfil…</Text>
      </View>
    );
  }

  const onSave = async () => {
    try {
      // Validar teléfono antes de guardar
      if (form.phone && !validatePhoneFormat(form.phone)) {
        showAlert(
          'Teléfono inválido',
          'El formato del teléfono debe ser ####-#### y comenzar con 2, 6 o 7'
        );
        return;
      }

      // Validar email
      if (form.email && !form.email.includes('@')) {
        showAlert('Email inválido', 'Por favor ingresa un email válido');
        return;
      }

      setSaving(true);

      // Si el email cambió, actualizar en Firebase Auth
      const emailChanged = form.email && form.email !== firebaseUser.email;
      if (emailChanged) {
        try {
          await updateEmail(firebaseUser, form.email.trim());
        } catch (emailError) {
          // Errores comunes de Firebase Auth
          if (emailError.code === 'auth/email-already-in-use') {
            showAlert('Email en uso', 'Este correo electrónico ya está siendo utilizado por otra cuenta.');
            setSaving(false);
            return;
          } else if (emailError.code === 'auth/requires-recent-login') {
            showAlert(
              'Sesión expirada',
              'Para cambiar tu email necesitas cerrar sesión y volver a iniciarla. ¿Deseas continuar?',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar sesión', onPress: async () => {
                  // El usuario deberá volver a iniciar sesión
                  setSaving(false);
                }},
              ]
            );
            setSaving(false);
            return;
          } else if (emailError.code === 'auth/invalid-email') {
            showAlert('Email inválido', 'El formato del email no es válido.');
            setSaving(false);
            return;
          } else {
            throw emailError;
          }
        }
      }

      // Actualizar Firestore
      await saveUserProfile(firebaseUser.uid, {
        name: form.name || '',
        lastName: form.lastName || null,
        phone: form.phone || null,
        email: form.email || null,
        photoURL: form.photoURL || null,
        address: isDoctor ? null : form.address || null,
        specialty: isDoctor ? form.specialty || null : null,
        clinicAddress: isDoctor ? form.clinicAddress || null : null,
        acceptsNewPatients: isDoctor ? !!form.acceptsNewPatients : null,
        location: form.location ? form.location : null,
        role: form.role || 'patient',
      });

      await refreshUserData();

      showAlert('Listo', 'Perfil actualizado correctamente');
    } catch (e) {
      showAlert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const avatarUri = form.photoURL || currentUserData?.photoURL || null;

  return (
    <>
      {/* Modal de opciones de foto */}
      <Modal
        visible={showPhotoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPhotoModal(false)}
          activeOpacity={1}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="image" size={24} color="#2196F3" />
              <Text style={styles.modalTitle}>Foto de perfil</Text>
            </View>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleChangePhoto}
              activeOpacity={0.7}
            >
              <View style={styles.modalOptionIcon}>
                <Ionicons name="camera" size={22} color="#2196F3" />
              </View>
              <Text style={styles.modalOptionText}>
                {avatarUri ? 'Cambiar foto' : 'Seleccionar foto'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {avatarUri && (
              <TouchableOpacity
                style={styles.modalOption}
                onPress={handleDeletePhoto}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIcon, styles.modalOptionIconDanger]}>
                  <Ionicons name="trash" size={22} color="#F44336" />
                </View>
                <Text style={[styles.modalOptionText, styles.modalOptionTextDanger]}>
                  Eliminar foto
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowPhotoModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Modal de selección de ubicación */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.locationModalContainer}>
          {/* Header del modal */}
          <View style={styles.locationModalHeader}>
            <TouchableOpacity
              style={styles.locationModalCloseButton}
              onPress={() => setShowLocationModal(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.locationModalTitle}>Selecciona tu ubicación</Text>
            <TouchableOpacity
              style={styles.locationModalSaveButton}
              onPress={handleSaveLocation}
            >
              <Ionicons name="checkmark" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Barra de búsqueda */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar dirección, ciudad, lugar..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchingLocation && (
                <ActivityIndicator size="small" color="#2196F3" />
              )}
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  style={styles.clearSearchButton}
                >
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {/* Resultados de búsqueda */}
            {searchResults.length > 0 && (
              <View style={styles.searchResultsContainer}>
                <ScrollView
                  style={styles.searchResultsList}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                >
                  {searchResults.map((result, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectSearchResult(result)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location" size={20} color="#2196F3" />
                      <View style={styles.searchResultTextContainer}>
                        <Text style={styles.searchResultName} numberOfLines={1}>
                          {result.name}
                        </Text>
                        {result.city && (
                          <Text style={styles.searchResultCity} numberOfLines={1}>
                            {result.city}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#999" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Instrucciones */}
          <View style={styles.locationInstructions}>
            <Ionicons name="information-circle" size={20} color="#2196F3" />
            <Text style={styles.locationInstructionsText}>
              Busca una dirección o toca en el mapa para seleccionar la ubicación
            </Text>
          </View>

          {/* Mapa */}
          {loadingLocation ? (
            <View style={styles.locationLoadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.locationLoadingText}>Cargando ubicación...</Text>
            </View>
          ) : tempLocation ? (
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                  latitude: tempLocation.latitude,
                  longitude: tempLocation.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                onPress={handleMapPress}
              >
                {tempLocation && (
                  <Marker
                    coordinate={tempLocation}
                    title={isDoctor ? "Mi consultorio" : "Mi ubicación"}
                    description="Ubicación seleccionada"
                    pinColor="#2196F3"
                  />
                )}
              </MapView>

              {/* Botón flotante para obtener ubicación actual */}
              <TouchableOpacity
                style={styles.currentLocationButton}
                onPress={handleGetCurrentLocation}
                activeOpacity={0.8}
              >
                <Ionicons name="locate" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Coordenadas seleccionadas */}
          {tempLocation && (
            <View style={styles.locationCoordinatesDisplay}>
              <Ionicons name="location" size={20} color="#2196F3" />
              <Text style={styles.locationCoordinatesDisplayText}>
                Lat: {tempLocation.latitude.toFixed(6)}, Lng: {tempLocation.longitude.toFixed(6)}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={dynamicStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header fijo */}
        <View style={dynamicStyles.header}>
          <View style={styles.headerContent}>
            {/* Botón de atrás a la izquierda */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Avatar */}
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={showPhotoOptions}
              activeOpacity={0.7}
            >
              {avatarUri ? (
                <Image
                  key={imageKey}
                  source={{ uri: avatarUri }}
                  style={styles.avatar}
                  cache="reload"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color="#2196F3" />
                </View>
              )}

              {/* Indicador de que se puede editar */}
              <View style={styles.editPhotoIndicator}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            {/* Nombre y badge */}
            <View style={styles.headerText}>
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
        </View>

        {/* Contenido scrolleable */}
        <ScrollView
          style={dynamicStyles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

        {/* Información del perfil */}
        <View style={dynamicStyles.section}>
        <Text style={dynamicStyles.sectionTitle}>
          {isDoctor ? 'Información de Perfil' : 'Información Personal'}
        </Text>

        <View style={styles.fieldContainer}>
          <Text style={dynamicStyles.label}>Nombre</Text>
          <TextInput
            style={dynamicStyles.input}
            placeholder="Ingresa tu nombre"
            placeholderTextColor={colors.placeholder}
            value={form.name || ''}
            onChangeText={(v) => setForm({ ...form, name: v })}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={dynamicStyles.label}>Apellido</Text>
          <TextInput
            style={dynamicStyles.input}
            placeholder="Ingresa tu apellido"
            placeholderTextColor={colors.placeholder}
            value={form.lastName || ''}
            onChangeText={(v) => setForm({ ...form, lastName: v })}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={dynamicStyles.label}>Email</Text>
          <TextInput
            style={dynamicStyles.input}
            placeholder="Email"
            placeholderTextColor={colors.placeholder}
            value={form.email || ''}
            onChangeText={(v) => setForm({ ...form, email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={dynamicStyles.label}>Teléfono</Text>
          <TextInput
            style={dynamicStyles.input}
            placeholder="Teléfono (####-####)"
            placeholderTextColor={colors.placeholder}
            value={form.phone || ''}
            onChangeText={(v) => setForm({ ...form, phone: formatPhone(v) })}
            keyboardType="number-pad"
            maxLength={9}
          />
        </View>

        {!isDoctor && (
          <>
            <View style={styles.fieldContainer}>
              <Text style={dynamicStyles.label}>Dirección</Text>
              <TextInput
                style={dynamicStyles.input}
                placeholder="Ingresa tu dirección"
                placeholderTextColor={colors.placeholder}
                value={form.address || ''}
                onChangeText={(v) => setForm({ ...form, address: v })}
                multiline
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={dynamicStyles.label}>Ubicación en el mapa</Text>
              <TouchableOpacity
                style={dynamicStyles.locationButton}
                onPress={handleOpenLocationPicker}
                activeOpacity={0.7}
              >
                <View style={styles.locationButtonContent}>
                  <Ionicons
                    name={form.location ? 'location' : 'location-outline'}
                    size={24}
                    color="#2196F3"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.locationButtonText}>
                      {form.location
                        ? 'Ubicación configurada'
                        : 'Seleccionar ubicación en el mapa'}
                    </Text>
                    {form.location && (
                      <Text style={dynamicStyles.locationCoordinates}>
                        {form.location.latitude.toFixed(6)}, {form.location.longitude.toFixed(6)}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Campos profesionales para médicos dentro de la misma sección */}
        {isDoctor && (
          <>
            <View style={styles.fieldContainer}>
              <Text style={dynamicStyles.label}>Dirección del consultorio</Text>
              <TextInput
                style={dynamicStyles.input}
                placeholder="Ingresa la dirección de tu consultorio"
                placeholderTextColor={colors.placeholder}
                value={form.clinicAddress || ''}
                onChangeText={(v) => setForm({ ...form, clinicAddress: v })}
                multiline
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={dynamicStyles.label}>Ubicación en el mapa</Text>
              <TouchableOpacity
                style={dynamicStyles.locationButton}
                onPress={handleOpenLocationPicker}
                activeOpacity={0.7}
              >
                <View style={styles.locationButtonContent}>
                  <Ionicons
                    name={form.location ? 'location' : 'location-outline'}
                    size={24}
                    color="#2196F3"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.locationButtonText}>
                      {form.location
                        ? 'Ubicación configurada'
                        : 'Seleccionar ubicación en el mapa'}
                    </Text>
                    {form.location && (
                      <Text style={dynamicStyles.locationCoordinates}>
                        {form.location.latitude.toFixed(6)}, {form.location.longitude.toFixed(6)}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={dynamicStyles.label}>Disponibilidad</Text>
              <TouchableOpacity
                style={[dynamicStyles.toggle, form.acceptsNewPatients && styles.toggleOn]}
                onPress={() => setForm({ ...form, acceptsNewPatients: !form.acceptsNewPatients })}
              >
                <MaterialCommunityIcons
                  name={form.acceptsNewPatients ? 'check-circle' : 'close-circle'}
                  size={24}
                  color={form.acceptsNewPatients ? '#4CAF50' : '#999'}
                />
                <Text style={[dynamicStyles.toggleText, form.acceptsNewPatients && styles.toggleTextOn]}>
                  {form.acceptsNewPatients
                    ? 'Aceptando nuevos pacientes'
                    : 'No acepta nuevos pacientes'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

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
      </KeyboardAvoidingView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onDismiss={hideAlert}
      />
    </>
  );
}

const styles = StyleSheet.create({
  containerMain: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  scrollView: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { paddingBottom: 32 },

  header: {
    backgroundColor: '#2196F3',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarContainer: {
    marginRight: 14,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  headerText: { flex: 1, paddingRight: 4 },
  nameBlock: { marginBottom: 6 },
  headerFirstName: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  headerLastName: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26, marginTop: -2 },

  headerName: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },

  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    gap: 6,
  },
  roleText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16 },

  fieldContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#333',
  },
  inputDisabled: { backgroundColor: '#f0f0f0', color: '#999' },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
    gap: 12,
  },
  toggleOn: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  toggleText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#666' },
  toggleTextOn: { color: '#2E7D32' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statLabel: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 8 },
  statValue: { fontSize: 14, color: '#2196F3', fontWeight: '600', marginTop: 4 },

  actions: { marginHorizontal: 16, marginTop: 24, gap: 12 },
  button: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#90CAF9' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F5F7FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionIconDanger: {
    backgroundColor: '#FFEBEE',
  },
  modalOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalOptionTextDanger: {
    color: '#F44336',
  },
  modalCancelButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },

  // Estilos para el botón de ubicación
  locationButton: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  locationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  locationButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  locationCoordinates: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },

  // Estilos del modal de ubicación
  locationModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  locationModalHeader: {
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
    elevation: 4,
  },
  locationModalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  locationModalSaveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  locationInstructionsText: {
    flex: 1,
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '500',
  },
  map: {
    flex: 1,
  },
  locationLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  locationLoadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  locationCoordinatesDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  locationCoordinatesDisplayText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },

  // Estilos de la barra de búsqueda
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    position: 'relative',
    zIndex: 10,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    padding: 0,
  },
  clearSearchButton: {
    padding: 4,
  },
  searchResultsContainer: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  searchResultsList: {
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  searchResultTextContainer: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  searchResultCity: {
    fontSize: 13,
    color: '#666',
  },

  // Contenedor del mapa con botón flotante
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  currentLocationButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
