import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, getDoc, deleteDoc, Timestamp, collection, getDocs } from 'firebase/firestore';

dayjs.locale('es');

const SLOT_DURATION_MIN = 30; // duración usada para encadenar

// ==== Helpers de tiempo (HH:mm) ====
const toMinutes = (hhmm) => {
  if (typeof hhmm !== 'string') return NaN;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return NaN;
  return h * 60 + mi;
};
const two = (n) => String(n).padStart(2, '0');
const fromMinutes = (m) => {
  m = Math.max(0, Math.min(24 * 60, m));
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${two(h)}:${two(mi)}`;
};
const addMin = (hhmm, minutes) => fromMinutes(toMinutes(hhmm) + minutes);

// Normaliza, ordena, elimina duplicados y los hace contiguos
const normalizeSequential = (rawSlots, duration = SLOT_DURATION_MIN) => {
  // 1) pasar a minutos, filtrar inválidos y con start < end
  let slots = rawSlots
    .map(s => {
      const a = toMinutes(s.start);
      const b = toMinutes(s.end);
      return { startM: a, endM: b };
    })
    .filter(s => Number.isFinite(s.startM) && Number.isFinite(s.endM));

  // arreglar si alguien puso end <= start: forzar +duration
  slots = slots.map(s => (s.endM <= s.startM ? { ...s, endM: s.startM + duration } : s));

  // limitar al día
  slots = slots.map(s => ({
    startM: Math.max(0, Math.min(24 * 60, s.startM)),
    endM: Math.max(0, Math.min(24 * 60, s.endM)),
  }));

  // 2) ordenar por inicio
  slots.sort((a, b) => a.startM - b.startM);

  // 3) eliminar duplicados exactos
  const dedup = [];
  const keySet = new Set();
  for (const s of slots) {
    const key = `${s.startM}-${s.endM}`;
    if (!keySet.has(key)) {
      keySet.add(key);
      dedup.push(s);
    }
  }

  // 4) hacerlos contiguos (secuenciales) y evitar solapes
  const seq = [];
  for (let i = 0; i < dedup.length; i++) {
    if (i === 0) {
      // garantizar al menos duration
      const end = Math.max(dedup[i].endM, dedup[i].startM + duration);
      seq.push({ startM: dedup[i].startM, endM: Math.min(24 * 60, end) });
    } else {
      const prev = seq[i - 1];
      const startM = prev.endM; // contiguo al anterior
      let endM = Math.max(dedup[i].endM, startM + duration); // al menos duration
      endM = Math.min(24 * 60, endM);
      if (endM <= startM) {
        // si ya no cabe, simplemente no lo añadimos
        continue;
      }
      seq.push({ startM, endM });
    }
  }

  // 5) devolver en HH:mm
  return seq.map((s, idx) => ({
    id: `${s.startM}-${s.endM}-${idx}`,
    start: fromMinutes(s.startM),
    end: fromMinutes(s.endM),
  }));
};

export default function DoctorCalendarScreen() {
  const { firebaseUser } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [timeSlots, setTimeSlots] = useState([]);
  const [datesWithAvailability, setDatesWithAvailability] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMonthAvailabilities();
  }, [currentMonth, firebaseUser]);

  const loadMonthAvailabilities = useCallback(async () => {
    if (!firebaseUser?.uid) return;

    try {
      setLoading(true);
      const availabilitiesRef = collection(db, 'users', firebaseUser.uid, 'availabilities');
      const snapshot = await getDocs(availabilitiesRef);

      const availabilityMap = {};
      snapshot.forEach((docSnap) => {
        const dateKey = docSnap.id; // YYYY-MM-DD
        const dateObj = dayjs(dateKey);
        if (dateObj.month() === currentMonth.month() && dateObj.year() === currentMonth.year()) {
          const data = docSnap.data();
          availabilityMap[dateKey] = data.ranges?.length || 0;
        }
      });

      setDatesWithAvailability(availabilityMap);
    } catch (error) {
      console.error('Error cargando disponibilidades:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, firebaseUser]);

  const loadDateAvailability = async (date) => {
    if (!firebaseUser?.uid) return;

    try {
      const dateKey = date.format('YYYY-MM-DD');
      const docRef = doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const raw = (data.ranges || []).map((r, idx) => ({
          id: `${r.start}-${r.end}-${idx}`,
          start: r.start,
          end: r.end,
        }));
        // normalizamos al abrir para garantizar secuencial
        setTimeSlots(normalizeSequential(raw, data.slotDuration || SLOT_DURATION_MIN));
      } else {
        setTimeSlots([]);
      }
    } catch (error) {
      console.error('Error cargando disponibilidad de fecha:', error);
      setTimeSlots([]);
    }
  };

  const handleDatePress = (date) => {
    setSelectedDate(date);
    loadDateAvailability(date);
    setModalVisible(true);
  };

  const handlePrevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
  const handleNextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));
  const handleToday = () => setCurrentMonth(dayjs());

  // === Añadir bloque al final, contiguo, sin duplicar ===
  const addTimeSlot = () => {
    if (timeSlots.length === 0) {
      const start = '09:00';
      const end = addMin(start, SLOT_DURATION_MIN);
      setTimeSlots(normalizeSequential([{ id: Date.now().toString(), start, end }]));
      return;
    }
    const last = normalizeSequential(timeSlots)[timeSlots.length - 1];
    const start = last.end;
    const end = addMin(start, SLOT_DURATION_MIN);
    const next = [...timeSlots, { id: Date.now().toString(), start, end }];
    setTimeSlots(normalizeSequential(next));
  };

  const removeTimeSlot = (id) => {
    const next = timeSlots.filter((slot) => slot.id !== id);
    setTimeSlots(normalizeSequential(next));
  };

  // Cuando el usuario edita manualmente, normalizamos al vuelo
  const updateTimeSlot = (id, field, value) => {
    const next = timeSlots.map((slot) =>
      slot.id === id ? { ...slot, [field]: value } : slot
    );
    setTimeSlots(normalizeSequential(next));
  };

  const saveAvailability = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;

    try {
      setSaving(true);
      // normalizar y validar final
      const normalized = normalizeSequential(timeSlots, SLOT_DURATION_MIN);

      // si quedó vacío (todo inválido o fuera de rango)
      if (normalized.length === 0) {
        const dateKey = selectedDate.format('YYYY-MM-DD');
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey));
        setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: 0 });
        setTimeSlots([]);
        Alert.alert('Guardado', 'Se eliminó la disponibilidad para esta fecha');
        setModalVisible(false);
        return;
      }

      // construir payload
      const ranges = normalized.map(s => ({ start: s.start, end: s.end }));

      const dateObj = selectedDate.toDate();
      dateObj.setHours(0, 0, 0, 0);
      const dateKey = selectedDate.format('YYYY-MM-DD');

      await setDoc(
        doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey),
        {
          date: Timestamp.fromDate(dateObj),
          ranges,
          slotDuration: SLOT_DURATION_MIN,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: ranges.length });
      setTimeSlots(normalized);
      setModalVisible(false);
      Alert.alert('Guardado', `Se guardaron ${ranges.length} bloque(s) secuenciales`);
    } catch (error) {
      console.error('Error guardando disponibilidad:', error);
      Alert.alert('Error', 'No se pudo guardar la disponibilidad');
    } finally {
      setSaving(false);
    }
  };

  const deleteAvailability = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;

    Alert.alert(
      'Eliminar disponibilidad',
      '¿Eliminar todos los horarios de este día?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const dateKey = selectedDate.format('YYYY-MM-DD');
              await deleteDoc(doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey));
              setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: 0 });
              setTimeSlots([]);
              Alert.alert('Eliminado', 'La disponibilidad ha sido eliminada');
            } catch (error) {
              console.error('Error eliminando disponibilidad:', error);
              Alert.alert('Error', 'No se pudo eliminar la disponibilidad');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const renderCalendar = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startDate = startOfMonth.startOf('week');
    const endDate = endOfMonth.endOf('week');

    const days = [];
    let currentDate = startDate;

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      days.push(currentDate);
      currentDate = currentDate.add(1, 'day');
    }

    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

    return (
      <View style={styles.calendar}>
        <View style={styles.weekDays}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{day}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.weekRow}>
            {row.map((day) => {
              const isCurrentMonth = day.month() === currentMonth.month();
              const isToday = day.isSame(dayjs(), 'day');
              const isPast = day.isBefore(dayjs(), 'day');
              const dateKey = day.format('YYYY-MM-DD');
              const hasAvailability = (datesWithAvailability[dateKey] || 0) > 0;

              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    styles.dayCell,
                    !isCurrentMonth && styles.dayCellOtherMonth,
                    isToday && styles.dayCellToday,
                    isPast && styles.dayCellPast,
                  ]}
                  onPress={() => !isPast && isCurrentMonth && handleDatePress(day)}
                  disabled={isPast || !isCurrentMonth}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !isCurrentMonth && styles.dayTextOtherMonth,
                      isToday && styles.dayTextToday,
                      isPast && styles.dayTextPast,
                    ]}
                  >
                    {day.date()}
                  </Text>
                  {hasAvailability && (
                    <View style={styles.availabilityIndicator}>
                      <Text style={styles.availabilityText}>
                        {datesWithAvailability[dateKey]}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendario de Disponibilidad</Text>
        <Text style={styles.subtitle}>Configura tus horarios disponibles para citas</Text>
      </View>

      <View style={styles.monthNavigation}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>←</Text>
        </TouchableOpacity>

        <View style={styles.monthDisplay}>
          <Text style={styles.monthText}>{currentMonth.format('MMMM YYYY').toUpperCase()}</Text>
        </View>

        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>→</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
        <Text style={styles.todayButtonText}>Ir a hoy</Text>
      </TouchableOpacity>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#E3F2FD' }]} />
          <Text style={styles.legendText}>Hoy</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Con horarios</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <ScrollView style={styles.calendarContainer} showsVerticalScrollIndicator={false}>
          {renderCalendar()}
        </ScrollView>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate?.format('dddd, D [de] MMMM')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {timeSlots.length === 0 ? (
                <Text style={styles.emptyText}>
                  No hay horarios configurados. Presiona "Agregar horario" para comenzar.
                </Text>
              ) : (
                timeSlots.map((slot) => (
                  <View key={slot.id} style={styles.slotRow}>
                    <TextInput
                      style={styles.timeInput}
                      value={slot.start}
                      onChangeText={(val) => updateTimeSlot(slot.id, 'start', val)}
                      placeholder="09:00"
                      keyboardType="numeric"
                    />
                    <Text style={styles.timeSeparator}>-</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={slot.end}
                      onChangeText={(val) => updateTimeSlot(slot.id, 'end', val)}
                      placeholder="09:30"
                      keyboardType="numeric"
                    />
                    <TouchableOpacity onPress={() => removeTimeSlot(slot.id)} style={styles.removeButton}>
                      <Text style={styles.removeButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity onPress={addTimeSlot} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Agregar horario</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              {timeSlots.length > 0 && (
                <TouchableOpacity onPress={deleteAvailability} style={styles.deleteButton} disabled={saving}>
                  <Text style={styles.deleteButtonText}>Eliminar todos</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={saveAvailability} style={styles.saveButton} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#2196F3', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#E3F2FD' },
  monthNavigation: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F5F5F5' },
  navButtonText: { fontSize: 20, color: '#2196F3' },
  monthDisplay: { flex: 1, alignItems: 'center' },
  monthText: { fontSize: 16, fontWeight: '600', color: '#333' },
  todayButton: { alignSelf: 'center', paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#2196F3', borderRadius: 20, marginTop: 10 },
  todayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBox: { width: 16, height: 16, borderRadius: 3 },
  legendText: { fontSize: 12, color: '#666' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calendarContainer: { flex: 1, paddingHorizontal: 10 },
  calendar: {
    backgroundColor: '#fff', borderRadius: 10, padding: 10, marginVertical: 10, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayCell: { flex: 1, alignItems: 'center' },
  weekDayText: { fontSize: 12, fontWeight: '600', color: '#666' },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#fff', position: 'relative',
  },
  dayCellOtherMonth: { backgroundColor: '#F9F9F9' },
  dayCellToday: { backgroundColor: '#E3F2FD', borderColor: '#2196F3' },
  dayCellPast: { opacity: 0.4 },
  dayText: { fontSize: 14, color: '#333' },
  dayTextOtherMonth: { color: '#999' },
  dayTextToday: { color: '#2196F3', fontWeight: 'bold' },
  dayTextPast: { color: '#999' },
  availabilityIndicator: {
    position: 'absolute', bottom: 2, right: 2, backgroundColor: '#4CAF50',
    borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  availabilityText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333', textTransform: 'capitalize' },
  modalClose: { fontSize: 24, color: '#999' },
  modalBody: { padding: 20, maxHeight: 400 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, marginVertical: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  timeInput: { flex: 1, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, backgroundColor: '#F9F9F9' },
  timeSeparator: { fontSize: 16, color: '#666' },
  removeButton: { padding: 8 },
  removeButtonText: { fontSize: 20 },
  addButton: { borderWidth: 2, borderColor: '#2196F3', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  addButtonText: { color: '#2196F3', fontSize: 16, fontWeight: '600' },
  modalFooter: { flexDirection: 'row', padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  deleteButton: { flex: 1, backgroundColor: '#F44336', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  deleteButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#4CAF50', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
