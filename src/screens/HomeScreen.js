import React, { useState, useEffect } from 'react'; 
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getNearbyDoctors } from '../services/doctorLocationService';
import { listenAppointmentsByUser } from '../services/appointmentService';
import { updateAppointmentStatus } from '../services/firestore';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const { logout, currentUserData } = useAuth();

  const [nearbyDoctors, setNearbyDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [doctorStats, setDoctorStats] = useState(null);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);

  // Estados para modales
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentModalVisible, setAppointmentModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [allCompletedAppointments, setAllCompletedAppointments] = useState([]);

  useEffect(() => {
    if (currentUserData?.role === 'patient') {
      loadNearbyDoctors();
    } else if (currentUserData?.role === 'doctor') {
      const unsubscribe = loadDoctorStats();
      return () => unsubscribe && unsubscribe();
    }
  }, [currentUserData]);

  const loadNearbyDoctors = async () => {
    try {
      setLoading(true);

      // 1. Ubicación guardada
      let location = currentUserData?.location;

      // 2. Si no hay, pedir permisos
      if (!location?.latitude || !location?.longitude) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          location = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          };
          setUserLocation(location);
        } else {
          setLoading(false);
          return;
        }
      } else {
        setUserLocation(location);
      }

      // 3. Obtener doctores cercanos
      const doctors = await getNearbyDoctors(location, 50);
      setNearbyDoctors(doctors);
    } catch (error) {
      console.error('Error cargando doctores cercanos:', error);
      Alert.alert('Error', 'No se pudieron cargar los doctores cercanos');
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
        confirmed: 0,
        completed: 0,
      });
      return;
    }
    setLoading(true);
    const unsubscribe = listenAppointmentsByUser({
      uid: currentUserData.uid,
      role: 'doctor',
      cb: (appointments) => {
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 86400000);

        const pending = appointments.filter((a) => a.status === 'requested').length;
        const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
        const completed = appointments.filter((a) => a.status === 'completed').length;

        const todayAppts = appointments.filter((a) => {
          const apptDate = a.slotStart?.toDate?.() || a.slotStart;
          return apptDate && apptDate >= today && apptDate < tomorrow;
        }).length;

        // Citas de hoy (todas las de hoy, ordenadas por hora)
        const todayCitas = appointments
          .filter((a) => {
            const apptDate = a.slotStart?.toDate?.() || a.slotStart;
            return apptDate && apptDate >= today && apptDate < tomorrow;
          })
          .sort((a, b) => {
            const dateA = a.slotStart?.toDate?.() || a.slotStart;
            const dateB = b.slotStart?.toDate?.() || b.slotStart;
            return dateA - dateB;
          });

        // Próximas citas (futuras después de hoy, confirmadas)
        const upcoming = appointments
          .filter((a) => {
            const apptDate = a.slotStart?.toDate?.() || a.slotStart;
            return a.status === 'confirmed' && apptDate && apptDate >= tomorrow;
          })
          .sort((a, b) => {
            const dateA = a.slotStart?.toDate?.() || a.slotStart;
            const dateB = b.slotStart?.toDate?.() || b.slotStart;
            return dateA - dateB;
          })
          .slice(0, 5);

        // Historial reciente (últimas 5 completadas)
        const history = appointments
          .filter((a) => a.status === 'completed')
          .sort((a, b) => {
            const dateA = a.slotStart?.toDate?.() || a.slotStart;
            const dateB = b.slotStart?.toDate?.() || b.slotStart;
            return dateB - dateA;
          })
          .slice(0, 5);

        const total = appointments.length;

        // Todas las citas completadas (para el modal de historial)
        const allCompleted = appointments
          .filter((a) => a.status === 'completed')
          .sort((a, b) => {
            const dateA = a.slotStart?.toDate?.() || a.slotStart;
            const dateB = b.slotStart?.toDate?.() || b.slotStart;
            return dateB - dateA;
          });

        setDoctorStats({ pending, todayAppts, total, confirmed, completed });
        setTodayAppointments(todayCitas);
        setUpcomingAppointments(upcoming);
        setRecentHistory(history);
        setAllCompletedAppointments(allCompleted);
        setLoading(false);
      },
    });
    return unsubscribe;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (currentUserData?.role === 'patient') {
      await loadNearbyDoctors();
    } else if (currentUserData?.role === 'doctor') {
      loadDoctorStats();
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro que deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, cerrar sesión',
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

  const openHistoryModal = () => {
    setHistoryModalVisible(true);
  };

  const closeHistoryModal = () => {
    setHistoryModalVisible(false);
  };

  const markAsAttended = async () => {
    if (!selectedAppointment?.id) return;

    Alert.alert(
      'Marcar como atendido',
      '¿Confirmas que el paciente fue atendido?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateAppointmentStatus(selectedAppointment.id, 'completed');
              Alert.alert('Éxito', 'La cita ha sido marcada como completada');
              closeAppointmentDetail();
            } catch (error) {
              console.error('Error marcando cita como completada:', error);
              Alert.alert('Error', 'No se pudo actualizar el estado de la cita');
            }
          },
        },
      ]
    );
  };

  const markAsNoShow = async () => {
    if (!selectedAppointment?.id) return;

    Alert.alert(
      'Paciente no se presentó',
      '¿Confirmas que el paciente no asistió a la cita?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateAppointmentStatus(selectedAppointment.id, 'cancelled');
              Alert.alert('Registrado', 'La cita ha sido marcada como no presentada');
              closeAppointmentDetail();
            } catch (error) {
              console.error('Error marcando cita como no presentada:', error);
              Alert.alert('Error', 'No se pudo actualizar el estado de la cita');
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
      case 'confirmed':
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
      case 'confirmed':
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
    const initial = (item.name?.[0] || 'D').toUpperCase();
    return (
      <TouchableOpacity
        style={styles.doctorCard}
        onPress={() => navigation.navigate('DoctorDetail', { doctorId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.doctorAvatar}>
          <Text style={styles.doctorAvatarText}>{initial}</Text>
        </View>
        <View style={styles.doctorInfo}>
          <View style={styles.doctorHeaderRow}>
            <Text style={styles.doctorName} numberOfLines={1}>
              Dr. {item.name} {item.lastName || ''}
            </Text>
            {item.verified && (
              <View style={styles.verifyChip}>
                <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                <Text style={styles.verifyChipText}>Verificado</Text>
              </View>
            )}
          </View>
          <Text style={styles.doctorSpecialty}>
            {item.cssp?.profession || item.specialty || 'Médico General'}
          </Text>
          <View style={styles.doctorMetaRow}>
            <View style={styles.distancePill}>
              <Ionicons name="location-outline" size={14} color="#1976D2" />
              <Text style={styles.doctorDistanceText}>
                {item.distance.toFixed(1)} km
              </Text>
            </View>
            {item.clinicAddress && (
              <Text style={styles.doctorAddress} numberOfLines={1}>
                {item.clinicAddress}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#B0BEC5" />
      </TouchableOpacity>
    );
  };

  // ================== VISTA PACIENTE ==================
  if (currentUserData?.role === 'patient') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Encuentra tu médico</Text>
            {currentUserData?.name && (
              <Text style={styles.headerSubtitle}>
                Hola, <Text style={{ fontWeight: '700' }}>{currentUserData.name}</Text>
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Buscando doctores cercanos...</Text>
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
                <View style={styles.heroCard}>
                  <View style={styles.heroIconCircle}>
                    <Ionicons name="medkit-outline" size={26} color="#2196F3" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroTitle}>Agenda tu próxima cita</Text>
                    <Text style={styles.heroSubtitle}>
                      Explora médicos cerca de ti y reserva en pocos pasos.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroButton}
                    onPress={() => navigation.navigate('Appointments')}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#fff" />
                    <Text style={styles.heroButtonText}>Mis citas</Text>
                  </TouchableOpacity>
                </View>

                {userLocation && (
                  <View style={styles.infoBox}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color="#1976D2"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoText}>
                      Mostrando doctores en un radio de 50 km de tu ubicación.
                    </Text>
                  </View>
                )}
              </View>
            }
          />
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="navigate-outline" size={32} color="#2196F3" />
            </View>
            <Text style={styles.emptyText}>No hay doctores cercanos disponibles</Text>
            <Text style={styles.emptySubtext}>
              {!userLocation
                ? 'Activa los permisos de ubicación para ver doctores cercanos.'
                : 'Intenta reintentar la búsqueda o ampliar el área desde la configuración.'}
            </Text>
            <TouchableOpacity style={styles.btn} onPress={loadNearbyDoctors}>
              <Text style={styles.btnText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ================== VISTA DOCTOR ==================
  if (currentUserData?.role === 'doctor') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Panel del Médico</Text>
            {currentUserData?.name && (
              <Text style={styles.headerSubtitle}>
                Dr. {currentUserData.name}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={24} color="#fff" />
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
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="today" size={22} color="#2196F3" />
                      <Text style={styles.sectionTitle}>Citas de Hoy</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('Appointments')}
                    >
                      <Text style={styles.seeAllText}>Ver todas</Text>
                    </TouchableOpacity>
                  </View>

                  {todayAppointments.map((appointment, index) => (
                    <TouchableOpacity
                      key={appointment.id || index}
                      style={styles.appointmentCard}
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
                        <Text style={styles.appointmentPatient} numberOfLines={1}>
                          {appointment.patientName || 'Paciente'}
                        </Text>
                        <Text style={styles.appointmentStatus}>
                          {getStatusText(appointment.status)}
                        </Text>
                        {appointment.reason && (
                          <Text
                            style={styles.appointmentReason}
                            numberOfLines={2}
                          >
                            {appointment.reason}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#B0BEC5"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 2. PRÓXIMAS CITAS */}
              {upcomingAppointments.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="calendar" size={22} color="#4CAF50" />
                      <Text style={styles.sectionTitle}>Próximas Citas</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('Appointments')}
                    >
                      <Text style={styles.seeAllText}>Ver agenda</Text>
                    </TouchableOpacity>
                  </View>

                  {upcomingAppointments.map((appointment, index) => (
                    <TouchableOpacity
                      key={appointment.id || index}
                      style={styles.upcomingCard}
                      onPress={() => navigation.navigate('Appointments')}
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
                        <Text style={styles.upcomingPatient} numberOfLines={1}>
                          {appointment.patientName || 'Paciente'}
                        </Text>
                        <Text style={styles.upcomingTime}>
                          {formatDate(appointment.slotStart)}
                        </Text>
                        {appointment.reason && (
                          <Text style={styles.upcomingReason} numberOfLines={1}>
                            {appointment.reason}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#B0BEC5"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 3. HISTORIAL RECIENTE */}
              {recentHistory.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="time" size={22} color="#9C27B0" />
                      <Text style={styles.sectionTitle}>Historial Reciente</Text>
                    </View>
                    <TouchableOpacity
                      onPress={openHistoryModal}
                    >
                      <Text style={styles.seeAllText}>Ver todo</Text>
                    </TouchableOpacity>
                  </View>

                  {recentHistory.map((appointment, index) => (
                    <TouchableOpacity
                      key={appointment.id || index}
                      style={styles.historyCard}
                      onPress={() => navigation.navigate('Appointments')}
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
                        <Text style={styles.historyPatient} numberOfLines={1}>
                          {appointment.patientName || 'Paciente'}
                        </Text>
                        <Text style={styles.historyDate}>
                          {formatHistoryDate(appointment.slotStart)}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#B0BEC5"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 4. ACCIONES RÁPIDAS */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <Ionicons name="flash" size={22} color="#FF9800" />
                    <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                  </View>
                </View>

                <View style={styles.quickActionsGrid}>
                  {/* Ver Agenda Completa */}
                  <TouchableOpacity
                    style={styles.quickActionCard}
                    onPress={() => navigation.navigate('Appointments')}
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
                    <Text style={styles.quickActionTitle}>Agenda Completa</Text>
                    <Text style={styles.quickActionDesc}>
                      Ver todas tus citas
                    </Text>
                  </TouchableOpacity>

                  {/* Configuración */}
                  <TouchableOpacity
                    style={styles.quickActionCard}
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
                    <Text style={styles.quickActionTitle}>Configuración</Text>
                    <Text style={styles.quickActionDesc}>
                      Perfil y ajustes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Información profesional */}
              {(currentUserData?.specialty ||
                currentUserData?.clinicAddress) && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleContainer}>
                      <Ionicons name="information-circle" size={22} color="#607D8B" />
                      <Text style={styles.sectionTitle}>Mi Información</Text>
                    </View>
                  </View>

                  {currentUserData?.specialty && (
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="medical-outline"
                        size={20}
                        color="#607D8B"
                      />
                      <View style={styles.infoTextContainer}>
                        <Text style={styles.infoLabel}>Especialidad</Text>
                        <Text style={styles.infoValue}>
                          {currentUserData.specialty}
                        </Text>
                      </View>
                    </View>
                  )}

                  {currentUserData?.clinicAddress && (
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="location-outline"
                        size={20}
                        color="#607D8B"
                      />
                      <View style={styles.infoTextContainer}>
                        <Text style={styles.infoLabel}>Consultorio</Text>
                        <Text style={styles.infoValue}>
                          {currentUserData.clinicAddress}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Mensaje de bienvenida si no hay citas */}
              {(!doctorStats || doctorStats.total === 0) && (
                <View style={styles.welcomeCard}>
                  <Ionicons
                    name="happy-outline"
                    size={46}
                    color="#2196F3"
                  />
                  <Text style={styles.welcomeTitle}>¡Bienvenido!</Text>
                  <Text style={styles.welcomeText}>
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
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>Detalle de la Cita</Text>
                <TouchableOpacity onPress={closeAppointmentDetail}>
                  <Ionicons name="close" size={28} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                {selectedAppointment && (
                  <>
                    {/* Información del paciente */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="person" size={20} color="#2196F3" />
                        <Text style={styles.modalSectionTitle}>Paciente</Text>
                      </View>
                      <Text style={styles.modalInfoText}>
                        {selectedAppointment.patientName || 'Paciente'}
                      </Text>
                    </View>

                    {/* Fecha y hora */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="calendar" size={20} color="#2196F3" />
                        <Text style={styles.modalSectionTitle}>Fecha y Hora</Text>
                      </View>
                      <Text style={styles.modalInfoText}>
                        {formatDate(selectedAppointment.slotStart)}
                      </Text>
                    </View>

                    {/* Estado */}
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="information-circle" size={20} color="#2196F3" />
                        <Text style={styles.modalSectionTitle}>Estado</Text>
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
                          <Text style={styles.modalSectionTitle}>Motivo de Consulta</Text>
                        </View>
                        <Text style={styles.modalReasonText}>
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

        {/* ================== MODAL DE HISTORIAL COMPLETO ================== */}
        <Modal
          visible={historyModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeHistoryModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>Historial de Citas Atendidas</Text>
                <TouchableOpacity onPress={closeHistoryModal}>
                  <Ionicons name="close" size={28} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                {allCompletedAppointments.length === 0 ? (
                  <View style={styles.emptyHistoryContainer}>
                    <Ionicons name="document-text-outline" size={60} color="#ccc" />
                    <Text style={styles.emptyHistoryText}>
                      No hay citas completadas aún
                    </Text>
                  </View>
                ) : (
                  allCompletedAppointments.map((appointment, index) => (
                    <View key={appointment.id || index} style={styles.historyModalCard}>
                      <View style={styles.historyModalIconContainer}>
                        <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                      </View>
                      <View style={styles.historyModalInfo}>
                        <Text style={styles.historyModalPatient} numberOfLines={1}>
                          {appointment.patientName || 'Paciente'}
                        </Text>
                        <Text style={styles.historyModalDate}>
                          {formatHistoryDate(appointment.slotStart)} - {formatTime(appointment.slotStart)}
                        </Text>
                        {appointment.reason && (
                          <Text style={styles.historyModalReason} numberOfLines={2}>
                            {appointment.reason}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ================== VISTA POR DEFECTO ==================
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Inicio</Text>
          {currentUserData?.name && (
            <Text style={styles.headerSubtitle}>
              Hola, {currentUserData.name}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
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
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#2196F3',
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
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  infoText: { color: '#1976D2', fontSize: 13, flex: 1 },

  doctorCard: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  verifyChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 2,
  },
  doctorSpecialty: {
    fontSize: 13,
    color: '#1E88E5',
    marginBottom: 4,
  },
  doctorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  doctorDistanceText: { fontSize: 12, color: '#1976D2', marginLeft: 4 },
  doctorAddress: { fontSize: 12, color: '#90A4AE', flex: 1 },

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
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#2196F3',
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
});
