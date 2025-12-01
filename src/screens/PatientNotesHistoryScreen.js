import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getPatientNotesHistory, getMedicalProfile } from '../services/medicalProfileService';

export default function PatientNotesHistoryScreen({ navigation, route }) {
  const { currentUserData } = useAuth();
  const { colors, darkMode } = useTheme();
  const { patientId, patientName } = route?.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notesHistory, setNotesHistory] = useState([]);
  const [medicalProfile, setMedicalProfile] = useState(null);

  useEffect(() => {
    loadData();
  }, [patientId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar historial de notas y perfil médico en paralelo
      const [history, profile] = await Promise.all([
        getPatientNotesHistory(patientId, currentUserData.uid),
        getMedicalProfile(patientId),
      ]);

      setNotesHistory(history);
      setMedicalProfile(profile);
    } catch (error) {
      // Error silencioso
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
    profileCard: {
      ...styles.profileCard,
      backgroundColor: colors.card,
    },
    profileTitle: {
      ...styles.profileTitle,
      color: colors.text,
    },
    profileLabel: {
      ...styles.profileLabel,
      color: colors.textSecondary,
    },
    profileValue: {
      ...styles.profileValue,
      color: colors.text,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    noteCard: {
      ...styles.noteCard,
      backgroundColor: colors.card,
    },
    noteDate: {
      ...styles.noteDate,
      color: colors.text,
    },
    noteReason: {
      ...styles.noteReason,
      color: colors.textSecondary,
    },
    noteLabel: {
      ...styles.noteLabel,
      color: colors.textSecondary,
    },
    noteContent: {
      ...styles.noteContent,
      color: colors.text,
    },
    emptyCard: {
      ...styles.emptyCard,
      backgroundColor: darkMode ? colors.inputBackground : '#FFF3E0',
      borderColor: darkMode ? colors.border : '#FFB74D',
    },
    emptyText: {
      ...styles.emptyText,
      color: darkMode ? colors.textSecondary : '#E65100',
    },
    noProfileCard: {
      ...styles.noProfileCard,
      backgroundColor: darkMode ? colors.inputBackground : '#E3F2FD',
      borderColor: darkMode ? colors.border : '#90CAF9',
    },
    noProfileText: {
      ...styles.noProfileText,
      color: darkMode ? colors.textSecondary : '#1565C0',
    },
  };

  if (loading) {
    return (
      <View style={[dynamicStyles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          Cargando historial...
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
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={dynamicStyles.headerTitle}>Historial de Consultas</Text>
          {patientName && (
            <Text style={dynamicStyles.headerSubtitle}>{patientName}</Text>
          )}
        </View>
        {/* Botón para ver perfil médico completo */}
        {medicalProfile && (
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('MedicalProfile', {
              patientId,
              patientName,
              viewOnly: true,
            })}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle" size={28} color={colors.headerIcon} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2196F3']}
          />
        }
      >
        {/* Resumen del perfil médico */}
        {medicalProfile ? (
          <TouchableOpacity
            style={dynamicStyles.profileCard}
            onPress={() => navigation.navigate('MedicalProfile', {
              patientId,
              patientName,
              viewOnly: true,
            })}
            activeOpacity={0.7}
          >
            <View style={styles.profileHeader}>
              <Ionicons name="medkit" size={22} color="#E91E63" />
              <Text style={dynamicStyles.profileTitle}>Perfil Médico</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
            </View>
            <View style={styles.profileGrid}>
              {medicalProfile.bloodType && (
                <View style={styles.profileItem}>
                  <Text style={dynamicStyles.profileLabel}>Tipo de sangre</Text>
                  <Text style={dynamicStyles.profileValue}>{medicalProfile.bloodType}</Text>
                </View>
              )}
              {medicalProfile.allergies && (
                <View style={styles.profileItem}>
                  <Text style={dynamicStyles.profileLabel}>Alergias</Text>
                  <Text style={dynamicStyles.profileValue} numberOfLines={2}>
                    {medicalProfile.allergies}
                  </Text>
                </View>
              )}
              {medicalProfile.chronicDiseases && (
                <View style={styles.profileItem}>
                  <Text style={dynamicStyles.profileLabel}>Enf. crónicas</Text>
                  <Text style={dynamicStyles.profileValue} numberOfLines={2}>
                    {medicalProfile.chronicDiseases}
                  </Text>
                </View>
              )}
              {medicalProfile.currentMedications && (
                <View style={styles.profileItem}>
                  <Text style={dynamicStyles.profileLabel}>Medicamentos</Text>
                  <Text style={dynamicStyles.profileValue} numberOfLines={2}>
                    {medicalProfile.currentMedications}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <View style={dynamicStyles.noProfileCard}>
            <Ionicons name="information-circle" size={20} color={darkMode ? colors.primary : '#1565C0'} />
            <Text style={dynamicStyles.noProfileText}>
              El paciente aún no ha completado su perfil médico
            </Text>
          </View>
        )}

        {/* Historial de notas */}
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text" size={22} color="#2196F3" />
          <Text style={dynamicStyles.sectionTitle}>
            Notas de Consultas ({notesHistory.length})
          </Text>
        </View>

        {notesHistory.length === 0 ? (
          <View style={dynamicStyles.emptyCard}>
            <Ionicons name="document-outline" size={24} color={darkMode ? colors.textSecondary : '#E65100'} />
            <Text style={dynamicStyles.emptyText}>
              No hay notas de consultas registradas
            </Text>
          </View>
        ) : (
          notesHistory.map((item, index) => (
            <TouchableOpacity
              key={item.appointmentId || index}
              style={dynamicStyles.noteCard}
              onPress={() => navigation.navigate('DoctorNotes', {
                appointmentId: item.appointmentId,
                patientName,
                appointmentDate: item.appointmentDate,
                reason: item.reason,
                viewOnly: false, // El doctor puede editar sus propias notas
              })}
              activeOpacity={0.7}
            >
              <View style={styles.noteDateRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={dynamicStyles.noteDate}>{formatDate(item.appointmentDate)}</Text>
                {item.notes ? (
                  <View style={styles.hasNotesBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  </View>
                ) : (
                  <View style={styles.noNotesBadge}>
                    <Ionicons name="alert-circle" size={16} color="#FF9800" />
                  </View>
                )}
              </View>

              {item.reason && (
                <Text style={dynamicStyles.noteReason} numberOfLines={2}>
                  Motivo: {item.reason}
                </Text>
              )}

              {item.notes ? (
                <View style={styles.notePreview}>
                  {item.notes.diagnosis && (
                    <View style={styles.noteField}>
                      <Text style={dynamicStyles.noteLabel}>Diagnóstico:</Text>
                      <Text style={dynamicStyles.noteContent} numberOfLines={2}>
                        {item.notes.diagnosis}
                      </Text>
                    </View>
                  )}
                  {item.notes.treatment && (
                    <View style={styles.noteField}>
                      <Text style={dynamicStyles.noteLabel}>Tratamiento:</Text>
                      <Text style={dynamicStyles.noteContent} numberOfLines={2}>
                        {item.notes.treatment}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.addNotesPrompt}>
                  <Ionicons name="add-circle-outline" size={18} color="#FF9800" />
                  <Text style={{ color: '#FF9800', fontSize: 13, fontWeight: '500' }}>
                    Agregar notas de consulta
                  </Text>
                </View>
              )}

              <View style={styles.noteFooter}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {item.notes ? 'Ver detalles' : 'Completar notas'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  profileTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#263238',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  profileItem: {
    width: '47%',
  },
  profileLabel: {
    fontSize: 12,
    color: '#607D8B',
    marginBottom: 2,
  },
  profileValue: {
    fontSize: 14,
    color: '#263238',
    fontWeight: '500',
  },
  noProfileCard: {
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
  noProfileText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#263238',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFB74D',
    gap: 10,
  },
  emptyText: {
    flex: 1,
    fontSize: 14,
    color: '#E65100',
  },
  noteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  noteDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  noteDate: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#263238',
  },
  hasNotesBadge: {
    padding: 2,
  },
  noNotesBadge: {
    padding: 2,
  },
  noteReason: {
    fontSize: 13,
    color: '#607D8B',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  notePreview: {
    gap: 8,
    marginBottom: 10,
  },
  noteField: {
    gap: 2,
  },
  noteLabel: {
    fontSize: 12,
    color: '#607D8B',
    fontWeight: '600',
  },
  noteContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  addNotesPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
});
