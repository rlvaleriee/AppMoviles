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
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getNearbyDoctors } from '../services/doctorLocationService';
import { listenAppointmentsByUser } from '../services/appointmentService';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const { logout, currentUserData } = useAuth();

  const [nearbyDoctors, setNearbyDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [doctorStats, setDoctorStats] = useState(null);

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
      setDoctorStats({ pending: 0, todayAppts: 0, total: 0 });
      return;
    }
    setLoading(true);
    const unsubscribe = listenAppointmentsByUser({
      uid: currentUserData.uid,
      role: 'doctor',
      cb: (appointments) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pending = appointments.filter((a) => a.status === 'requested').length;
        const todayAppts = appointments.filter((a) => {
          const apptDate = a.slotStart?.toDate?.() || a.slotStart;
          return apptDate && apptDate >= today && apptDate < new Date(today.getTime() + 86400000);
        }).length;
        const total = appointments.length;

        setDoctorStats({ pending, todayAppts, total });
        setLoading(false);
      },
    });
    return unsubscribe;
  };

  const handleLogout = async () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
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
      ],
    );
  };

  const renderDoctorItem = ({ item }) => (
    <TouchableOpacity
      style={styles.doctorCard}
      onPress={() => navigation.navigate('DoctorDetail', { doctorId: item.id })}
    >
      <View style={styles.doctorInfo}>
        <Text style={styles.doctorName}>Dr. {item.name} {item.lastName || ''}</Text>
        <Text style={styles.doctorSpecialty}>{item.cssp?.profession || item.specialty || 'Médico General'}</Text>
        <Text style={styles.doctorDistance}>📍 {item.distance.toFixed(1)} km</Text>
        {item.clinicAddress && (
          <Text style={styles.doctorAddress} numberOfLines={1}>
            {item.clinicAddress}
          </Text>
        )}
      </View>
      <View style={styles.arrowContainer}>
        <Ionicons name="chevron-forward" size={24} color="#2196F3" />
      </View>
    </TouchableOpacity>
  );

  // ================== VISTA PACIENTE ==================
  if (currentUserData?.role === 'patient') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Doctores Cercanos</Text>
            {currentUserData?.name && (
              <Text style={styles.headerSubtitle}>Hola, {currentUserData.name}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
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
            ListHeaderComponent={
              userLocation ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Mostrando doctores a menos de 50 km de tu ubicación
                  </Text>
                </View>
              ) : null
            }
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay doctores cercanos disponibles</Text>
            <Text style={styles.emptySubtext}>
              {!userLocation
                ? 'Activa los permisos de ubicación para ver doctores cercanos'
                : 'Intenta expandir el área de búsqueda'}
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
            <Text style={styles.headerTitle}>Panel de Doctor</Text>
            {currentUserData?.name && (
              <Text style={styles.headerSubtitle}>Dr. {currentUserData.name}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          ) : (
            <>
              <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{doctorStats?.pending || 0}</Text>
                  <Text style={styles.statLabel}>Solicitudes pendientes</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{doctorStats?.todayAppts || 0}</Text>
                  <Text style={styles.statLabel}>Citas hoy</Text>
                </View>
              </View>

              <View style={[styles.statCard, styles.totalCard]}>
                <Text style={styles.statNumber}>{doctorStats?.total || 0}</Text>
                <Text style={styles.statLabel}>Total de citas</Text>
              </View>

              {(!doctorStats || doctorStats.total === 0) && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>¡Bienvenido!</Text>
                  <Text style={styles.infoValue}>
                    Aún no tienes citas registradas. Configura tu disponibilidad para que los pacientes puedan solicitar citas.
                  </Text>
                </View>
              )}

              {currentUserData?.specialty && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Especialidad</Text>
                  <Text style={styles.infoValue}>{currentUserData.specialty}</Text>
                </View>
              )}
              {currentUserData?.clinicAddress && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Consultorio</Text>
                  <Text style={styles.infoValue}>{currentUserData.clinicAddress}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ================== VISTA POR DEFECTO ==================
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Inicio</Text>
          {currentUserData?.name && <Text style={styles.headerSubtitle}>Hola, {currentUserData.name}</Text>}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- generales ---
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Header con el MISMO diseño que el calendario
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingTop: 50,         // mismo padding superior
    paddingBottom: 20,      // mismo padding inferior
    paddingHorizontal: 20,  // mismo padding horizontal
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  headerSubtitle: { fontSize: 14, color: '#E3F2FD' },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1976D2', // contraste sobre el header
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
  scrollContainer: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },

  // --- pacientes ---
  listContainer: { padding: 16, paddingBottom: 100 },
  infoBox: { backgroundColor: '#E3F2FD', padding: 12, borderRadius: 8, marginBottom: 16 },
  infoText: { color: '#1976D2', fontSize: 14, textAlign: 'center' },
  doctorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  doctorInfo: { flex: 1 },
  doctorName: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 4 },
  doctorSpecialty: { fontSize: 14, color: '#2196F3', marginBottom: 4 },
  doctorDistance: { fontSize: 14, color: '#666', marginBottom: 4 },
  doctorAddress: { fontSize: 12, color: '#999' },
  arrowContainer: { marginLeft: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', textAlign: 'center', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', marginBottom: 20 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e0e0e0',
  },
  btn: {
    flex: 1, backgroundColor: '#2196F3', paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: 8, alignItems: 'center',
  },
  btnFullWidth: {
    backgroundColor: '#2196F3', paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 8, alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // --- doctor ---
  statsContainer: { flexDirection: 'row', gap: 12, marginBottom: 12, paddingHorizontal: 16, paddingTop: 16 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  totalCard: { marginBottom: 16, marginHorizontal: 16 },
  statNumber: { fontSize: 36, fontWeight: '700', color: '#2196F3', marginBottom: 8 },
  statLabel: { fontSize: 14, color: '#666', textAlign: 'center' },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, marginHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: '#333', fontWeight: '600' },
  actionButtons: { marginTop: 8, gap: 12 },
  actionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  actionIcon: { fontSize: 32, marginBottom: 12 },
  actionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 6 },
  actionDescription: { fontSize: 14, color: '#666', lineHeight: 20 },
});
