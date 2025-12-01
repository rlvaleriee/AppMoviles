import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { getNearbyDoctors } from '../services/doctorLocationService';
import { listenAppointmentsByUser } from '../services/appointmentService';
import { updateAppointmentStatus, getUserById } from '../services/firestore';
import { getMedicalProfile } from '../services/medicalProfileService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { UserAvatar } from '../components/UserAvatar';

export default function HomeScreen({ navigation }) {
  const { currentUserData, firebaseUser } = useAuth();
  const { colors, darkMode } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const unreadCount = useUnreadNotifications(firebaseUser?.uid);

  const [nearbyDoctors, setNearbyDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [doctorStats, setDoctorStats] = useState(null);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);

  // Estados para modales
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentModalVisible, setAppointmentModalVisible] = useState(false);
  const [allCompletedAppointments, setAllCompletedAppointments] = useState([]);
  const [medicalProfileModalVisible, setMedicalProfileModalVisible] = useState(false);

  // Estados para secciones colapsables (doctor)
  const [todaySectionExpanded, setTodaySectionExpanded] = useState(true);
  const [upcomingSectionExpanded, setUpcomingSectionExpanded] = useState(false);
  const [historySectionExpanded, setHistorySectionExpanded] = useState(false);

  // Cache de nombres de pacientes para evitar llamadas repetidas
  const patientNamesCache = useRef({});

  useEffect(() => {
    if (currentUserData?.role === 'patient' || currentUserData?.role === 'admin') {
      loadNearbyDoctors();
    } else if (currentUserData?.role === 'doctor') {
      const unsubscribe = loadDoctorStats();
      return () => unsubscribe && unsubscribe();
    } else {
      setLoading(false);
    }
  }, [currentUserData]);

  // Verificar si mostrar modal de perfil médico para pacientes
  useEffect(() => {
    const checkMedicalProfilePrompt = async () => {
      if (currentUserData?.role !== 'patient' || !firebaseUser?.uid) return;

      try {
        // Verificar si ya vio el prompt
        const hasSeenPrompt = await AsyncStorage.getItem(`medicalProfilePrompt_${firebaseUser.uid}`);
        if (hasSeenPrompt) return;

        // Verificar si ya tiene perfil médico
        const profile = await getMedicalProfile(firebaseUser.uid);
        if (profile) {
          // Ya tiene perfil, marcar como visto
          await AsyncStorage.setItem(`medicalProfilePrompt_${firebaseUser.uid}`, 'true');
          return;
        }

        // Mostrar modal después de un pequeño delay para mejor UX
        setTimeout(() => {
          setMedicalProfileModalVisible(true);
        }, 1000);
      } catch (error) {
        console.error('Error verificando perfil médico:', error);
      }
    };

    checkMedicalProfilePrompt();
  }, [currentUserData?.role, firebaseUser?.uid]);

  const loadNearbyDoctors = async () => {
    try {
      setLoading(true);

      // 1. Ubicación guardada del perfil (instantánea)
      let location = currentUserData?.location;

      // 2. Si no hay ubicación guardada, obtener del dispositivo
      if (!location?.latitude || !location?.longitude) {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status === 'granted') {
          // Intentar última ubicación conocida primero (instantánea)
          const lastKnown = await Location.getLastKnownPositionAsync();

          if (lastKnown?.coords) {
            location = {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
            };
            setUserLocation(location);

            // Cargar doctores inmediatamente con ubicación conocida
            const doctors = await getNearbyDoctors(location, 50);
            setNearbyDoctors(doctors);
            setLoading(false);

            // Actualizar en background si es necesario
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
              .then(async (current) => {
                const newLoc = {
                  latitude: current.coords.latitude,
                  longitude: current.coords.longitude,
                };
                const diff = Math.abs(newLoc.latitude - location.latitude) +
                             Math.abs(newLoc.longitude - location.longitude);
                if (diff > 0.005) {
                  setUserLocation(newLoc);
                  const updated = await getNearbyDoctors(newLoc, 50);
                  setNearbyDoctors(updated);
                }
              })
              .catch(() => {});

            return;
          }

          // Si no hay última conocida, obtener actual con precisión baja
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          location = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          };
          setUserLocation(location);
        } else {
          setLoading(false);
          showAlert(
            'Permisos requeridos',
            'Para mostrar doctores cercanos necesitamos acceso a tu ubicación.'
          );
          return;
        }
      } else {
        setUserLocation(location);
      }

      // 3. Obtener doctores cercanos
      const doctors = await getNearbyDoctors(location, 50);
      setNearbyDoctors(doctors);
    } catch (error) {
      let errorMessage = 'No se pudieron cargar los doctores cercanos.';
      if (error?.message?.includes('center')) {
        errorMessage = 'Error con la ubicación. Verifica tu ubicación en el perfil.';
      } else if (error?.message?.includes('permission')) {
        errorMessage = 'No se pudo acceder a tu ubicación. Verifica los permisos.';
      }

      showAlert('Error', errorMessage, [
        { text: 'Reintentar', onPress: () => loadNearbyDoctors() },
        { text: 'Cancelar', style: 'cancel' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadDoctorStats = () => {
    if (!currentUserData?.uid) {
      setLoading(false);
      setDoctorStats({
        pending: 0,
        todayAppts: 0,
        total: 0,
        accepted: 0,
        completed: 0,
      });
      return;
    }
    setLoading(true);

    const unsubscribe = listenAppointmentsByUser({
      uid: currentUserData.uid,
      role: 'doctor',
      cb: async (appointments) => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today.getTime() + 86400000);

          // Calcular stats inmediatamente (sin esperar nombres)
          const pending = appointments.filter((a) => a.status === 'requested').length;
          const accepted = appointments.filter((a) => a.status === 'accepted').length;
          const completed = appointments.filter((a) => a.status === 'completed').length;
          const total = appointments.length;

          // Filtrar citas relevantes primero
          const todayCitas = appointments
            .filter((a) => {
              const apptDate = a.slotStart?.toDate?.() || a.slotStart;
              return a.status === 'accepted' && apptDate && apptDate >= today && apptDate < tomorrow;
            })
            .sort((a, b) => {
              const dateA = a.slotStart?.toDate?.() || a.slotStart;
              const dateB = b.slotStart?.toDate?.() || b.slotStart;
              return dateA - dateB;
            });

          const upcoming = appointments
            .filter((a) => {
              const apptDate = a.slotStart?.toDate?.() || a.slotStart;
              return a.status === 'accepted' && apptDate && apptDate >= tomorrow;
            })
            .sort((a, b) => {
              const dateA = a.slotStart?.toDate?.() || a.slotStart;
              const dateB = b.slotStart?.toDate?.() || b.slotStart;
              return dateA - dateB;
            })
            .slice(0, 5);

          const history = appointments
            .filter((a) => a.status === 'completed')
            .sort((a, b) => {
              const dateA = a.slotStart?.toDate?.() || a.slotStart;
              const dateB = b.slotStart?.toDate?.() || b.slotStart;
              return dateB - dateA;
            })
            .slice(0, 5);

          const allCompleted = appointments
            .filter((a) => a.status === 'completed')
            .sort((a, b) => {
              const dateA = a.slotStart?.toDate?.() || a.slotStart;
              const dateB = b.slotStart?.toDate?.() || b.slotStart;
              return dateB - dateA;
            });

          // Mostrar datos inmediatamente (sin nombres)
          setDoctorStats({ pending, todayAppts: todayCitas.length, total, accepted, completed });
          setTodayAppointments(todayCitas);
          setUpcomingAppointments(upcoming);
          setRecentHistory(history);
          setAllCompletedAppointments(allCompleted);
          setLoading(false);

          // Función para agregar nombres a las citas
          const addNames = (list) => list.map((a) => ({
            ...a,
            patientName: a.patientName || patientNamesCache.current[a.patientId] || null,
          }));

          // Cargar nombres de pacientes en background (solo los necesarios)
          const allAppts = [...todayCitas, ...upcoming, ...history, ...allCompleted];
          const patientIds = [...new Set(
            allAppts
              .filter((a) => a.patientId && !patientNamesCache.current[a.patientId])
              .map((a) => a.patientId)
          )];

          if (patientIds.length > 0) {
            // Cargar todos los nombres en paralelo
            await Promise.all(
              patientIds.map(async (id) => {
                try {
                  const patient = await getUserById(id);
                  const name = `${patient?.name || ''} ${patient?.lastName || ''}`.trim() || 'Paciente';
                  patientNamesCache.current[id] = name;
                } catch {
                  patientNamesCache.current[id] = 'Paciente';
                }
              })
            );
          }

          // Siempre actualizar las citas con los nombres del cache
          setTodayAppointments(addNames(todayCitas));
          setUpcomingAppointments(addNames(upcoming));
          setRecentHistory(addNames(history));
          setAllCompletedAppointments(addNames(allCompleted));
        } catch {
          setLoading(false);
        }
      },
    });

    return unsubscribe;
  };


  const onRefresh = async () => {
    setRefreshing(true);
    if (currentUserData?.role === 'patient' || currentUserData?.role === 'admin') {
      await loadNearbyDoctors();
    } else if (currentUserData?.role === 'doctor') {
      loadDoctorStats();
    }
    setRefreshing(false);
  };

  // Handlers para modal de perfil médico
  const handleCompleteMedicalProfile = async () => {
    await AsyncStorage.setItem(`medicalProfilePrompt_${firebaseUser.uid}`, 'true');
    setMedicalProfileModalVisible(false);
    navigation.navigate('MedicalProfile');
  };

  const handleSkipMedicalProfile = async () => {
    await AsyncStorage.setItem(`medicalProfilePrompt_${firebaseUser.uid}`, 'true');
    setMedicalProfileModalVisible(false);
  };

  const formatDate = (date) => {
    const d = date?.toDate ? date.toDate() : date;
    if (!d) return '';

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    const apptDay = new Date(d);
    apptDay.setHours(0, 0, 0, 0);

    if (apptDay.getTime() === today.getTime()) {
      return `Hoy a las ${d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } else if (apptDay.getTime() === tomorrow.getTime()) {
      return `Mañana a las ${d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } else {
      return d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const formatTime = (date) => {
    const d = date?.toDate ? date.toDate() : date;
    if (!d) return '';
    return d.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatHistoryDate = (date) => {
    const d = date?.toDate ? date.toDate() : date;
    if (!d) return '';
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Funciones para modales y acciones
  const openAppointmentDetail = (appointment) => {
    setSelectedAppointment(appointment);
    setAppointmentModalVisible(true);
  };

  const closeAppointmentDetail = () => {
    setAppointmentModalVisible(false);
    setSelectedAppointment(null);
  };

  const markAsAttended = async () => {
    if (!selectedAppointment?.id) return;

    showAlert(
      'Marcar como atendido',
      '¿Confirmas que el paciente fue atendido?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateAppointmentStatus(selectedAppointment.id, 'completed');
              showAlert('Éxito', 'La cita ha sido marcada como completada');
              closeAppointmentDetail();
            } catch {
              showAlert('Error', 'No se pudo actualizar el estado de la cita');
            }
          },
        },
      ]
    );
  };

  const markAsNoShow = async () => {
    if (!selectedAppointment?.id) return;

    showAlert(
      'Paciente no se presentó',
      '¿Confirmas que el paciente no asistió a la cita?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateAppointmentStatus(selectedAppointment.id, 'noShow');
              showAlert('Registrado', 'La cita ha sido marcada como no presentada');
              closeAppointmentDetail();
            } catch {
              showAlert('Error', 'No se pudo actualizar el estado de la cita');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'requested':
        return '#FF9800';
      case 'accepted':
        return '#2196F3';
      case 'completed':
        return '#4CAF50';
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'requested':
        return 'Pendiente';
      case 'accepted':
        return 'Confirmada';
      case 'completed':
        return 'Completada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const renderDoctorItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={dynamicStyles.doctorCard}
        onPress={() => navigation.navigate('DoctorDetail', { doctorId: item.id })}
        activeOpacity={0.8}
      >
        <UserAvatar
          userId={item.id}
          name={item.name}
          photoURL={item.photoURL}
          size={46}
          style={{ marginRight: 12 }}
        />
        <View style={styles.doctorInfo}>
          <View style={styles.doctorHeaderRow}>
            <Text style={dynamicStyles.doctorName} numberOfLines={1}>
              Dr. {item.name} {item.lastName || ''}
            </Text>
            {item.verified && (
              <View style={[styles.verifyChip, { backgroundColor: colors.successBackground }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[styles.verifyChipText, { color: colors.success }]}>Verificado</Text>
              </View>
            )}
          </View>
          <Text style={[styles.doctorSpecialty, { color: colors.primary }]}>
            {item.cssp?.profession || item.specialty || 'Médico General'}
          </Text>
          <View style={styles.doctorMetaRow}>
            <View style={[styles.distancePill, { backgroundColor: colors.accentBackground }]}>
              <Ionicons name="location-outline" size={14} color={colors.primary} />
              <Text style={[styles.doctorDistanceText, { color: colors.primary }]}>
                {item.distance.toFixed(1)} km
              </Text>
            </View>
            {item.clinicAddress && (
              <Text style={dynamicStyles.doctorAddress} numberOfLines={1}>
                {item.clinicAddress}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.chevron} />
      </TouchableOpacity>
    );
  };

  // Estilos dinámicos basados en el tema
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
      overflow: 'visible',
    },
    headerTitle: {
      ...styles.headerTitle,
      color: colors.headerText,
    },
    headerSubtitle: {
      ...styles.headerSubtitle,
      color: colors.headerText,
    },
    notificationsButton: {
      ...styles.notificationsButton,
      backgroundColor: darkMode ? 'rgba(66, 165, 245, 0.25)' : 'rgba(29, 110, 156, 0.2)',
      borderColor: darkMode ? 'rgba(66, 165, 245, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    },
    loadingText: {
      ...styles.loadingText,
      color: colors.textSecondary,
    },
    heroCard: {
      ...styles.heroCard,
      backgroundColor: colors.card,
    },
    heroTitle: {
      ...styles.heroTitle,
      color: colors.text,
    },
    heroSubtitle: {
      ...styles.heroSubtitle,
      color: colors.textSecondary,
    },
    infoBox: {
      ...styles.infoBox,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoText: {
      ...styles.infoText,
      color: colors.primary,
    },
    doctorCard: {
      ...styles.doctorCard,
      backgroundColor: colors.card,
    },
    doctorName: {
      ...styles.doctorName,
      color: colors.text,
    },
    doctorAddress: {
      ...styles.doctorAddress,
      color: colors.textSecondary,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.text,
    },
    emptySubtext: {
      ...styles.emptySubtext,
      color: colors.textSecondary,
    },
    // Estilos doctor
    appointmentCard: {
      ...styles.appointmentCard,
      backgroundColor: colors.card,
    },
    appointmentPatient: {
      ...styles.appointmentPatient,
      color: colors.text,
    },
    appointmentStatus: {
      ...styles.appointmentStatus,
      color: colors.textSecondary,
    },
    appointmentReason: {
      ...styles.appointmentReason,
      color: colors.textLight,
    },
    upcomingCard: {
      ...styles.upcomingCard,
      backgroundColor: colors.card,
    },
    upcomingPatient: {
      ...styles.upcomingPatient,
      color: colors.text,
    },
    upcomingReason: {
      ...styles.upcomingReason,
      color: colors.textSecondary,
    },
    historyCard: {
      ...styles.historyCard,
      backgroundColor: colors.card,
    },
    historyPatient: {
      ...styles.historyPatient,
      color: colors.text,
    },
    historyDate: {
      ...styles.historyDate,
      color: colors.textSecondary,
    },
    quickActionCard: {
      ...styles.quickActionCard,
      backgroundColor: colors.card,
    },
    quickActionTitle: {
      ...styles.quickActionTitle,
      color: colors.text,
    },
    quickActionDesc: {
      ...styles.quickActionDesc,
      color: colors.textSecondary,
    },
    welcomeCard: {
      ...styles.welcomeCard,
      backgroundColor: colors.card,
    },
    welcomeTitle: {
      ...styles.welcomeTitle,
      color: colors.text,
    },
    welcomeText: {
      ...styles.welcomeText,
      color: colors.textSecondary,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    // Modal
    modalContainer: {
      ...styles.modalContainer,
      backgroundColor: colors.card,
    },
    modalHeaderTitle: {
      ...styles.modalHeaderTitle,
      color: colors.text,
    },
    modalSectionTitle: {
      ...styles.modalSectionTitle,
      color: colors.textSecondary,
    },
    modalInfoText: {
      ...styles.modalInfoText,
      color: colors.text,
    },
    modalReasonText: {
      ...styles.modalReasonText,
      color: colors.textLight,
    },
    historyModalCard: {
      ...styles.historyModalCard,
      backgroundColor: colors.inputBackground,
    },
    historyModalPatient: {
      ...styles.historyModalPatient,
      color: colors.text,
    },
    historyModalDate: {
      ...styles.historyModalDate,
      color: colors.textSecondary,
    },
    historyModalReason: {
      ...styles.historyModalReason,
      color: colors.textLight,
    },
    emptyHistoryText: {
      ...styles.emptyHistoryText,
      color: colors.textSecondary,
    },
  };

  // ================== VISTA PACIENTE Y ADMIN ==================
  if (currentUserData?.role === 'patient' || currentUserData?.role === 'admin') {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <View style={styles.headerLeft}>
            <Text style={dynamicStyles.headerTitle}>Encuentra tu médico</Text>
            {currentUserData?.name && (
              <Text style={dynamicStyles.headerSubtitle}>
                Hola, <Text style={{ fontWeight: '700' }}>{currentUserData.name}</Text>
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('NotificationsTab')}
            activeOpacity={0.7}
            style={dynamicStyles.notificationsButton}
          >
            <Ionicons name="notifications" size={24} color={colors.headerIcon} />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={dynamicStyles.loadingText}>Buscando doctores cercanos...</Text>
          </View>
        ) : nearbyDoctors.length > 0 ? (
          <FlatList
            data={nearbyDoctors}
            renderItem={renderDoctorItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#2196F3']}
              />
            }
            ListHeaderComponent={
              <View style={{ marginBottom: 16 }}>
                <View style={dynamicStyles.heroCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.heroTitle}>Agenda tu próxima cita</Text>
                    <Text style={dynamicStyles.heroSubtitle}>
                      Explora médicos cerca de ti y reserva en pocos pasos.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.heroButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const parent = navigation.getParent();
                      if (parent) {
                        parent.navigate('AppointmentsTab');
                      } else {
                        navigation.navigate('AppointmentsTab');
                      }
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#fff" />
                    <Text style={styles.heroButtonText}>Mis citas</Text>
                  </TouchableOpacity>
                </View>

                {userLocation && (
                  <View style={dynamicStyles.infoBox}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={colors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={dynamicStyles.infoText}>
                      Mostrando doctores en un radio de 50 km de tu ubicación.
                    </Text>
                  </View>
                )}
              </View>
            }
          />
        ) : (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.accentBackground }]}>
              <Ionicons name="navigate-outline" size={32} color={colors.primary} />
            </View>
            <Text style={dynamicStyles.emptyText}>No hay doctores cercanos disponibles</Text>
            <Text style={dynamicStyles.emptySubtext}>
              {!userLocation
                ? 'Activa los permisos de ubicación para ver doctores cercanos.'
                : 'Intenta reintentar la búsqueda o ampliar el área desde la configuración.'}
            </Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={loadNearbyDoctors}>
              <Text style={styles.btnText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        <CustomAlert
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          buttons={alertConfig.buttons}
          onDismiss={hideAlert}
        />

        {/* Modal para completar perfil médico */}
        <Modal
          visible={medicalProfileModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleSkipMedicalProfile}
        >
          <View style={styles.medicalModalOverlay}>
            <View style={[styles.medicalModalContent, { backgroundColor: colors.card }]}>
              <View style={styles.medicalModalIconContainer}>
                <View style={styles.medicalModalIconCircle}>
                  <Ionicons name="medical" size={40} color="#2196F3" />
                </View>
              </View>

              <Text style={[styles.medicalModalTitle, { color: colors.text }]}>
                Completa tu perfil médico
              </Text>

              <Text style={[styles.medicalModalMessage, { color: colors.textSecondary }]}>
                Para que los doctores puedan atenderte mejor, te recomendamos completar tu información médica (alergias, condiciones, medicamentos, etc.)
              </Text>

              <View style={styles.medicalModalButtons}>
                <TouchableOpacity
                  style={[styles.medicalModalButtonPrimary]}
                  onPress={handleCompleteMedicalProfile}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.medicalModalButtonPrimaryText}>Completar ahora</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.medicalModalButtonSecondary, { backgroundColor: darkMode ? '#333' : '#F3F4F6' }]}
                  onPress={handleSkipMedicalProfile}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.medicalModalButtonSecondaryText, { color: colors.textSecondary }]}>
                    Más tarde
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.medicalModalHint, { color: colors.textSecondary }]}>
                Puedes hacerlo después desde Configuración → Mi perfil médico
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ================== VISTA DOCTOR ==================
  if (currentUserData?.role === 'doctor') {
    // Verificar si el doctor está verificado
    const isVerified = currentUserData?.verified === true;

    // Pantalla de espera para doctores no verificados
    if (!isVerified) {
      return (
        <View style={dynamicStyles.container}>
          <View style={dynamicStyles.header}>
            <View style={styles.headerLeft}>
              <Text style={dynamicStyles.headerTitle}>Panel principal</Text>
              {currentUserData?.name && (
                <Text style={dynamicStyles.headerSubtitle}>
                  Dr. {currentUserData.name}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={dynamicStyles.notificationsButton}
              onPress={() => navigation.navigate('NotificationsTab')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications" size={24} color={colors.headerIcon} />
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.pendingVerificationScrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#2196F3']}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pendingVerificationContainer}>
              {/* Ícono de verificación pendiente */}
              <View style={styles.pendingIconContainer}>
                <Ionicons name="shield-checkmark-outline" size={80} color="#FF9800" />
              </View>

              {/* Título */}
              <Text style={styles.pendingTitle}>
                Cuenta en Revisión
              </Text>

              {/* Descripción */}
              <Text style={styles.pendingDescription}>
                Tu cuenta está siendo verificada por nuestro equipo. Este proceso puede tomar entre 24 a 48 horas.
              </Text>

              {/* Tarjeta informativa */}
              <View style={styles.pendingInfoCard}>
                <View style={styles.pendingInfoRow}>
                  <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  <Text style={styles.pendingInfoText}>
                    Recibirás una notificación cuando tu cuenta sea aprobada
                  </Text>
                </View>
                <View style={[styles.pendingInfoRow, { marginBottom: 0 }]}>
                  <Ionicons name="time-outline" size={22} color="#2196F3" />
                  <Text style={styles.pendingInfoText}>
                    Mientras tanto, puedes explorar la aplicación
                  </Text>
                </View>
              </View>

              {/* Información de contacto */}
              <Text style={styles.pendingContactText}>
                ¿Tienes alguna pregunta? Contacta con nuestro equipo de soporte desde la sección de Configuración
              </Text>

              {/* Indicador de pull to refresh */}
              <View style={styles.pullToRefreshHint}>
                <Ionicons name="arrow-down" size={20} color="#999" />
                <Text style={styles.pullToRefreshText}>
                  Desliza hacia abajo para actualizar
                </Text>
              </View>
            </View>
          </ScrollView>

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

    // Panel normal para doctores verificados
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <View style={styles.headerLeft}>
            <Text style={dynamicStyles.headerTitle}>Panel principal</Text>
            {currentUserData?.name && (
              <Text style={dynamicStyles.headerSubtitle}>
                Dr. {currentUserData.name}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={dynamicStyles.notificationsButton}
            onPress={() => navigation.navigate('NotificationsTab')}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications" size={24} color={colors.headerIcon} />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2196F3']}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          ) : (
            <>
              {/* 1. CITAS DE HOY */}
              {todayAppointments.length > 0 && (
                <View style={styles.section}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => setTodaySectionExpanded(!todaySectionExpanded)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="today" size={22} color="#2196F3" />
                      <Text style={dynamicStyles.sectionTitle}>Citas de Hoy</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{todayAppointments.length}</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={todaySectionExpanded ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={colors.icon}
                    />
                  </TouchableOpacity>

                  {todaySectionExpanded && todayAppointments.map((appointment, index) => (
                    <TouchableOpacity
                      key={appointment.id || index}
                      style={dynamicStyles.appointmentCard}
                      onPress={() => openAppointmentDetail(appointment)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.appointmentTimeColumn}>
                        <Text style={styles.appointmentTimeText}>
                          {formatTime(appointment.slotStart)}
                        </Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(appointment.status) },
                          ]}
                        />
                      </View>
                      <View style={styles.appointmentDivider} />
                      <View style={styles.appointmentInfo}>
                        <Text style={dynamicStyles.appointmentPatient} numberOfLines={1}>
                          {appointment.patientName || patientNamesCache.current[appointment.patientId] || 'Cargando...'}
                        </Text>
                        <Text style={dynamicStyles.appointmentStatus}>
                          {getStatusText(appointment.status)}
                        </Text>
                        {appointment.reason && (
                          <Text
                            style={dynamicStyles.appointmentReason}
                            numberOfLines={2}
                          >
                            {appointment.reason}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.chevron}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 2. PRÓXIMAS CITAS */}
              {upcomingAppointments.length > 0 && (
                <View style={styles.section}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => setUpcomingSectionExpanded(!upcomingSectionExpanded)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="calendar" size={22} color="#4CAF50" />
                      <Text style={dynamicStyles.sectionTitle}>Próximas Citas</Text>
                      <View style={[styles.countBadge, { backgroundColor: '#E8F5E9' }]}>
                        <Text style={[styles.countBadgeText, { color: '#4CAF50' }]}>{upcomingAppointments.length}</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={upcomingSectionExpanded ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={colors.icon}
                    />
                  </TouchableOpacity>

                  {upcomingSectionExpanded && upcomingAppointments.map((appointment, index) => (
                    <TouchableOpacity
                      key={appointment.id || index}
                      style={dynamicStyles.upcomingCard}
                      onPress={() => navigation.navigate('AppointmentsTab', {
                        screen: 'AppointmentsMain',
                        params: { highlightAppointmentId: appointment.id }
                      })}
                      activeOpacity={0.75}
                    >
                      <View style={styles.upcomingIconContainer}>
                        <Ionicons
                          name="person-outline"
                          size={22}
                          color="#2196F3"
                        />
                      </View>
                      <View style={styles.upcomingInfo}>
                        <Text style={dynamicStyles.upcomingPatient} numberOfLines={1}>
                          {appointment.patientName || patientNamesCache.current[appointment.patientId] || 'Cargando...'}
                        </Text>
                        <Text style={styles.upcomingTime}>
                          {formatDate(appointment.slotStart)}
                        </Text>
                        {appointment.reason && (
                          <Text style={dynamicStyles.upcomingReason} numberOfLines={1}>
                            {appointment.reason}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.chevron}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 3. HISTORIAL RECIENTE */}
              {recentHistory.length > 0 && (
                <View style={styles.section}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => setHistorySectionExpanded(!historySectionExpanded)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="time" size={22} color="#9C27B0" />
                      <Text style={dynamicStyles.sectionTitle}>Historial Reciente</Text>
                      <View style={[styles.countBadge, { backgroundColor: '#F3E5F5' }]}>
                        <Text style={[styles.countBadgeText, { color: '#9C27B0' }]}>{recentHistory.length}</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={historySectionExpanded ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={colors.icon}
                    />
                  </TouchableOpacity>

                  {historySectionExpanded && (
                    <>
                      {recentHistory.map((appointment, index) => (
                        <TouchableOpacity
                          key={appointment.id || index}
                          style={dynamicStyles.historyCard}
                          onPress={() => navigation.navigate('AppointmentsTab', {
                            screen: 'AppointmentsMain',
                            params: { highlightAppointmentId: appointment.id }
                          })}
                          activeOpacity={0.75}
                        >
                          <View style={styles.historyIconContainer}>
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color="#4CAF50"
                            />
                          </View>
                          <View style={styles.historyInfo}>
                            <Text style={dynamicStyles.historyPatient} numberOfLines={1}>
                              {appointment.patientName || patientNamesCache.current[appointment.patientId] || 'Cargando...'}
                            </Text>
                            <Text style={dynamicStyles.historyDate}>
                              {formatHistoryDate(appointment.slotStart)}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.chevron}
                          />
                        </TouchableOpacity>
                      ))}

                      {allCompletedAppointments.length > 5 && (
                        <TouchableOpacity
                          style={styles.viewAllHistoryButton}
                          onPress={() => navigation.navigate('AppointmentsTab', {
                            screen: 'AppointmentsMain',
                            params: { initialFilter: 'completed' }
                          })}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.viewAllHistoryText}>Ver todas las citas completadas</Text>
                          <Ionicons name="arrow-forward" size={18} color="#9C27B0" />
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* 4. ACCIONES RÁPIDAS */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <Ionicons name="flash" size={22} color="#FF9800" />
                    <Text style={dynamicStyles.sectionTitle}>Acciones Rápidas</Text>
                  </View>
                </View>

                <View style={styles.quickActionsGrid}>
                  {/* Ver Calendario */}
                  <TouchableOpacity
                    style={dynamicStyles.quickActionCard}
                    onPress={() => navigation.navigate('DoctorCalendarTab')}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.quickActionIcon,
                        { backgroundColor: '#E3F2FD' },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={28}
                        color="#2196F3"
                      />
                    </View>
                    <Text style={dynamicStyles.quickActionTitle}>Agenda completa</Text>
                    <Text style={dynamicStyles.quickActionDesc}>
                      Ver disponibilidad
                    </Text>
                  </TouchableOpacity>

                  {/* Buscar Paciente */}
                  <TouchableOpacity
                    style={dynamicStyles.quickActionCard}
                    onPress={() => navigation.navigate('PatientList')}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.quickActionIcon,
                        { backgroundColor: '#E8F5E9' },
                      ]}
                    >
                      <Ionicons
                        name="search-outline"
                        size={28}
                        color="#4CAF50"
                      />
                    </View>
                    <Text style={dynamicStyles.quickActionTitle}>Buscar Paciente</Text>
                    <Text style={dynamicStyles.quickActionDesc}>
                      Ver historial médico
                    </Text>
                  </TouchableOpacity>

                  {/* Configuración */}
                  <TouchableOpacity
                    style={dynamicStyles.quickActionCard}
                    onPress={() => navigation.navigate('Profile')}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.quickActionIcon,
                        { backgroundColor: '#FFF3E0' },
                      ]}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={28}
                        color="#FF9800"
                      />
                    </View>
                    <Text style={dynamicStyles.quickActionTitle}>Configuración</Text>
                    <Text style={dynamicStyles.quickActionDesc}>
                      Perfil y ajustes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Mensaje de bienvenida si no hay citas */}
              {(!doctorStats || doctorStats.total === 0) && (
                <View style={dynamicStyles.welcomeCard}>
                  <Ionicons
                    name="happy-outline"
                    size={46}
                    color="#2196F3"
                  />
                  <Text style={dynamicStyles.welcomeTitle}>¡Bienvenido!</Text>
                  <Text style={dynamicStyles.welcomeText}>
                    Aún no tienes citas registradas. Configura tu disponibilidad
                    para que los pacientes puedan solicitarte una consulta.
                  </Text>
                  <TouchableOpacity
                    style={styles.welcomeButton}
                    onPress={() => navigation.navigate('Profile')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.welcomeButtonText}>
                      Configurar perfil
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* ================== MODAL DE DETALLE DE CITA ================== */}
        <Modal
          visible={appointmentModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeAppointmentDetail}
        >
          <View style={styles.modalOverlay}>
            <View style={dynamicStyles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={dynamicStyles.modalHeaderTitle}>Detalle de la Cita</Text>
                <TouchableOpacity onPress={closeAppointmentDetail}>
                  <Ionicons name="close" size={28} color={colors.icon} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                {selectedAppointment && (
                  <>
                    {/* Información del paciente */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="person" size={20} color="#2196F3" />
                        <Text style={dynamicStyles.modalSectionTitle}>Paciente</Text>
                      </View>
                      <Text style={dynamicStyles.modalInfoText}>
                        {selectedAppointment.patientName || patientNamesCache.current[selectedAppointment.patientId] || 'Paciente'}
                      </Text>
                    </View>

                    {/* Fecha y hora */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="calendar" size={20} color="#2196F3" />
                        <Text style={dynamicStyles.modalSectionTitle}>Fecha y Hora</Text>
                      </View>
                      <Text style={dynamicStyles.modalInfoText}>
                        {formatDate(selectedAppointment.slotStart)}
                      </Text>
                    </View>

                    {/* Estado */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="information-circle" size={20} color="#2196F3" />
                        <Text style={dynamicStyles.modalSectionTitle}>Estado</Text>
                      </View>
                      <View style={styles.statusBadgeModal}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(selectedAppointment.status) },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusTextModal,
                            { color: getStatusColor(selectedAppointment.status) },
                          ]}
                        >
                          {getStatusText(selectedAppointment.status)}
                        </Text>
                      </View>
                    </View>

                    {/* Motivo de consulta */}
                    {selectedAppointment.reason && (
                      <View style={styles.modalSection}>
                        <View style={styles.modalSectionHeader}>
                          <Ionicons name="document-text" size={20} color="#2196F3" />
                          <Text style={dynamicStyles.modalSectionTitle}>Motivo de Consulta</Text>
                        </View>
                        <Text style={dynamicStyles.modalReasonText}>
                          {selectedAppointment.reason}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Acciones */}
              {selectedAppointment && selectedAppointment.status !== 'completed' && selectedAppointment.status !== 'cancelled' && (
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.attendedButton]}
                    onPress={markAsAttended}
                  >
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Paciente Atendido</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.noShowButton]}
                    onPress={markAsNoShow}
                  >
                    <Ionicons name="close-circle" size={22} color="#fff" />
                    <Text style={styles.modalActionButtonText}>No se Presentó</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

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

  // ================== VISTA POR DEFECTO ==================
  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={styles.headerLeft}>
          <Text style={dynamicStyles.headerTitle}>Inicio</Text>
          {currentUserData?.name && (
            <Text style={dynamicStyles.headerSubtitle}>
              Hola, {currentUserData.name}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={dynamicStyles.notificationsButton}
          onPress={() => navigation.navigate('NotificationsTab')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications" size={24} color={colors.headerIcon} />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

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
  // --- generales ---
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'visible',
    zIndex: 10,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: { fontSize: 14, color: '#E3F2FD' },
  logoutButton: {
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
  notificationsButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(29, 110, 156, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'visible',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 999,
    elevation: 10,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  scrollContent: { flex: 1 },
  scrollContainer: { paddingBottom: 32 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },

  // --- PACIENTE ---
  listContainer: { padding: 16, paddingBottom: 100 },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  heroIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#607D8B',
  },
  heroButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  infoText: { fontSize: 13, flex: 1 },

  doctorCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  doctorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
  },
  doctorInfo: { flex: 1 },
  doctorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#263238',
    flex: 1,
  },
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  verifyChipText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  doctorSpecialty: {
    fontSize: 13,
    marginBottom: 4,
  },
  doctorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  doctorDistanceText: { fontSize: 12, marginLeft: 4 },
  doctorAddress: { fontSize: 12, flex: 1 },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#455A64',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#90A4AE',
    textAlign: 'center',
    marginBottom: 20,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // --- DOCTOR: resumen superior ---
  doctorHero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  doctorHeroLeft: { flex: 1, paddingRight: 12 },
  doctorHeroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  doctorHeroSubtitle: {
    fontSize: 13,
    color: '#78909C',
    textTransform: 'capitalize',
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D47A1',
    marginLeft: 4,
  },

  // --- doctor: estadísticas en grid ---
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  statCardMini: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderLeftWidth: 4,
  },
  statPending: { borderLeftColor: '#FF9800' },
  statToday: { borderLeftColor: '#4CAF50' },
  statConfirmed: { borderLeftColor: '#2196F3' },
  statCompleted: { borderLeftColor: '#9C27B0' },
  statIconContainer: { marginBottom: 6 },
  statNumberMini: {
    fontSize: 28,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 2,
  },
  statLabelMini: {
    fontSize: 12,
    color: '#78909C',
    textAlign: 'center',
    fontWeight: '500',
  },

  // --- secciones ---
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#263238',
  },
  countBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  seeAllText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },

  // --- citas de hoy ---
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  appointmentTimeColumn: {
    alignItems: 'center',
    marginRight: 12,
  },
  appointmentTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  appointmentDivider: {
    width: 2,
    height: '100%',
    backgroundColor: '#E0E0E0',
    marginRight: 12,
  },
  appointmentInfo: { flex: 1 },
  appointmentPatient: {
    fontSize: 15,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 4,
  },
  appointmentStatus: {
    fontSize: 12,
    color: '#78909C',
    marginBottom: 4,
  },
  appointmentReason: {
    fontSize: 13,
    color: '#90A4AE',
    lineHeight: 18,
  },

  // --- próximas citas ---
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  upcomingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  upcomingInfo: { flex: 1 },
  upcomingPatient: {
    fontSize: 15,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 4,
  },
  upcomingTime: {
    fontSize: 13,
    color: '#1E88E5',
    marginBottom: 2,
  },
  upcomingReason: {
    fontSize: 12,
    color: '#90A4AE',
  },

  // --- historial ---
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyInfo: { flex: 1 },
  historyPatient: {
    fontSize: 15,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 3,
  },
  historyDate: {
    fontSize: 13,
    color: '#78909C',
  },
  viewAllHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E5F5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  viewAllHistoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9C27B0',
  },

  // --- acciones rápidas ---
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionDesc: {
    fontSize: 11,
    color: '#78909C',
    textAlign: 'center',
  },

  // --- información profesional ---
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTextContainer: { flex: 1, marginLeft: 10 },
  infoLabel: {
    fontSize: 11,
    color: '#90A4AE',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: '#263238',
    fontWeight: '500',
  },

  // --- pantalla de verificación pendiente ---
  pendingVerificationScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 600,
  },
  pendingVerificationContainer: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  pendingIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFE0B2',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 24,
  },
  pendingTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  pendingDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  pendingInfoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  pendingInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  pendingInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  pendingContactText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  pullToRefreshHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pullToRefreshText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },

  // --- bienvenida ---
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#263238',
    marginTop: 12,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 14,
    color: '#607D8B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
  },
  welcomeButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 999,
  },
  welcomeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // --- modales ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#263238',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#607D8B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoText: {
    fontSize: 16,
    color: '#263238',
    fontWeight: '500',
  },
  statusBadgeModal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTextModal: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalReasonText: {
    fontSize: 15,
    color: '#455A64',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  attendedButton: {
    backgroundColor: '#4CAF50',
  },
  noShowButton: {
    backgroundColor: '#FF9800',
  },
  modalActionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // --- modal de historial ---
  emptyHistoryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyHistoryText: {
    fontSize: 16,
    color: '#90A4AE',
    marginTop: 16,
    textAlign: 'center',
  },
  historyModalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  historyModalIconContainer: {
    marginRight: 14,
  },
  historyModalInfo: {
    flex: 1,
  },
  historyModalPatient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 4,
  },
  historyModalDate: {
    fontSize: 14,
    color: '#607D8B',
    marginBottom: 4,
  },
  historyModalReason: {
    fontSize: 13,
    color: '#78909C',
    lineHeight: 18,
  },

  // --- Modal Perfil Médico ---
  medicalModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  medicalModalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  medicalModalIconContainer: {
    marginBottom: 16,
  },
  medicalModalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  medicalModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  medicalModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  medicalModalButtons: {
    width: '100%',
    gap: 12,
  },
  medicalModalButtonPrimary: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  medicalModalButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  medicalModalButtonSecondary: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicalModalButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  medicalModalHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});
