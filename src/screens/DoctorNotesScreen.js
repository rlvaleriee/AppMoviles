import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getDoctorNotes, saveDoctorNotes } from '../services/medicalProfileService';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function DoctorNotesScreen({ navigation, route }) {
  const { currentUserData } = useAuth();
  const { colors, darkMode } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();

  const {
    appointmentId,
    patientName,
    appointmentDate,
    reason,
    viewOnly = false, // true si el paciente está viendo las notas
  } = route?.params || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [existingNotes, setExistingNotes] = useState(false);

  const [notes, setNotes] = useState({
    diagnosis: '',
    treatment: '',
    prescriptions: '',
    observations: '',
    followUp: '',
  });

  useEffect(() => {
    loadNotes();
  }, [appointmentId]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const data = await getDoctorNotes(appointmentId);
      if (data) {
        setNotes({
          diagnosis: data.diagnosis || '',
          treatment: data.treatment || '',
          prescriptions: data.prescriptions || '',
          observations: data.observations || '',
          followUp: data.followUp || '',
        });
        setExistingNotes(true);
      }
    } catch (error) {
      // Error silencioso
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setNotes((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!notes.diagnosis.trim()) {
      showAlert('Campo requerido', 'Por favor ingresa un diagnóstico');
      return;
    }

    try {
      setSaving(true);
      await saveDoctorNotes(appointmentId, {
        ...notes,
        doctorId: currentUserData.uid,
        doctorName: `Dr. ${currentUserData.name || ''} ${currentUserData.lastName || ''}`.trim(),
      });
      setHasChanges(false);
      setExistingNotes(true);
      showAlert('Éxito', 'Las notas han sido guardadas correctamente');
    } catch (error) {
      showAlert('Error', 'No se pudieron guardar las notas');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges && !viewOnly) {
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

  const formatDate = (date) => {
    if (!date) return '';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
    infoCard: {
      ...styles.infoCard,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    infoLabel: {
      ...styles.infoLabel,
      color: colors.textSecondary,
    },
    infoValue: {
      ...styles.infoValue,
      color: colors.text,
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
    readOnlyBadge: {
      ...styles.readOnlyBadge,
      backgroundColor: darkMode ? colors.inputBackground : '#FFF3E0',
      borderColor: darkMode ? colors.border : '#FFB74D',
    },
    readOnlyText: {
      ...styles.readOnlyText,
      color: darkMode ? colors.textSecondary : '#E65100',
    },
  };

  if (loading) {
    return (
      <View style={[dynamicStyles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          Cargando notas...
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
            {viewOnly ? 'Notas de la Consulta' : 'Notas Médicas'}
          </Text>
          {patientName && (
            <Text style={dynamicStyles.headerSubtitle}>{patientName}</Text>
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
          {/* Info de la cita */}
          <View style={dynamicStyles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={dynamicStyles.infoLabel}>Fecha de la cita</Text>
                <Text style={dynamicStyles.infoValue}>{formatDate(appointmentDate)}</Text>
              </View>
            </View>
            {reason && (
              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={dynamicStyles.infoLabel}>Motivo de consulta</Text>
                  <Text style={dynamicStyles.infoValue}>{reason}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Badge solo lectura */}
          {viewOnly && (
            <View style={dynamicStyles.readOnlyBadge}>
              <Ionicons name="eye-outline" size={18} color={darkMode ? colors.textSecondary : '#E65100'} />
              <Text style={dynamicStyles.readOnlyText}>
                Solo lectura - Notas del médico
              </Text>
            </View>
          )}

          {/* Formulario de notas */}
          <View style={dynamicStyles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="clipboard" size={22} color="#2196F3" />
              <Text style={dynamicStyles.sectionTitle}>Diagnóstico y Tratamiento</Text>
            </View>

            <Text style={dynamicStyles.label}>{viewOnly ? 'Diagnóstico' : 'Diagnóstico *'}</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, viewOnly && !notes.diagnosis && { color: colors.placeholder }]}
              value={viewOnly && !notes.diagnosis ? 'No especificado' : notes.diagnosis}
              onChangeText={(v) => updateField('diagnosis', v)}
              placeholder={viewOnly ? '' : 'Diagnóstico del paciente...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              editable={!viewOnly}
            />

            <Text style={dynamicStyles.label}>Tratamiento</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, viewOnly && !notes.treatment && { color: colors.placeholder }]}
              value={viewOnly && !notes.treatment ? 'No especificado' : notes.treatment}
              onChangeText={(v) => updateField('treatment', v)}
              placeholder={viewOnly ? '' : 'Plan de tratamiento recomendado...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              editable={!viewOnly}
            />

            <Text style={dynamicStyles.label}>Medicamentos recetados</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, viewOnly && !notes.prescriptions && { color: colors.placeholder }]}
              value={viewOnly && !notes.prescriptions ? 'No especificado' : notes.prescriptions}
              onChangeText={(v) => updateField('prescriptions', v)}
              placeholder={viewOnly ? '' : 'Ej: Amoxicilina 500mg cada 8 horas por 7 días...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              editable={!viewOnly}
            />
          </View>

          <View style={dynamicStyles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="create" size={22} color="#4CAF50" />
              <Text style={dynamicStyles.sectionTitle}>Observaciones</Text>
            </View>

            <Text style={dynamicStyles.label}>Observaciones adicionales</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, viewOnly && !notes.observations && { color: colors.placeholder }]}
              value={viewOnly && !notes.observations ? 'No especificado' : notes.observations}
              onChangeText={(v) => updateField('observations', v)}
              placeholder={viewOnly ? '' : 'Notas adicionales sobre el paciente...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              editable={!viewOnly}
            />

            <Text style={dynamicStyles.label}>Seguimiento</Text>
            <TextInput
              style={[dynamicStyles.input, styles.multilineInput, viewOnly && !notes.followUp && { color: colors.placeholder }]}
              value={viewOnly && !notes.followUp ? 'No especificado' : notes.followUp}
              onChangeText={(v) => updateField('followUp', v)}
              placeholder={viewOnly ? '' : 'Indicaciones de seguimiento, próxima cita...'}
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              editable={!viewOnly}
            />
          </View>

          {/* Botón guardar */}
          {!viewOnly && (
            <TouchableOpacity
              style={[styles.saveButtonBottom, !hasChanges && styles.saveButtonBottomDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonBottomText}>
                    {existingNotes ? 'Actualizar notas' : 'Guardar notas'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#607D8B',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#263238',
    fontWeight: '500',
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  readOnlyText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '500',
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
    minHeight: 100,
    textAlignVertical: 'top',
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
});
