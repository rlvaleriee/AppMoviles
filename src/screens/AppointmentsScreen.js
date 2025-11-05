import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  subscribeAppointmentsForUser,
  acceptAppointment,
  rejectAppointment,
  cancelAppointment,
  getUserById,
} from '../services/firestore';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

export default function AppointmentsScreen() {
  const { firebaseUser, currentUserData } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'requested', 'accepted', 'rejected', 'cancelled'

  const isDoctor = currentUserData?.role === 'doctor';

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

    // Fallback anti-atasco
    const safety = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 1000);

    return () => {
      clearTimeout(safety);
      unsub && unsub();
    };
  }, [firebaseUser?.uid, isDoctor]);

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

    Alert.alert(
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
              Alert.alert('Éxito', `Cita ${actionNames[nextStatus]}da correctamente`);
            } catch (e) {
              Alert.alert('Error', e?.message || 'No se pudo actualizar la cita');
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
      default:          return '#999';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'requested': return 'clock-outline';
      case 'accepted':  return 'checkmark-circle';
      case 'rejected':  return 'close-circle';
      case 'cancelled': return 'ban';
      case 'completed': return 'checkmark-done-circle';
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
      default:          return status;
    }
  };

  const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const renderItem = ({ item }) => {
    const slotDate =
      item?.slotStart?.toDate?.() instanceof Date
        ? item.slotStart.toDate()
        : new Date(item?.slotStart);

    const canDoctorAct = isDoctor && item.status === 'requested';
    const canPatientCancel =
      !isDoctor && !['cancelled', 'completed', 'rejected'].includes(item.status);

    const otherName = item.otherUserData
      ? `${item.otherUserData.name || ''} ${item.otherUserData.lastName || ''}`.trim()
      : isDoctor ? item.patientId : item.doctorId;

    const isPast = slotDate < new Date();

    return (
      <View style={styles.card}>
        {/* Header de la tarjeta */}
        <View style={styles.cardHeader}>
          <View style={styles.statusBadge}>
            <Ionicons name={getStatusIcon(item.status)} size={18} color={getStatusColor(item.status)} />
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
              <Text style={styles.infoLabel}>Fecha y hora</Text>
              <Text style={styles.infoValue}>
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
              <Text style={styles.infoLabel}>{isDoctor ? 'Paciente' : 'Médico'}</Text>
              <Text style={styles.infoValue}>{otherName}</Text>
              {item.otherUserData?.specialty && !isDoctor && (
                <Text style={styles.infoSubtext}>{item.otherUserData.specialty}</Text>
              )}
              {item.otherUserData?.phone && (
                <Text style={styles.infoSubtext}>Tel: {item.otherUserData.phone}</Text>
              )}
            </View>
          </View>

          {item.reason && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="text" size={20} color="#2196F3" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Motivo de consulta</Text>
                <Text style={styles.infoValue}>{item.reason}</Text>
              </View>
            </View>
          )}

          {item.otherUserData?.clinicAddress && !isDoctor && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#2196F3" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Dirección del consultorio</Text>
                <Text style={styles.infoValue}>{item.otherUserData.clinicAddress}</Text>
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
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => onChangeStatus(item.id, 'cancelled')}
              >
                <Ionicons name="close-circle-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Cancelar cita</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Cargando citas…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header (idéntico a Home) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{isDoctor ? 'Solicitudes de Citas' : 'Mis Citas'}</Text>
          <Text style={styles.subtitle}>
            {filteredRows.length} {filteredRows.length === 1 ? 'cita' : 'citas'}
          </Text>
        </View>

        {/* Botón redondo a la derecha (refresh) */}
        <TouchableOpacity
          onPress={onRefresh}
          activeOpacity={0.85}
          style={styles.headerActionButton}
        >
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Todas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'requested' && styles.filterBtnActive]}
          onPress={() => setFilter('requested')}
        >
          <Text style={[styles.filterText, filter === 'requested' && styles.filterTextActive]}>Pendientes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'accepted' && styles.filterBtnActive]}
          onPress={() => setFilter('accepted')}
        >
          <Text style={[styles.filterText, filter === 'accepted' && styles.filterTextActive]}>Aceptadas</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de citas */}
      <FlatList
        data={filteredRows}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filteredRows.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2196F3']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-blank" size={80} color="#ccc" />
            <Text style={styles.emptyText}>No hay citas registradas</Text>
            <Text style={styles.emptySubtext}>
              {isDoctor
                ? 'Las solicitudes de tus pacientes aparecerán aquí.'
                : 'Solicita una cita con un médico desde la pantalla de inicio.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Generales
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },

  // ===== Header (idéntico a Home azul) =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2196F3',
    paddingTop: 50,        // mismo padding superior que Home
    paddingBottom: 20,     // mismo padding inferior que Home
    paddingHorizontal: 20, // mismo padding horizontal que Home
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#E3F2FD' },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1976D2', // igual al botón del Home
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

  // Filtros
  filterContainer: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  filterBtn: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f5f5f5',
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#666' },
  filterTextActive: { color: '#fff' },

  // Lista
  listContent: { padding: 16, paddingBottom: 32 },
  emptyListContent: { flexGrow: 1 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 14, fontWeight: '700' },
  pastBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pastText: { fontSize: 11, fontWeight: '600', color: '#F57C00' },

  cardBody: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 4, fontWeight: '600' },
  infoValue: { fontSize: 15, color: '#333', fontWeight: '600', marginBottom: 2, textTransform: 'capitalize' },
  infoTime: { fontSize: 20, color: '#2196F3', fontWeight: '700' },
  infoSubtext: { fontSize: 13, color: '#666', marginTop: 2 },

  cardActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8 },
  acceptBtn: { backgroundColor: '#66BB6A' },
  rejectBtn: { backgroundColor: '#EF5350' },
  cancelBtn: { backgroundColor: '#9E9E9E' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Vacío
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
});
