import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getMedicalProfile, saveMedicalProfile } from '../services/medicalProfileService';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const SMOKING_OPTIONS = [
  'No fumo',
  'Fumador ocasional',
  'Fumador regular',
  'Ex fumador',
];

const ALCOHOL_OPTIONS = [
  'No consumo',
  'Consumo ocasional',
  'Consumo moderado',
  'Consumo frecuente',
];

const EXERCISE_OPTIONS = [
  'Sedentario',
  'Ejercicio ligero (1-2 días/semana)',
  'Ejercicio moderado (3-4 días/semana)',
  'Ejercicio intenso (5+ días/semana)',
];

export default function MedicalProfileScreen({ navigation, route }) {
  const { currentUserData } = useAuth();
  const { colors, darkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const isViewOnly = route?.params?.viewOnly || false;
  const patientIdParam = route?.params?.patientId;
  const patientNameParam = route?.params?.patientName;

  const patientId = patientIdParam || currentUserData?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Datos del perfil
  const [profile, setProfile] = useState({
    birthDate: '',
    bloodType: '',
    allergies: '',
    chronicDiseases: '',
    currentMedications: '',
    previousSurgeries: '',
    smoking: '',
    alcohol: '',
    exercise: '',
    weight: '',
    height: '',
  });

  // Unidades
  const [weightUnit, setWeightUnit] = useState('kg'); // kg o lbs
  const [heightUnit, setHeightUnit] = useState('cm'); // cm o m

  // Modales
  const [bloodTypeModalVisible, setBloodTypeModalVisible] = useState(false);
  const [smokingModalVisible, setSmokingModalVisible] = useState(false);
  const [alcoholModalVisible, setAlcoholModalVisible] = useState(false);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);

  // Conversiones
  const KG_TO_LBS = 2.20462;
  const CM_TO_M = 0.01;

  // Calcular edad a partir de fecha de nacimiento
  const calculateAge = (birthDateStr) => {
    if (!birthDateStr) return null;
    const [day, month, year] = birthDateStr.split('/').map(Number);
    if (!day || !month || !year) return null;

    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Formatear entrada de fecha (DD/MM/AAAA)
  const formatBirthDateInput = (text) => {
    // Remover caracteres no numéricos excepto /
    const cleaned = text.replace(/[^0-9]/g, '');

    let formatted = '';
    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 2);
    }
    if (cleaned.length > 2) {
      formatted += '/' + cleaned.substring(2, 4);
    }
    if (cleaned.length > 4) {
      formatted += '/' + cleaned.substring(4, 8);
    }

    return formatted;
  };

  const convertWeight = (value, toUnit) => {
    if (!value || isNaN(parseFloat(value))) return '';
    const numValue = parseFloat(value);
    if (toUnit === 'lbs') {
      return (numValue * KG_TO_LBS).toFixed(1);
    } else {
      return (numValue / KG_TO_LBS).toFixed(1);
    }
  };

  const convertHeight = (value, toUnit) => {
    if (!value || isNaN(parseFloat(value))) return '';
    const numValue = parseFloat(value);
    if (toUnit === 'm') {
      return (numValue * CM_TO_M).toFixed(2);
    } else {
      return (numValue / CM_TO_M).toFixed(0);
    }
  };

  const toggleWeightUnit = () => {
    if (isViewOnly) return;
    const newUnit = weightUnit === 'kg' ? 'lbs' : 'kg';
    const convertedValue = convertWeight(profile.weight, newUnit);
    setWeightUnit(newUnit);
    if (convertedValue) {
      setProfile((prev) => ({ ...prev, weight: convertedValue }));
      setHasChanges(true);
    }
  };

  const toggleHeightUnit = () => {
    if (isViewOnly) return;
    const newUnit = heightUnit === 'cm' ? 'm' : 'cm';
    const convertedValue = convertHeight(profile.height, newUnit);
    setHeightUnit(newUnit);
    if (convertedValue) {
      setProfile((prev) => ({ ...prev, height: convertedValue }));
      setHasChanges(true);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [patientId]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getMedicalProfile(patientId);
      if (data) {
        setProfile({
          birthDate: data.birthDate || '',
          bloodType: data.bloodType || '',
          allergies: data.allergies || '',
          chronicDiseases: data.chronicDiseases || '',
          currentMedications: data.currentMedications || '',
          previousSurgeries: data.previousSurgeries || '',
          smoking: data.smoking || '',
          alcohol: data.alcohol || '',
          exercise: data.exercise || '',
          weight: data.weight || '',
          height: data.height || '',
        });
        // Cargar las unidades guardadas
        if (data.weightUnit) setWeightUnit(data.weightUnit);
        if (data.heightUnit) setHeightUnit(data.heightUnit);
      }
    } catch (error) {
      showAlert('Error', 'No se pudo cargar el perfil médico');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Validar fecha de nacimiento
  const validateBirthDate = () => {
    if (!profile.birthDate) return true; // Campo opcional

    const [day, month, year] = profile.birthDate.split('/').map(Number);

    // Validar formato completo
    if (!day || !month || !year || profile.birthDate.length !== 10) {
      showAlert('Fecha inválida', 'Ingresa la fecha en formato DD/MM/AAAA.');
      return false;
    }

    // Validar rangos de día y mes
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      showAlert('Fecha inválida', 'El día o mes ingresado no es válido.');
      return false;
    }

    const birthDate = new Date(year, month - 1, day);
    const today = new Date();

    // Validar que la fecha sea válida (ej: 31/02 no es válido)
    if (birthDate.getDate() !== day || birthDate.getMonth() !== month - 1) {
      showAlert('Fecha inválida', 'La fecha ingresada no existe.');
      return false;
    }

    // Validar que no sea fecha futura
    if (birthDate > today) {
      showAlert('Fecha inválida', 'La fecha de nacimiento no puede ser en el futuro.');
      return false;
    }

    // Validar edad mínima (0 años) y máxima (120 años)
    const age = calculateAge(profile.birthDate);
    if (age < 0 || age > 120) {
      showAlert('Fecha inválida', 'La edad debe estar entre 0 y 120 años.');
      return false;
    }

    return true;
  };

  // Validar peso y altura con límites razonables
  const validateWeightAndHeight = () => {
    const weight = parseFloat(profile.weight);
    const height = parseFloat(profile.height);

    // Validar peso si se ingresó
    if (profile.weight && !isNaN(weight)) {
      // Convertir a kg si está en lbs para validar
      const weightInKg = weightUnit === 'lbs' ? weight / KG_TO_LBS : weight;
      if (weightInKg < 20 || weightInKg > 250) {
        showAlert(
          'Peso inválido',
          `El peso debe estar entre 20 y 250 kg (${Math.round(20 * KG_TO_LBS)} - ${Math.round(250 * KG_TO_LBS)} lbs).`
        );
        return false;
      }
    }

    // Validar altura si se ingresó
    if (profile.height && !isNaN(height)) {
      // Convertir a cm si está en metros para validar
      const heightInCm = heightUnit === 'm' ? height / CM_TO_M : height;
      if (heightInCm < 50 || heightInCm > 250) {
        showAlert(
          'Altura inválida',
          `La altura debe estar entre 50 y 250 cm (0.50 - 2.50 m).`
        );
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    // Validar antes de guardar
    if (!validateBirthDate() || !validateWeightAndHeight()) {
      return;
    }

    try {
      setSaving(true);
      // Guardar el perfil junto con las unidades seleccionadas
      await saveMedicalProfile(patientId, {
        ...profile,
        weightUnit,
        heightUnit,
      });
      setHasChanges(false);
      showAlert('Éxito', 'Tu perfil médico ha sido guardado correctamente');
    } catch (error) {
      showAlert('Error', 'No se pudo guardar el perfil médico');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges && !isViewOnly) {
      showAlert(
        'Cambios sin guardar',
        '¿Deseas guardar los cambios antes de salir?',
        [
          { text: 'Descartar', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Guardar', onPress: async () => {
            await handleSave();
            navigation.goBack();
          }},
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  // Estilos dinámicos
  const dynamicStyles = {
    container: {
      ...styles.container,
      backgroundColor: colors.background,
    },
    header: {
      ...styles.header,
      backgroundColor: colors.header,
      borderBottomColor: colors.headerBorder,
    },
    headerTitle: {
      ...styles.headerTitle,
      color: colors.headerText,
    },
    headerSubtitle: {
      ...styles.headerSubtitle,
      color: colors.headerText,
    },
    sectionCard: {
      ...styles.sectionCard,
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
      borderColor: colors.border,
      color: colors.text,
    },
    selectButton: {
      ...styles.selectButton,
      backgroundColor: colors.inputBackground,
      borderColor: colors.border,
    },
    selectButtonText: {
      ...styles.selectButtonText,
      color: profile.bloodType ? colors.text : colors.placeholder,
    },
    modalContainer: {
      ...styles.modalContainer,
      backgroundColor: colors.card,
    },
    modalTitle: {
      ...styles.modalTitle,
      color: colors.text,
    },
    modalOption: {
      ...styles.modalOption,
      borderBottomColor: colors.border,
    },
    modalOptionText: {
      ...styles.modalOptionText,
      color: colors.text,
    },
    infoCard: {
      ...styles.infoCard,
      backgroundColor: darkMode ? colors.inputBackground : '#E3F2FD',
      borderColor: darkMode ? colors.border : '#90CAF9',
    },
    infoText: {
      ...styles.infoText,
      color: darkMode ? colors.textSecondary : '#1565C0',
    },
    unitToggle: {
      ...styles.unitToggle,
      backgroundColor: darkMode ? colors.inputBackground : '#E3F2FD',
    },
    unitToggleText: {
      ...styles.unitToggleText,
      color: darkMode ? colors.textSecondary : '#90CAF9',
    },
    unitDivider: {
      ...styles.unitDivider,
      color: darkMode ? colors.textSecondary : '#90CAF9',
    },
    unitActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    saveButtonBottom: {
      ...styles.saveButtonBottom,
      backgroundColor: colors.primary,
    },
    saveButtonBottomDisabled: {
      ...styles.saveButtonBottomDisabled,
      backgroundColor: darkMode ? '#1565C0' : '#B0BEC5',
      opacity: darkMode ? 0.5 : 1,
    },
  };

  const renderSelectModal = (
    visible,
    setVisible,
    options,
    currentValue,
    onSelect,
    title
  ) => (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[dynamicStyles.modalContainer, { paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text style={dynamicStyles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Ionicons name="close" size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  dynamicStyles.modalOption,
                  currentValue === option && styles.modalOptionSelected,
                ]}
                onPress={() => {
                  onSelect(option);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    dynamicStyles.modalOptionText,
                    currentValue === option && styles.modalOptionTextSelected,
                  ]}
                >
                  {option}
                </Text>
                {currentValue === option && (
                  <Ionicons name="checkmark" size={22} color="#2196F3" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[dynamicStyles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          Cargando perfil médico...
        </Text>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={dynamicStyles.headerTitle}>
            {isViewOnly ? 'Perfil Médico' : 'Mi Perfil Médico'}
          </Text>
          {isViewOnly && patientNameParam && (
            <Text style={dynamicStyles.headerSubtitle}>{patientNameParam}</Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info card */}
          {!isViewOnly && (
            <View style={dynamicStyles.infoCard}>
              <Ionicons name="information-circle" size={20} color={darkMode ? colors.primary : '#1565C0'} />
              <Text style={dynamicStyles.infoText}>
                Esta información estará disponible para los médicos con los que tengas citas activas.
              </Text>
            </View>
          )}

          {/* Información Básica */}
          <View style={dynamicStyles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person" size={22} color="#2196F3" />
              <Text style={dynamicStyles.sectionTitle}>Información Básica</Text>
            </View>

            <Text style={dynamicStyles.label}>Fecha de nacimiento</Text>
            <View style={styles.birthDateContainer}>
              <TextInput
                style={[dynamicStyles.input, styles.birthDateInput, isViewOnly && !profile.birthDate && { color: colors.placeholder }]}
                value={isViewOnly && !profile.birthDate ? 'No especificado' : profile.birthDate}
                onChangeText={(v) => updateField('birthDate', formatBirthDateInput(v))}
                placeholder={isViewOnly ? '' : 'DD/MM/AAAA'}
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
                maxLength={10}
                editable={!isViewOnly}
              />
              {profile.birthDate && calculateAge(profile.birthDate) !== null && (
                <View style={[styles.ageChip, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.ageChipText, { color: colors.primary }]}>
                    {calculateAge(profile.birthDate)} años
                  </Text>
                </View>
              )}
            </View>

            <Text style={dynamicStyles.label}>Tipo de sangre</Text>
            <TouchableOpacity
              style={dynamicStyles.selectButton}
              onPress={() => !isViewOnly && setBloodTypeModalVisible(true)}
              disabled={isViewOnly}
            >
              <Text style={dynamicStyles.selectButtonText}>
                {profile.bloodType || (isViewOnly ? 'No especificado' : 'Seleccionar tipo de sangre')}
              </Text>
              {!isViewOnly && <Ionicons name="chevron-down" size={20} color={colors.icon} />}
            </TouchableOpacity>

            <View style={styles.row}>
              <View style={styles.halfInput}>
                <View style={styles.labelRow}>
                  <Text style={dynamicStyles.label}>Peso</Text>
                  <TouchableOpacity
                    style={dynamicStyles.unitToggle}
                    onPress={toggleWeightUnit}
                    disabled={isViewOnly}
                    activeOpacity={0.7}
                  >
                    <Text style={[dynamicStyles.unitToggleText, weightUnit === 'kg' && dynamicStyles.unitActive]}>kg</Text>
                    <Text style={dynamicStyles.unitDivider}>/</Text>
                    <Text style={[dynamicStyles.unitToggleText, weightUnit === 'lbs' && dynamicStyles.unitActive]}>lbs</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[dynamicStyles.input, isViewOnly && !profile.weight && { color: colors.placeholder }]}
                  value={isViewOnly && !profile.weight ? 'No especificado' : profile.weight}
                  onChangeText={(v) => updateField('weight', v)}
                  placeholder={isViewOnly ? '' : (weightUnit === 'kg' ? 'Ej: 70' : 'Ej: 154')}
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  editable={!isViewOnly}
                />
              </View>
              <View style={styles.halfInput}>
                <View style={styles.labelRow}>
                  <Text style={dynamicStyles.label}>Altura</Text>
                  <TouchableOpacity
                    style={dynamicStyles.unitToggle}
                    onPress={toggleHeightUnit}
                    disabled={isViewOnly}
                    activeOpacity={0.7}
                  >
                    <Text style={[dynamicStyles.unitToggleText, heightUnit === 'cm' && dynamicStyles.unitActive]}>cm</Text>
                    <Text style={dynamicStyles.unitDivider}>/</Text>
                    <Text style={[dynamicStyles.unitToggleText, heightUnit === 'm' && dynamicStyles.unitActive]}>m</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[dynamicStyles.input, isViewOnly && !profile.height && { color: colors.placeholder }]}
                  value={isViewOnly && !profile.height ? 'No especificado' : profile.height}
                  onChangeText={(v) => updateField('height', v)}
                  placeholder={isViewOnly ? '' : (heightUnit === 'cm' ? 'Ej: 170' : 'Ej: 1.70')}
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  editable={!isViewOnly}
                />
              </View>
            </View>
          </View>

          {/* Antecedentes Médicos */}
          <View style={dynamicStyles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medkit" size={22} color="#E91E63" />
              <Text style={dynamicStyles.sectionTitle}>Antecedentes Médicos</Text>
            </View>

            <Text style={dynamicStyles.label}>Alergias</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, isViewOnly && !profile.allergies && { color: colors.placeholder }]}
              value={isViewOnly && !profile.allergies ? 'No especificado' : profile.allergies}
              onChangeText={(v) => updateField('allergies', v)}
              placeholder={isViewOnly ? '' : 'Ej: Penicilina, mariscos, polen...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              editable={!isViewOnly}
            />

            <Text style={dynamicStyles.label}>Enfermedades crónicas</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, isViewOnly && !profile.chronicDiseases && { color: colors.placeholder }]}
              value={isViewOnly && !profile.chronicDiseases ? 'No especificado' : profile.chronicDiseases}
              onChangeText={(v) => updateField('chronicDiseases', v)}
              placeholder={isViewOnly ? '' : 'Ej: Diabetes, hipertensión, asma...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              editable={!isViewOnly}
            />

            <Text style={dynamicStyles.label}>Medicamentos actuales</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, isViewOnly && !profile.currentMedications && { color: colors.placeholder }]}
              value={isViewOnly && !profile.currentMedications ? 'No especificado' : profile.currentMedications}
              onChangeText={(v) => updateField('currentMedications', v)}
              placeholder={isViewOnly ? '' : 'Ej: Metformina 500mg, Losartán 50mg...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              editable={!isViewOnly}
            />

            <Text style={dynamicStyles.label}>Cirugías previas</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, isViewOnly && !profile.previousSurgeries && { color: colors.placeholder }]}
              value={isViewOnly && !profile.previousSurgeries ? 'No especificado' : profile.previousSurgeries}
              onChangeText={(v) => updateField('previousSurgeries', v)}
              placeholder={isViewOnly ? '' : 'Ej: Apendicectomía (2015), Cesárea (2018)...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              editable={!isViewOnly}
            />
          </View>

          {/* Hábitos de Vida */}
          <View style={dynamicStyles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="fitness" size={22} color="#4CAF50" />
              <Text style={dynamicStyles.sectionTitle}>Hábitos de Vida</Text>
            </View>

            <Text style={dynamicStyles.label}>Consumo de tabaco</Text>
            <TouchableOpacity
              style={dynamicStyles.selectButton}
              onPress={() => !isViewOnly && setSmokingModalVisible(true)}
              disabled={isViewOnly}
            >
              <Text style={[dynamicStyles.selectButtonText, { color: profile.smoking ? colors.text : colors.placeholder }]}>
                {profile.smoking || (isViewOnly ? 'No especificado' : 'Seleccionar')}
              </Text>
              {!isViewOnly && <Ionicons name="chevron-down" size={20} color={colors.icon} />}
            </TouchableOpacity>

            <Text style={dynamicStyles.label}>Consumo de alcohol</Text>
            <TouchableOpacity
              style={dynamicStyles.selectButton}
              onPress={() => !isViewOnly && setAlcoholModalVisible(true)}
              disabled={isViewOnly}
            >
              <Text style={[dynamicStyles.selectButtonText, { color: profile.alcohol ? colors.text : colors.placeholder }]}>
                {profile.alcohol || (isViewOnly ? 'No especificado' : 'Seleccionar')}
              </Text>
              {!isViewOnly && <Ionicons name="chevron-down" size={20} color={colors.icon} />}
            </TouchableOpacity>

            <Text style={dynamicStyles.label}>Ejercicio físico</Text>
            <TouchableOpacity
              style={dynamicStyles.selectButton}
              onPress={() => !isViewOnly && setExerciseModalVisible(true)}
              disabled={isViewOnly}
            >
              <Text style={[dynamicStyles.selectButtonText, { color: profile.exercise ? colors.text : colors.placeholder }]}>
                {profile.exercise || (isViewOnly ? 'No especificado' : 'Seleccionar')}
              </Text>
              {!isViewOnly && <Ionicons name="chevron-down" size={20} color={colors.icon} />}
            </TouchableOpacity>
          </View>

          {/* Botón guardar (móvil) */}
          {!isViewOnly && (
            <TouchableOpacity
              style={[dynamicStyles.saveButtonBottom, !hasChanges && dynamicStyles.saveButtonBottomDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonBottomText}>Guardar cambios</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modales */}
      {renderSelectModal(
        bloodTypeModalVisible,
        setBloodTypeModalVisible,
        BLOOD_TYPES,
        profile.bloodType,
        (v) => updateField('bloodType', v),
        'Tipo de Sangre'
      )}
      {renderSelectModal(
        smokingModalVisible,
        setSmokingModalVisible,
        SMOKING_OPTIONS,
        profile.smoking,
        (v) => updateField('smoking', v),
        'Consumo de Tabaco'
      )}
      {renderSelectModal(
        alcoholModalVisible,
        setAlcoholModalVisible,
        ALCOHOL_OPTIONS,
        profile.alcohol,
        (v) => updateField('alcohol', v),
        'Consumo de Alcohol'
      )}
      {renderSelectModal(
        exerciseModalVisible,
        setExerciseModalVisible,
        EXERCISE_OPTIONS,
        profile.exercise,
        (v) => updateField('exercise', v),
        'Ejercicio Físico'
      )}

      {/* Custom Alert */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onDismiss={hideAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2196F3',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 75,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#90CAF9',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#263238',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#607D8B',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectButtonText: {
    fontSize: 15,
    color: '#999',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  birthDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  birthDateInput: {
    flex: 1,
  },
  ageChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ageChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 12,
  },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unitToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#90CAF9',
    paddingHorizontal: 4,
  },
  unitDivider: {
    fontSize: 13,
    color: '#90CAF9',
  },
  unitActive: {
    color: '#2196F3',
    fontWeight: '700',
  },
  saveButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
    gap: 8,
  },
  saveButtonBottomDisabled: {
    backgroundColor: '#B0BEC5',
  },
  saveButtonBottomText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#263238',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalOptionSelected: {
    backgroundColor: '#E3F2FD',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#333',
  },
  modalOptionTextSelected: {
    color: '#2196F3',
    fontWeight: '600',
  },
});
