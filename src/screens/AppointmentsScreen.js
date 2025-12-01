import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  subscribeAppointmentsForUser,
  acceptAppointment,
  rejectAppointment,
  cancelAppointment,
  cancelAppointmentByDoctor,
  completeAppointment,
  noShowAppointment,
  deleteAppointment,
  getUserById,
  getMedicalRecordByAppointment,
} from '../services/firestore';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function AppointmentsScreen({ route }) {
  const { firebaseUser, currentUserData } = useAuth();
  const navigation = useNavigation();
  const { colors, darkMode } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialFilter = route?.params?.initialFilter || 'requested';
  const [filter, setFilter] = useState(initialFilter); // 'all', 'requested', 'accepted', 'rejected', 'cancelled', 'completed', 'noShow'
  const [filterDropdownVisible, setFilterDropdownVisible] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const flatListRef = useRef(null);
  const processedHighlightId = useRef(null);

  const isDoctor = currentUserData?.role === 'doctor';
  const highlightAppointmentId = route?.params?.highlightAppointmentId;

  // Actualizar filtro si cambia el parámetro initialFilter
  useEffect(() => {
    if (route?.params?.initialFilter) {
      setFilter(route.params.initialFilter);
    }
  }, [route?.params?.initialFilter]);

  // Suscripción a citas (doctor o paciente)
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsub = subscribeAppointmentsForUser(
      firebaseUser.uid,
      isDoctor ? 'doctor' : 'patient',
      async (appointments) => {
        try {
          const enriched = await Promise.all(
            appointments.map(async (appt) => {
              try {
                const otherId = isDoctor ? appt.patientId : appt.doctorId;
                const otherUser = await getUserById(otherId);
                return { ...appt, otherUserData: otherUser };
              } catch {
                return appt;
              }
            })
          );
          setRows(enriched);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      }
    );

    const safety = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 1000);

    return () => {
      clearTimeout(safety);
      unsub && unsub();
    };
  }, [firebaseUser?.uid, isDoctor]);

  // Efecto para hacer scroll y highlight cuando llega desde notificación
  useEffect(() => {
    // Solo procesar si hay un highlightAppointmentId Y no lo hemos procesado antes
    if (highlightAppointmentId &&
        rows.length > 0 &&
        flatListRef.current &&
        processedHighlightId.current !== highlightAppointmentId) {

      // Marcar como procesado para evitar que se repita
      processedHighlightId.current = highlightAppointmentId;

      // Limpiar el parámetro de navegación para permitir navegación normal
      navigation.setParams({ highlightAppointmentId: null });

      // Encontrar el índice de la cita
      const filteredData = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
      const index = filteredData.findIndex((item) => item.id === highlightAppointmentId);

      if (index !== -1) {
        // Hacer scroll a la cita
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5, // Centrar en la pantalla
          });

          // Marcar como highlighted
          setHighlightedId(highlightAppointmentId);

          // Quitar el highlight después de 3 segundos
          setTimeout(() => {
            setHighlightedId(null);
          }, 3000);
        }, 300);
      } else {
        // Si no está en el filtro actual, buscar la cita y cambiar al filtro correspondiente
        const appointment = rows.find((item) => item.id === highlightAppointmentId);
        if (appointment) {
          // Cambiar al filtro del estado de la cita
          setFilter(appointment.status);
          setTimeout(() => {
            // Buscar el índice en el nuevo filtro
            const filteredByStatus = rows.filter((r) => r.status === appointment.status);
            const newIndex = filteredByStatus.findIndex((item) => item.id === highlightAppointmentId);
            if (newIndex !== -1 && flatListRef.current) {
              flatListRef.current.scrollToIndex({
                index: newIndex,
                animated: true,
                viewPosition: 0.5,
              });
              setHighlightedId(highlightAppointmentId);
              setTimeout(() => setHighlightedId(null), 3000);
            }
          }, 400);
        }
      }
    }
  }, [highlightAppointmentId, rows]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  const onChangeStatus = async (id, nextStatus) => {
    const actionNames = {
      accepted: 'aceptar',
      rejected: 'rechazar',
      cancelled: 'cancelar',
    };

    const successMessages = {
      accepted: 'Cita aceptada correctamente',
      rejected: 'Cita rechazada correctamente',
      cancelled: 'Cita cancelada correctamente',
    };

    showAlert(
      'Confirmar acción',
      `¿Estás seguro que deseas ${actionNames[nextStatus]} esta cita?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              if (nextStatus === 'accepted') await acceptAppointment(id);
              else if (nextStatus === 'rejected') await rejectAppointment(id);
              else if (nextStatus === 'cancelled') await cancelAppointment(id);
              else throw new Error('Acción no soportada');
              showAlert('Éxito', successMessages[nextStatus]);
            } catch (e) {
              showAlert('Error', e?.message || 'No se pudo actualizar la cita');
            }
          },
        },
      ]
    );
  };

  const onDeleteAppointment = (id) => {
    showAlert(
      'Eliminar cita',
      '¿Estás seguro que deseas eliminar esta cita? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAppointment(id);
              showAlert('Éxito', 'La cita ha sido eliminada');
            } catch (e) {
              showAlert('Error', e?.message || 'No se pudo eliminar la cita');
            }
          },
        },
      ]
    );
  };

  const onMarkAsCompleted = (id) => {
    showAlert(
      'Marcar como completada',
      '¿Confirmas que esta cita fue atendida?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await completeAppointment(id);
              showAlert('Éxito', 'Cita marcada como completada');
            } catch (e) {
              showAlert('Error', e?.message || 'No se pudo actualizar la cita');
            }
          },
        },
      ]
    );
  };

  const onMarkAsNoShow = (id) => {
    showAlert(
      'Paciente no se presentó',
      '¿Confirmas que el paciente no se presentó a esta cita?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: async () => {
            try {
              await noShowAppointment(id);
              showAlert('Registrado', 'La cita fue marcada como "no se presentó"');
            } catch (e) {
              showAlert('Error', e?.message || 'No se pudo actualizar la cita');
            }
          },
        },
      ]
    );
  };

  const onDoctorCancelAppointment = (id) => {
    showAlert(
      'Cancelar cita',
      '¿Estás seguro que deseas cancelar esta cita? El paciente será notificado.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelAppointmentByDoctor(id);
              showAlert('Éxito', 'La cita ha sido cancelada. El paciente será notificado.');
            } catch (e) {
              showAlert('Error', e?.message || 'No se pudo cancelar la cita');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'requested': return '#FFA726';
      case 'accepted':  return '#66BB6A';
      case 'rejected':  return '#EF5350';
      case 'cancelled': return '#9E9E9E';
      case 'completed': return '#42A5F5';
      case 'noShow':    return '#FF7043';
      default:          return '#999';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'requested': return 'time-outline';
      case 'accepted':  return 'checkmark-circle';
      case 'rejected':  return 'close-circle';
      case 'cancelled': return 'close-circle-outline';
      case 'completed': return 'checkmark-done-circle';
      case 'noShow':    return 'person-remove-outline';
      default:          return 'help-circle';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'requested': return 'Solicitada';
      case 'accepted':  return 'Aceptada';
      case 'rejected':  return 'Rechazada';
      case 'cancelled': return 'Cancelada';
      case 'completed': return 'Completada';
      case 'noShow':    return 'No se presentó';
      default:          return status;
    }
  };

  // Opciones del menú desplegable (excluyendo pendientes y aceptadas)
  const getDropdownOptions = () => {
    return [
      { value: 'all', label: 'Todas', icon: 'list-outline' },
      { value: 'completed', label: 'Completadas', icon: 'checkmark-done-circle' },
      { value: 'noShow', label: 'Ausentes', icon: 'person-remove-outline' },
      { value: 'rejected', label: 'Rechazadas', icon: 'close-circle' },
      { value: 'cancelled', label: 'Canceladas', icon: 'close-circle-outline' },
    ];
  };

  // Etiqueta corta para el botón de filtro
  const getShortFilterLabel = (filterValue) => {
    switch (filterValue) {
      case 'all':       return 'Todas';
      case 'completed': return 'Completas';
      case 'noShow':    return 'Ausentes';
      case 'rejected':  return 'Rechazadas';
      case 'cancelled': return 'Canceladas';
      default:          return 'Filtrar';
    }
  };

  // Verificar si el filtro actual está en el dropdown
  const isDropdownFilter = () => {
    return ['all', 'completed', 'noShow', 'rejected', 'cancelled'].includes(filter);
  };

  const filteredRows =
    filter === 'all'
      ? rows
      : rows.filter((r) => r.status === filter);

  const renderItem = ({ item }) => {
    const slotDate =
      item?.slotStart?.toDate?.() instanceof Date
        ? item.slotStart.toDate()
        : new Date(item?.slotStart);

    const canDoctorAct = isDoctor && item.status === 'requested';
    const canPatientCancel =
      !isDoctor && !['cancelled', 'completed', 'rejected', 'noShow'].includes(item.status);

    // Doctor puede marcar como completada o no se presentó en citas pasadas aceptadas
    const canDoctorFinalize = isDoctor && item.status === 'accepted' && slotDate < new Date();

    // Doctor puede cancelar citas aceptadas que aún no han pasado
    const canDoctorCancel = isDoctor && item.status === 'accepted' && slotDate >= new Date();

    const otherName = item.otherUserData
      ? `${item.otherUserData.name || ''} ${item.otherUserData.lastName || ''}`.trim()
      : isDoctor ? item.patientId : item.doctorId;

    const isPast = slotDate < new Date();
    const isHighlighted = highlightedId === item.id;

    return (
      <View style={[dynamicStyles.card, isHighlighted && dynamicStyles.cardHighlighted]}>
        {/* Header de la tarjeta */}
        <View style={styles.cardHeader}>
          <View style={styles.statusBadge}>
            <Ionicons
              name={getStatusIcon(item.status)}
              size={18}
              color={getStatusColor(item.status)}
            />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
          {isPast && item.status === 'accepted' && (
            <View style={styles.pastBadge}>
              <Text style={styles.pastText}>Pasada</Text>
            </View>
          )}
        </View>

        {/* Información principal */}
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="calendar" size={20} color="#2196F3" />
            <View style={styles.infoContent}>
              <Text style={dynamicStyles.infoLabel}>Fecha y hora</Text>
              <Text style={dynamicStyles.infoValue}>
                {slotDate?.toLocaleDateString?.('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) || '—'}
              </Text>
              <Text style={styles.infoTime}>
                {slotDate?.toLocaleTimeString?.('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                }) || '—'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons
              name={isDoctor ? 'account' : 'stethoscope'}
              size={20}
              color="#2196F3"
            />
            <View style={styles.infoContent}>
              <Text style={dynamicStyles.infoLabel}>{isDoctor ? 'Paciente' : 'Médico'}</Text>
              <Text style={dynamicStyles.infoValue}>{otherName}</Text>
              {item.otherUserData?.specialty && !isDoctor && (
                <Text style={dynamicStyles.infoSubtext}>{item.otherUserData.specialty}</Text>
              )}
              {item.otherUserData?.phone && (
                <Text style={dynamicStyles.infoSubtext}>Tel: {item.otherUserData.phone}</Text>
              )}
            </View>
          </View>

          {item.reason && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="text" size={20} color="#2196F3" />
              <View style={styles.infoContent}>
                <Text style={dynamicStyles.infoLabel}>Motivo de consulta</Text>
                <Text style={dynamicStyles.infoValue}>{item.reason}</Text>
              </View>
            </View>
          )}

          {item.otherUserData?.clinicAddress && !isDoctor && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#2196F3" />
              <View style={styles.infoContent}>
                <Text style={dynamicStyles.infoLabel}>Dirección del consultorio</Text>
                <Text style={dynamicStyles.infoValue}>{item.otherUserData.clinicAddress}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Acciones */}
        {(canDoctorAct || canPatientCancel) && (
          <View style={styles.cardActions}>
            {canDoctorAct && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => onChangeStatus(item.id, 'accepted')}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Aceptar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => onChangeStatus(item.id, 'rejected')}
                >
                  <Ionicons name="close-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Rechazar</Text>
                </TouchableOpacity>
              </>
            )}

            {canPatientCancel && (
              <TouchableOpacity
                style={dynamicStyles.cancelBtn}
                onPress={() => onChangeStatus(item.id, 'cancelled')}
              >
                <Ionicons name="close-circle-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Cancelar cita</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Acciones para doctor en citas pasadas aceptadas */}
        {canDoctorFinalize && (
          <>
            <View style={dynamicStyles.medicalRecordSection}>
              <TouchableOpacity
                style={dynamicStyles.medicalRecordBtn}
                onPress={() =>
                  navigation.navigate('MedicalProfile', {
                    patientId: item.patientId,
                    patientName: item.otherUserData
                      ? `${item.otherUserData.name || ''} ${item.otherUserData.lastName || ''}`.trim()
                      : 'Paciente',
                    viewOnly: true,
                  })
                }
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="account-heart-outline" size={20} color={colors.primary} />
                <Text style={[styles.medicalRecordBtnText, { color: colors.primary }]}>Ver perfil médico</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.completeBtn]}
                onPress={() => onMarkAsCompleted(item.id)}
              >
                <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Completada</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.noShowBtn]}
                onPress={() => onMarkAsNoShow(item.id)}
              >
                <Ionicons name="person-remove-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>No se presentó</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Botones según estado de cita */}
        {item.status === 'accepted' && !canDoctorFinalize && (
          <>
            <View style={dynamicStyles.medicalRecordSection}>
              {!isDoctor ? (
                // Paciente: botón para editar su perfil médico
                <TouchableOpacity
                  style={dynamicStyles.medicalRecordBtn}
                  onPress={() => navigation.navigate('MedicalProfile')}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="account-heart" size={20} color={colors.primary} />
                  <Text style={[styles.medicalRecordBtnText, { color: colors.primary }]}>Mi perfil médico</Text>
                </TouchableOpacity>
              ) : (
                // Doctor: botón para ver perfil médico del paciente
                <TouchableOpacity
                  style={dynamicStyles.medicalRecordBtn}
                  onPress={() =>
                    navigation.navigate('MedicalProfile', {
                      patientId: item.patientId,
                      patientName: item.otherUserData
                        ? `${item.otherUserData.name || ''} ${item.otherUserData.lastName || ''}`.trim()
                        : 'Paciente',
                      viewOnly: true,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="account-heart-outline" size={20} color={colors.primary} />
                  <Text style={[styles.medicalRecordBtnText, { color: colors.primary }]}>Ver perfil médico</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Doctor puede cancelar citas aceptadas futuras */}
            {canDoctorCancel && (
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={dynamicStyles.cancelBtn}
                  onPress={() => onDoctorCancelAppointment(item.id)}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Cancelar cita</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Cita completada: notas del médico */}
        {item.status === 'completed' && (
          <View style={dynamicStyles.medicalRecordSection}>
            {isDoctor ? (
              // Doctor: agregar/editar notas
              <TouchableOpacity
                style={[dynamicStyles.medicalRecordBtn, { borderColor: '#4CAF50', backgroundColor: darkMode ? 'rgba(76, 175, 80, 0.15)' : '#E8F5E9' }]}
                onPress={() =>
                  navigation.navigate('DoctorNotes', {
                    appointmentId: item.id,
                    patientName: item.otherUserData
                      ? `${item.otherUserData.name || ''} ${item.otherUserData.lastName || ''}`.trim()
                      : 'Paciente',
                    appointmentDate: item.slotStart,
                    reason: item.reason,
                  })
                }
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="clipboard-text" size={20} color="#4CAF50" />
                <Text style={[styles.medicalRecordBtnText, { color: '#4CAF50' }]}>Agregar notas médicas</Text>
              </TouchableOpacity>
            ) : (
              // Paciente: ver notas del médico (solo lectura)
              <TouchableOpacity
                style={dynamicStyles.medicalRecordBtn}
                onPress={() =>
                  navigation.navigate('DoctorNotes', {
                    appointmentId: item.id,
                    patientName: 'Mi consulta',
                    appointmentDate: item.slotStart,
                    reason: item.reason,
                    viewOnly: true,
                  })
                }
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.primary} />
                <Text style={[styles.medicalRecordBtnText, { color: colors.primary }]}>Ver notas de la consulta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Botón eliminar para citas completadas, canceladas, rechazadas o no se presentó */}
        {['completed', 'cancelled', 'rejected', 'noShow'].includes(item.status) && (
          <TouchableOpacity
            style={dynamicStyles.deleteBtn}
            onPress={() => onDeleteAppointment(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#EF5350" />
            <Text style={styles.deleteBtnText}>Eliminar cita</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const dynamicStyles = {
    container: {
      ...styles.container,
      backgroundColor: colors.background,
    },
    header: {
      ...styles.header,
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.headerBorder,
    },
    title: {
      ...styles.title,
      color: colors.headerText,
    },
    subtitle: {
      ...styles.subtitle,
      color: colors.headerText,
    },
    loadingContainer: {
      ...styles.loadingContainer,
      backgroundColor: colors.background,
    },
    loadingText: {
      ...styles.loadingText,
      color: colors.textSecondary,
    },
    card: {
      ...styles.card,
      backgroundColor: colors.card,
    },
    cardHighlighted: {
      ...styles.cardHighlighted,
      backgroundColor: colors.card,
      borderColor: colors.primary,
    },
    infoLabel: {
      ...styles.infoLabel,
      color: colors.textLight,
    },
    infoValue: {
      ...styles.infoValue,
      color: colors.text,
    },
    infoSubtext: {
      ...styles.infoSubtext,
      color: colors.textSecondary,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.textSecondary,
    },
    emptySubtext: {
      ...styles.emptySubtext,
      color: colors.textLight,
    },
    medicalRecordSection: {
      ...styles.medicalRecordSection,
      borderTopColor: darkMode ? colors.border : '#E3F2FD',
    },
    medicalRecordBtn: {
      ...styles.medicalRecordBtn,
      backgroundColor: darkMode ? colors.inputBackground : '#E3F2FD',
      borderColor: colors.primary,
    },
    deleteBtn: {
      ...styles.deleteBtn,
      backgroundColor: darkMode ? 'rgba(239, 83, 80, 0.15)' : '#FFEBEE',
      borderColor: darkMode ? 'rgba(239, 83, 80, 0.3)' : '#FFCDD2',
    },
    cancelBtn: {
      ...styles.actionBtn,
      backgroundColor: darkMode ? '#616161' : '#78909C',
    },
  };

  if (loading) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={dynamicStyles.loadingText}>Cargando citas…</Text>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={styles.headerLeft}>
          <Text style={dynamicStyles.title}>{isDoctor ? 'Solicitudes de Citas' : 'Mis Citas'}</Text>
          <Text style={dynamicStyles.subtitle}>
            {filteredRows.length} {filteredRows.length === 1 ? 'cita' : 'citas'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRefresh}
          activeOpacity={0.85}
          style={styles.headerActionButton}
        >
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filtros: 3 botones principales */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          {/* Botón Filtrar (desplegable) - PRIMERO */}
          <View style={styles.filterDropdownWrapper}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                styles.filterDropdownBtn,
                isDropdownFilter() && styles.filterChipActive,
                { backgroundColor: isDropdownFilter() ? colors.primary : colors.inputBackground },
              ]}
              onPress={() => setFilterDropdownVisible(!filterDropdownVisible)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isDropdownFilter() ? getStatusIcon(filter) : 'filter-outline'}
                size={16}
                color={isDropdownFilter() ? '#fff' : colors.textSecondary}
              />
              <Text style={[
                styles.filterChipText,
                { color: isDropdownFilter() ? '#fff' : colors.text },
              ]} numberOfLines={1}>
                {isDropdownFilter() ? getShortFilterLabel(filter) : 'Filtrar'}
              </Text>
              <Ionicons
                name={filterDropdownVisible ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={isDropdownFilter() ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Botón Pendientes */}
          <TouchableOpacity
            style={[
              styles.filterChip,
              filter === 'requested' && styles.filterChipActive,
              { backgroundColor: filter === 'requested' ? '#FFA726' : colors.inputBackground },
            ]}
            onPress={() => {
              setFilter('requested');
              setFilterDropdownVisible(false);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={filter === 'requested' ? '#fff' : colors.textSecondary}
            />
            <Text style={[
              styles.filterChipText,
              { color: filter === 'requested' ? '#fff' : colors.text },
            ]}>
              Pendientes
            </Text>
          </TouchableOpacity>

          {/* Botón Aceptadas */}
          <TouchableOpacity
            style={[
              styles.filterChip,
              filter === 'accepted' && styles.filterChipActive,
              { backgroundColor: filter === 'accepted' ? '#66BB6A' : colors.inputBackground },
            ]}
            onPress={() => {
              setFilter('accepted');
              setFilterDropdownVisible(false);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={filter === 'accepted' ? '#fff' : colors.textSecondary}
            />
            <Text style={[
              styles.filterChipText,
              { color: filter === 'accepted' ? '#fff' : colors.text },
            ]}>
              Aceptadas
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Menú desplegable - posición fija fuera del wrapper */}
        {filterDropdownVisible && (
          <View style={[styles.filterDropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {getDropdownOptions().map((option, index) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterDropdownItem,
                  filter === option.value && { backgroundColor: colors.primary + '15' },
                  index === getDropdownOptions().length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => {
                  setFilter(option.value);
                  setFilterDropdownVisible(false);
                }}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={filter === option.value ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterDropdownItemText,
                    { color: filter === option.value ? colors.primary : colors.text },
                    filter === option.value && { fontWeight: '700' },
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {filter === option.value && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Lista de citas */}
      <FlatList
        ref={flatListRef}
        data={filteredRows}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filteredRows.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setFilterDropdownVisible(false)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2196F3']}
          />
        }
        onScrollToIndexFailed={(info) => {
          // Manejar el caso donde el scroll falla
          const wait = new Promise(resolve => setTimeout(resolve, 500));
          wait.then(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
          });
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-blank" size={80} color="#ccc" />
            <Text style={dynamicStyles.emptyText}>No hay citas registradas</Text>
            <Text style={dynamicStyles.emptySubtext}>
              {isDoctor
                ? 'Las solicitudes de tus pacientes aparecerán aquí.'
                : 'Solicita una cita con un médico desde la pantalla de inicio.'}
            </Text>
          </View>
        }
      />

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
  // Generales
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#E3F2FD' },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#64B5F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // Filtros - Barra de 3 botones
  filterBarContainer: {
    paddingVertical: 12,
    zIndex: 100,
    position: 'relative',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  filterChipActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterDropdownWrapper: {
    minWidth: 110,
  },
  filterDropdownBtn: {
    justifyContent: 'center',
  },
  filterDropdownMenu: {
    position: 'absolute',
    top: 50,
    left: 16,
    minWidth: 170,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 1000,
  },
  filterDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterDropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Lista
  listContent: { padding: 16, paddingBottom: 32 },
  emptyListContent: { flexGrow: 1 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHighlighted: {
    borderWidth: 2,
    shadowColor: '#2196F3',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 14, fontWeight: '700' },
  pastBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pastText: { fontSize: 11, fontWeight: '600', color: '#F57C00' },

  cardBody: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 4, fontWeight: '600' },
  infoValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  infoTime: { fontSize: 20, color: '#2196F3', fontWeight: '700' },
  infoSubtext: { fontSize: 13, color: '#666', marginTop: 2 },

  cardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  acceptBtn: { backgroundColor: '#66BB6A' },
  rejectBtn: { backgroundColor: '#EF5350' },
  cancelBtn: { backgroundColor: '#9E9E9E' },
  completeBtn: { backgroundColor: '#42A5F5' },
  noShowBtn: { backgroundColor: '#FF7043' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Cuadro médico
  medicalRecordSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E3F2FD',
  },
  medicalRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  medicalRecordBtnText: {
    color: '#2196F3',
    fontWeight: '700',
    fontSize: 14,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  deleteBtnText: {
    color: '#EF5350',
    fontWeight: '600',
    fontSize: 13,
  },

  // Vacío
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});
