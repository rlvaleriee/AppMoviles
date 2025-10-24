import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  subscribeAppointmentsForUser,
  acceptAppointment,
  rejectAppointment,
  cancelAppointment,
} from '../services/firestore';

export default function AppointmentsScreen() {
  const { firebaseUser, currentUserData } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const isDoctor = currentUserData?.role === 'doctor';

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    setLoading(true);

    const unsub = subscribeAppointmentsForUser(
      firebaseUser.uid,
      isDoctor ? 'doctor' : 'patient',
      (next) => {
        setRows(next);
        setLoading(false);
      }
    );

    return () => unsub && unsub();
  }, [firebaseUser?.uid, isDoctor]);

  const onChangeStatus = async (id, nextStatus) => {
    try {
      if (nextStatus === 'accepted') await acceptAppointment(id);
      else if (nextStatus === 'rejected') await rejectAppointment(id);
      else if (nextStatus === 'cancelled') await cancelAppointment(id);
      else throw new Error('Acción no soportada');
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar la cita');
    }
  };

  const renderItem = ({ item }) => {
    const slotDate =
      item?.slotStart?.toDate?.() instanceof Date
        ? item.slotStart.toDate()
        : new Date(item?.slotStart);

    const canDoctorAct = isDoctor && item.status === 'requested';
    const canPatientCancel =
      !isDoctor && !['cancelled', 'completed', 'rejected'].includes(item.status);

    return (
      <View style={styles.card}>
        <Text style={styles.line}>
          <Text style={styles.bold}>Fecha: </Text>
          {slotDate?.toLocaleString?.() || '—'}
        </Text>

        {item.reason ? (
          <Text style={styles.line}>
            <Text style={styles.bold}>Motivo: </Text>
            {item.reason}
          </Text>
        ) : null}

        <Text style={styles.line}>
          <Text style={styles.bold}>Estado: </Text>
          {item.status}
        </Text>

        {isDoctor ? (
          <Text style={styles.line}>
            <Text style={styles.bold}>Paciente: </Text>
            {item.patientId}
          </Text>
        ) : (
          <Text style={styles.line}>
            <Text style={styles.bold}>Médico: </Text>
            {item.doctorId}
          </Text>
        )}

        <View style={styles.row}>
          {canDoctorAct && (
            <>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => onChangeStatus(item.id, 'accepted')}
              >
                <Text style={styles.btnText}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => onChangeStatus(item.id, 'rejected')}
              >
                <Text style={styles.btnText}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}

          {canPatientCancel && (
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => onChangeStatus(item.id, 'cancelled')}
            >
              <Text style={styles.btnText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: '#555' }}>Cargando citas…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis citas</Text>

      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: '#666' }}>
              {isDoctor ? 'No tienes solicitudes.' : 'Aún no tienes citas.'}
            </Text>
          </View>
        }
        contentContainerStyle={rows.length === 0 && { flexGrow: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#2196F3' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 14,
  },
  line: { marginTop: 4, color: '#444' },
  bold: { fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  btn: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnSecondary: { backgroundColor: '#90CAF9' },
  btnText: { color: '#fff', fontWeight: '700' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
});
