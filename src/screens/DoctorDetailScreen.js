import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, FlatList,
} from 'react-native';
import {
  doc, getDoc, collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { createAppointment } from '../services/firestore';

/* ========= helpers ========= */
const toStartOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const toEndOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addMinutes   = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const isAfterNow   = (d) => d.getTime() > Date.now();

const parseHHmm = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(v => parseInt(v, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
};
const two = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// Lee users/{doctorId}/availabilities/{YYYY-MM-DD}
const fetchAvailabilityForDate = async (doctorId, date) => {
  try {
    const id = dateKey(date);
    const ref = doc(db, 'users', doctorId, 'availabilities', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data(); // { ranges?: [{start,end}], slotDuration? }
  } catch (e) {
    console.log('fetchAvailabilityForDate error =>', e);
    return null;
  }
};

const fetchAvailableDatesFromDocs = async (doctorId, daysAhead = 60) => {
  const out = [];
  try {
    const colRef = collection(db, 'users', doctorId, 'availabilities');
    const snap = await getDocs(colRef);

    const today0 = toStartOfDay(new Date());
    const end = new Date(today0); end.setDate(end.getDate() + daysAhead);

    snap.forEach((d) => {
      const [y, m, da] = d.id.split('-').map(n => parseInt(n, 10));
      if (!y || !m || !da) return;
      const js = new Date(y, m - 1, da, 12, 0, 0, 0);
      if (js >= today0 && js <= end) out.push(js);
    });

    out.sort((a, b) => a.getTime() - b.getTime());
  } catch (e) {
    console.log('fetchAvailableDatesFromDocs error =>', e);
  }
  return out;
};

/* ========= componente ========= */
export default function DoctorDetailScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const { firebaseUser } = useAuth();

  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  const [daySlots, setDaySlots] = useState([]); // [{ timeLabel, start, end, available }]
  const [selectedTime, setSelectedTime] = useState(null);
  const [requestingAppointment, setRequestingAppointment] = useState(false);

  // Carga doctor + fechas con disponibilidad
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const snap = await getDoc(doc(db, 'users', doctorId));
        if (!snap.exists()) {
          Alert.alert('Error', 'Doctor no encontrado');
          navigation.goBack();
          return;
        }
        const data = { id: snap.id, ...snap.data() };

        // Fallback de schedule (no afecta cuando hay bloques por fecha)
        if (data.role === 'doctor') {
          const base = data.schedule || {};
          data.schedule = {
            timezone: base.timezone || 'America/El_Salvador',
            slotDuration: base.slotDuration || 30,
            days: base.days || {
              '1': [{ start: '09:00', end: '17:00' }],
              '2': [{ start: '09:00', end: '17:00' }],
              '3': [{ start: '09:00', end: '17:00' }],
              '4': [{ start: '09:00', end: '17:00' }],
              '5': [{ start: '09:00', end: '17:00' }],
            },
          };
        }
        setDocData(data);

        const dates = await fetchAvailableDatesFromDocs(doctorId, 60);
        setAvailableDates(dates);
        if (dates.length > 0) setSelectedDate(dates[0]);

        console.log('[DETALLE] fechas con doc:', dates.map(d => dateKey(d)));
      } catch (e) {
        console.error('loadDoctorData error', e);
        Alert.alert('Error', 'No se pudo cargar la información del doctor');
      } finally {
        setLoading(false);
      }
    })();
  }, [doctorId, navigation]);

  // Regenerar slots al cambiar fecha
  useEffect(() => {
    if (!selectedDate) { setDaySlots([]); return; }

    (async () => {
      console.log('[DETALLE] regenerando para', dateKey(selectedDate));
      const perDate = await fetchAvailabilityForDate(doctorId, selectedDate);

      let slots = [];

      if (perDate?.ranges && Array.isArray(perDate.ranges) && perDate.ranges.length > 0) {
        // MODO BLOQUES GUARDADOS: 1 botón por bloque (HH:mm – HH:mm)
        slots = perDate.ranges
          .map((r) => {
            if (!r?.start || !r?.end) return null;
            const { h: sh, m: sm } = parseHHmm(String(r.start));
            const { h: eh, m: em } = parseHHmm(String(r.end));
            const start = new Date(selectedDate); start.setHours(sh, sm, 0, 0);
            const end   = new Date(selectedDate); end.setHours(eh, em, 0, 0);
            if (end <= start) return null;
            const label = `${two(sh)}:${two(sm)} – ${two(eh)}:${two(em)}`;
            return { timeLabel: label, start, end };
          })
          .filter(Boolean);
      } else if (docData?.schedule) {
        // SIN BLOQUES por fecha → usar schedule
        const wd = selectedDate.getDay();
        const ranges = docData.schedule.days?.[String(wd)] || [];
        const duration = docData.schedule.slotDuration || 30;
        for (const r of ranges) {
          const { h: sh, m: sm } = parseHHmm(r.start);
          const { h: eh, m: em } = parseHHmm(r.end);
          const rangeStart = new Date(selectedDate); rangeStart.setHours(sh, sm, 0, 0);
          const rangeEnd   = new Date(selectedDate); rangeEnd.setHours(eh, em, 0, 0);
          let cur = new Date(rangeStart);
          while (addMinutes(cur, duration) <= rangeEnd) {
            const next = addMinutes(cur, duration);
            const label = `${two(cur.getHours())}:${two(cur.getMinutes())}`;
            slots.push({ timeLabel: label, start: new Date(cur), end: next });
            cur = next;
          }
        }
      }

      // marcar ocupados/pasados
      const busy = await fetchBusySet(doctorId, selectedDate);
      const accepts = docData?.acceptsNewPatients !== false;
      const merged = slots.map(s => ({
        ...s,
        available: accepts && !busy.has(s.start.getTime()) && isAfterNow(s.start),
      }));

      console.log('[DETALLE] bloques leídos:', perDate?.ranges, '→ slots mostrados:', merged.length);
      setDaySlots(merged);
    })();
  }, [selectedDate, doctorId, docData?.schedule, docData?.acceptsNewPatients]);

  // Ocupados del día
  const fetchBusySet = async (doctorId, date) => {
    const dayStart = Timestamp.fromDate(toStartOfDay(date));
    const dayEnd   = Timestamp.fromDate(toEndOfDay(date));
    const qy = query(
      collection(db, 'appointments'),
      where('doctorId', '==', doctorId),
      where('slotStart', '>=', dayStart),
      where('slotStart', '<=', dayEnd)
    );
    const snap = await getDocs(qy);
    const set = new Set();
    snap.forEach((d) => {
      const ts = d.data().slotStart;
      const js = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
      set.add(js.getTime());
    });
    return set;
  };

  // Crear cita (acepta “HH:mm” o “HH:mm – HH:mm”)
  const handleRequestAppointment = async () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert('Selección requerida', 'Selecciona una fecha y un horario/bloque.');
      return;
    }
    try {
      setRequestingAppointment(true);
      const startStr = selectedTime.includes('–') ? selectedTime.split('–')[0].trim() : selectedTime;
      const { h, m } = parseHHmm(startStr);
      const start = new Date(selectedDate); start.setHours(h, m, 0, 0);

      // evitar doble reserva
      const busy = await fetchBusySet(doctorId, selectedDate);
      if (busy.has(start.getTime())) {
        Alert.alert('Cupo no disponible', 'El cupo fue tomado por otro paciente. Elige otro.');
        setSelectedTime(null); return;
      }

      await createAppointment({
        patientId: firebaseUser?.uid,
        doctorId,
        reason: 'Consulta médica',
        slotStart: start,
        status: 'pending',
      });

      Alert.alert(
        'Solicitud enviada',
        `Tu solicitud para el ${start.toLocaleDateString('es-ES')} a las ${two(h)}:${two(m)} fue enviada.`,
        [{ text: 'Ver mis citas', onPress: () => navigation.navigate('Appointments') }, { text: 'Cerrar' }]
      );
    } catch (e) {
      console.error('createAppointment error', e);
      Alert.alert('Error', 'No se pudo crear la solicitud de cita');
    } finally {
      setRequestingAppointment(false);
    }
  };

  /* ========= UI ========= */
  const renderDateItem = ({ item }) => {
    const isSelected = selectedDate && toStartOfDay(selectedDate).getTime() === toStartOfDay(item).getTime();
    const dayName = item.toLocaleDateString('es-ES', { weekday: 'short' });
    return (
      <TouchableOpacity
        style={[styles.dateCard, isSelected && styles.dateCardSelected]}
        onPress={() => { setSelectedDate(item); setSelectedTime(null); }}
      >
        <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{dayName}</Text>
        <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{item.getDate()}</Text>
        <Text style={[styles.monthName, isSelected && styles.monthNameSelected]}>
          {item.toLocaleDateString('es-ES', { month: 'short' })}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTimeSlot = (slot) => {
    const isSelected = selectedTime === slot.timeLabel;
    return (
      <TouchableOpacity
        key={`${slot.timeLabel}-${slot.start.getTime()}`}
        style={[
          styles.timeSlot,
          isSelected && styles.timeSlotSelected,
          !slot.available && styles.timeSlotDisabled,
        ]}
        onPress={() => slot.available && setSelectedTime(slot.timeLabel)}
        disabled={!slot.available}
      >
        <Text style={[
          styles.timeText,
          isSelected && styles.timeTextSelected,
          !slot.available && styles.timeTextDisabled,
        ]}>
          {slot.timeLabel}
        </Text>
        {!slot.available && (
          <Text style={styles.disabledLabel}>{isAfterNow(slot.start) ? 'Ocupado' : 'Pasado'}</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Cargando información del doctor...</Text>
      </View>
    );
  }

  if (!docData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Doctor no encontrado</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalles del Doctor</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Info doctor */}
        <View style={styles.doctorCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="stethoscope" size={40} color="#2196F3" />
            </View>
          </View>

          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>Dr. {docData.name} {docData.lastName || ''}</Text>
            <Text style={styles.doctorSpecialty}>
              {docData.cssp?.profession || docData.specialty || 'Médico General'}
            </Text>
            {docData.cssp && (
              <View style={styles.csspBadge}>
                <MaterialCommunityIcons name="certificate" size={16} color="#4CAF50" />
                <Text style={styles.csspText}>
                  {docData.cssp.board}{docData.cssp.boardNumber ? ` - ${docData.cssp.boardNumber}` : ''}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.contactSection}>
            {docData.phone && (
              <View style={styles.contactRow}>
                <Ionicons name="call" size={20} color="#2196F3" />
                <Text style={styles.contactText}>{docData.phone}</Text>
              </View>
            )}
            {docData.email && (
              <View style={styles.contactRow}>
                <Ionicons name="mail" size={20} color="#2196F3" />
                <Text style={styles.contactText}>{docData.email}</Text>
              </View>
            )}
            {docData.clinicAddress && (
              <View style={styles.contactRow}>
                <Ionicons name="location" size={20} color="#2196F3" />
                <Text style={styles.contactText}>{docData.clinicAddress}</Text>
              </View>
            )}
          </View>

          {typeof docData.verified !== 'undefined' && (
            <View style={styles.availabilityBadge}>
              <MaterialCommunityIcons
                name={docData.verified ? 'check-circle' : 'close-circle'}
                size={20}
                color={docData.verified ? '#4CAF50' : '#EF5350'}
              />
              <Text style={[
                styles.availabilityText,
                { color: docData.verified ? '#4CAF50' : '#EF5350' },
              ]}>
                {docData.verified ? 'Doctor verificado' : 'No verificado'}
              </Text>
            </View>
          )}
        </View>

        {/* Fechas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Selecciona una fecha</Text>
          {availableDates.length === 0 ? (
            <Text style={{ color: '#666' }}>No hay días con horarios configurados.</Text>
          ) : (
            <FlatList
              horizontal
              data={availableDates}
              renderItem={renderDateItem}
              keyExtractor={(it) => it.toISOString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.datesContainer}
            />
          )}
        </View>

        {/* Horarios / Bloques */}
        {selectedDate && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selecciona un horario</Text>
            {daySlots.length === 0 ? (
              <Text style={{ color: '#666' }}>
                No hay horarios para esta fecha. El doctor podría no atender este día
                o sus bloques aún no fueron configurados.
              </Text>
            ) : (
              <View style={styles.timeSlotsContainer}>
                {daySlots.map(renderTimeSlot)}
              </View>
            )}
          </View>
        )}

        {/* Confirmación */}
        {selectedDate && selectedTime && (
          <View style={styles.requestSection}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumen de tu cita</Text>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="calendar" size={20} color="#666" />
                <Text style={styles.summaryText}>
                  {selectedDate.toLocaleDateString('es-ES', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="clock" size={20} color="#666" />
                <Text style={styles.summaryText}>{selectedTime}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.requestButton, requestingAppointment && styles.requestButtonDisabled]}
              onPress={handleRequestAppointment}
              disabled={requestingAppointment}
            >
              {requestingAppointment
                ? <ActivityIndicator color="#fff" />
                : (<><Ionicons name="calendar" size={20} color="#fff" /><Text style={styles.requestButtonText}>Solicitar Cita</Text></>)}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

/* ========= estilos ========= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  errorText: { fontSize: 18, color: '#666', marginBottom: 20 },
  backButton: { backgroundColor: '#2196F3', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  backButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  header: {
    backgroundColor: '#2196F3', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  doctorCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    borderRadius: 12, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  avatarContainer: { alignItems: 'center', marginBottom: 16 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E3F2FD',
    justifyContent: 'center', alignItems: 'center',
  },
  doctorInfo: { alignItems: 'center', marginBottom: 16 },
  doctorName: { fontSize: 24, fontWeight: '700', color: '#333', marginBottom: 6, textAlign: 'center' },
  doctorSpecialty: { fontSize: 16, color: '#2196F3', marginBottom: 8, textAlign: 'center' },
  csspBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 4, gap: 6,
  },
  csspText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  contactSection: { borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingTop: 16, gap: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactText: { fontSize: 14, color: '#666', flex: 1 },
  availabilityBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f9f9f9',
  },
  availabilityText: { fontSize: 14, fontWeight: '600' },

  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  datesContainer: { paddingVertical: 8, gap: 12 },
  dateCard: {
    width: 70, paddingVertical: 12, paddingHorizontal: 8, backgroundColor: '#fff',
    borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#e0e0e0', marginRight: 12,
  },
  dateCardSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  dayName: { fontSize: 12, color: '#999', marginBottom: 4, textTransform: 'uppercase' },
  dayNameSelected: { color: '#fff' },
  dayNumber: { fontSize: 24, fontWeight: '700', color: '#333', marginBottom: 2 },
  monthName: { fontSize: 12, color: '#666', textTransform: 'capitalize' },
  monthNameSelected: { color: '#fff' },

  timeSlotsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeSlot: {
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0', minWidth: 120, alignItems: 'center',
  },
  timeSlotSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  timeSlotDisabled: { backgroundColor: '#f5f5f5', borderColor: '#e0e0e0', opacity: 0.6 },
  timeText: { fontSize: 14, fontWeight: '600', color: '#333' },
  timeTextSelected: { color: '#fff' },
  timeTextDisabled: { color: '#999' },
  disabledLabel: { fontSize: 10, color: '#999', marginTop: 4, fontWeight: '500' },

  requestSection: { marginHorizontal: 16, marginTop: 8 },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  summaryText: { fontSize: 15, color: '#666', textTransform: 'capitalize' },
  requestButton: {
    backgroundColor: '#2196F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 4,
  },
  requestButtonDisabled: { backgroundColor: '#90CAF9' },
  requestButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
