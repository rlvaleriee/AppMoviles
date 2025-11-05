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

// ============================
// Configuración por defecto
// ============================
const SLOT_DURATION_MIN = 30; // minutos
const DEFAULT_WORK_SETTINGS = {
  slotDuration: SLOT_DURATION_MIN,
  // 0=Dom ... 6=Sab
  workingDays: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
  // Dos bloques por defecto; puedes agregar más desde el modal si lo deseas
  blocks: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
};

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

const sliceIntervalToSlots = (start, end, duration) => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const d = Math.max(5, duration | 0); // evitar duración inválida
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s + 0) return [];
  const result = [];
  let t = s;
  while (t + d <= e) {
    result.push(fromMinutes(t));
    t += d;
  }
  return result;
};

const uniqueSorted = (arr) => Array.from(new Set(arr)).sort((a, b) => toMinutes(a) - toMinutes(b));

// Para compatibilidad con documentos antiguos que tenían ranges [{start,end}]
const deriveSlotsFromRanges = (ranges = [], duration = SLOT_DURATION_MIN) => {
  const all = [];
  for (const r of ranges) {
    if (r?.start && r?.end) all.push(...sliceIntervalToSlots(r.start, r.end, duration));
  }
  return uniqueSorted(all);
};

export default function DoctorCalendarScreen() {
  const { firebaseUser } = useAuth();

  // ============================
  // Estado
  // ============================
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Indicadores del mes (fecha -> cantidad de cupos seleccionados)
  const [datesWithAvailability, setDatesWithAvailability] = useState({});

  // Ajustes de trabajo
  const [workSettings, setWorkSettings] = useState(DEFAULT_WORK_SETTINGS);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_WORK_SETTINGS);

  // Modal de día (selección de cupos)
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]); // lista maestra generada a partir de los ajustes
  const [selectedSlots, setSelectedSlots] = useState(new Set()); // HH:mm

  // ============================
  // Carga de ajustes y datos del mes
  // ============================
  useEffect(() => {
    loadWorkSettings();
  }, [firebaseUser]);

  useEffect(() => {
    loadMonthAvailabilities();
  }, [currentMonth, firebaseUser, workSettings]);

  const settingsDocRef = () => firebaseUser?.uid
    ? doc(db, 'users', firebaseUser.uid, 'config', 'workSettings')
    : null;

  const availDocRefFor = (dateKey) => firebaseUser?.uid
    ? doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey)
    : null;

  const loadWorkSettings = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    try {
      const ref = settingsDocRef();
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        const merged = {
          slotDuration: data.slotDuration ?? DEFAULT_WORK_SETTINGS.slotDuration,
          workingDays: { ...DEFAULT_WORK_SETTINGS.workingDays, ...(data.workingDays || {}) },
          blocks: Array.isArray(data.blocks) && data.blocks.length > 0 ? data.blocks : DEFAULT_WORK_SETTINGS.blocks,
        };
        setWorkSettings(merged);
        setSettingsDraft(merged);
      } else {
        setWorkSettings(DEFAULT_WORK_SETTINGS);
        setSettingsDraft(DEFAULT_WORK_SETTINGS);
      }
    } catch (e) {
      console.error('Error cargando workSettings:', e);
      setWorkSettings(DEFAULT_WORK_SETTINGS);
      setSettingsDraft(DEFAULT_WORK_SETTINGS);
    }
  }, [firebaseUser]);

  const loadMonthAvailabilities = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    try {
      setCalendarLoading(true);
      const availabilitiesRef = collection(db, 'users', firebaseUser.uid, 'availabilities');
      const snapshot = await getDocs(availabilitiesRef);

      const map = {};
      snapshot.forEach((docSnap) => {
        const dateKey = docSnap.id; // YYYY-MM-DD
        const dateObj = dayjs(dateKey);
        if (dateObj.month() === currentMonth.month() && dateObj.year() === currentMonth.year()) {
          const data = docSnap.data();
          let count = 0;
          if (Array.isArray(data.slots)) {
            count = data.slots.length;
          } else if (Array.isArray(data.ranges)) {
            count = deriveSlotsFromRanges(data.ranges, data.slotDuration || SLOT_DURATION_MIN).length;
          }
          map[dateKey] = count;
        }
      });

      setDatesWithAvailability(map);
    } catch (error) {
      console.error('Error cargando disponibilidades del mes:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, [currentMonth, firebaseUser]);

  // ============================
  // Generación de slots según ajustes
  // ============================
  const generateMasterSlotsForDate = useCallback((date, settings) => {
    const dow = date.day(); // 0..6
    if (!settings?.workingDays?.[dow]) return [];

    const all = [];
    const duration = settings.slotDuration || SLOT_DURATION_MIN;
    (settings.blocks || []).forEach((b) => {
      if (b?.start && b?.end) {
        all.push(...sliceIntervalToSlots(b.start, b.end, duration));
      }
    });
    return uniqueSorted(all);
  }, []);

  const openDayModal = useCallback(async (date) => {
    if (!firebaseUser?.uid) return;
    setSelectedDate(date);

    const dateKey = date.format('YYYY-MM-DD');
    const ref = availDocRefFor(dateKey);

    try {
      const master = generateMasterSlotsForDate(date, workSettings);
      setAvailableSlots(master);

      let previouslySelected = [];
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.slots)) previouslySelected = data.slots;
        else if (Array.isArray(data.ranges)) previouslySelected = deriveSlotsFromRanges(data.ranges, data.slotDuration || SLOT_DURATION_MIN);
      }

      // Mantener sólo los que estén dentro del horario maestro actual
      const selectedSet = new Set(master.filter((t) => previouslySelected.includes(t)));
      setSelectedSlots(selectedSet);
      setDayModalVisible(true);
    } catch (e) {
      console.error('Error cargando disponibilidad de la fecha:', e);
      setAvailableSlots([]);
      setSelectedSlots(new Set());
      setDayModalVisible(true);
    }
  }, [firebaseUser, workSettings, generateMasterSlotsForDate]);

  // ============================
  // Acciones del día (selección de cupos)
  // ============================
  const toggleSlot = (time) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(time)) next.delete(time); else next.add(time);
      return next;
    });
  };

  const selectAll = () => setSelectedSlots(new Set(availableSlots));
  const clearAll = () => setSelectedSlots(new Set());

  const saveDayAvailability = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;
    const dateKey = selectedDate.format('YYYY-MM-DD');
    const ref = availDocRefFor(dateKey);

    try {
      setSaving(true);
      const slots = uniqueSorted(Array.from(selectedSlots));

      if (slots.length === 0) {
        await deleteDoc(ref);
        setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: 0 });
        Alert.alert('Guardado', 'Se eliminó la disponibilidad para esta fecha');
        setDayModalVisible(false);
        return;
      }

      const dateObj = selectedDate.toDate();
      dateObj.setHours(0, 0, 0, 0);

      await setDoc(
        ref,
        {
          date: Timestamp.fromDate(dateObj),
          slots, // <- ahora guardamos los cupos explícitos
          slotDuration: workSettings.slotDuration || SLOT_DURATION_MIN,
          generatedFrom: workSettings.blocks, // opcional, referencial
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: slots.length });
      Alert.alert('Guardado', `Se guardaron ${slots.length} cupo(s)`);
      setDayModalVisible(false);
    } catch (e) {
      console.error('Error guardando disponibilidad:', e);
      Alert.alert('Error', 'No se pudo guardar la disponibilidad');
    } finally {
      setSaving(false);
    }
  };

  const deleteDayAvailability = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;
    const dateKey = selectedDate.format('YYYY-MM-DD');
    const ref = availDocRefFor(dateKey);

    Alert.alert(
      'Eliminar disponibilidad',
      '¿Eliminar todos los cupos de este día?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteDoc(ref);
              setDatesWithAvailability({ ...datesWithAvailability, [dateKey]: 0 });
              setSelectedSlots(new Set());
              Alert.alert('Eliminado', 'La disponibilidad ha sido eliminada');
            } catch (e) {
              console.error('Error eliminando disponibilidad:', e);
              Alert.alert('Error', 'No se pudo eliminar la disponibilidad');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // ============================
  // Configuración (días/horarios)
  // ============================
  const openSettings = () => {
    setSettingsDraft(workSettings);
    setSettingsModalVisible(true);
  };

  const updateWorkingDay = (dow) => {
    setSettingsDraft((prev) => ({
      ...prev,
      workingDays: { ...prev.workingDays, [dow]: !prev.workingDays[dow] },
    }));
  };

  const updateBlock = (index, field, value) => {
    setSettingsDraft((prev) => {
      const blocks = [...prev.blocks];
      blocks[index] = { ...blocks[index], [field]: value };
      return { ...prev, blocks };
    });
  };

  const addBlock = () => {
    setSettingsDraft((prev) => ({ ...prev, blocks: [...prev.blocks, { start: '09:00', end: '10:00' }] }));
  };

  const removeBlock = (index) => {
    setSettingsDraft((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }));
  };

  const saveSettings = async () => {
    if (!firebaseUser?.uid) return;

    // Validar bloques
    const cleanBlocks = (settingsDraft.blocks || [])
      .map((b) => ({ start: b.start?.trim(), end: b.end?.trim() }))
      .filter((b) => Number.isFinite(toMinutes(b.start)) && Number.isFinite(toMinutes(b.end)) && toMinutes(b.end) > toMinutes(b.start));

    if (cleanBlocks.length === 0) {
      Alert.alert('Configurar horario', 'Debes definir al menos un bloque válido (ej: 09:00 a 12:00).');
      return;
    }

    const payload = {
      slotDuration: Math.max(5, settingsDraft.slotDuration | 0) || SLOT_DURATION_MIN,
      workingDays: settingsDraft.workingDays,
      blocks: cleanBlocks,
      updatedAt: Timestamp.now(),
    };

    try {
      await setDoc(settingsDocRef(), payload, { merge: true });
      setWorkSettings(payload);
      setSettingsModalVisible(false);

      // Si hay un día abierto, regenerar los slots maestros
      if (selectedDate) {
        const master = generateMasterSlotsForDate(selectedDate, payload);
        setAvailableSlots(master);
        setSelectedSlots((prev) => new Set(master.filter((t) => prev.has(t)))); // mantener intersección
      }

      Alert.alert('Horario actualizado', 'Tus días de trabajo y horarios fueron guardados.');
    } catch (e) {
      console.error('Error guardando workSettings:', e);
      Alert.alert('Error', 'No se pudo guardar la configuración');
    }
  };

  // ============================
  // Calendario
  // ============================
  const handlePrevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
  const handleNextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));
  const handleToday = () => setCurrentMonth(dayjs());

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
              const isWorkingDay = !!workSettings?.workingDays?.[day.day()];

              const disabled = isPast || !isCurrentMonth || !isWorkingDay; // <- solo días laborables

              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    styles.dayCell,
                    !isCurrentMonth && styles.dayCellOtherMonth,
                    isToday && styles.dayCellToday,
                    isPast && styles.dayCellPast,
                    !isWorkingDay && styles.dayCellNonWorking,
                  ]}
                  onPress={() => !disabled && openDayModal(day)}
                  disabled={disabled}
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
        <Text style={styles.subtitle}>Define tus días/horarios y selecciona cupos disponibles</Text>
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

      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Ir a hoy</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openSettings} style={styles.configButton}>
          <Text style={styles.configButtonText}>⚙️ Configurar horario</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#E3F2FD' }]} />
          <Text style={styles.legendText}>Hoy</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Con cupos</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#F0F0F0' }]} />
          <Text style={styles.legendText}>No laborable</Text>
        </View>
      </View>

      {calendarLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <ScrollView style={styles.calendarContainer} showsVerticalScrollIndicator={false}>
          {renderCalendar()}
        </ScrollView>
      )}

      {/* ================= Day Modal (selección de cupos) ================ */}
      <Modal
        visible={dayModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate?.format('dddd, D [de] MMMM')}
              </Text>
              <TouchableOpacity onPress={() => setDayModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {availableSlots.length === 0 ? (
                <Text style={styles.emptyText}>
                  Este día no es laborable según tu configuración o no hay bloques definidos.
                </Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {availableSlots.map((t) => {
                    const isSelected = selectedSlots.has(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                        onPress={() => toggleSlot(t)}
                      >
                        <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : styles.chipTextUnselected]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              {availableSlots.length > 0 && (
                <>
                  <TouchableOpacity onPress={selectAll} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Seleccionar todo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={clearAll} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Limpiar</Text>
                  </TouchableOpacity>
                </>
              )}

              {selectedSlots.size > 0 && (
                <TouchableOpacity onPress={deleteDayAvailability} style={styles.deleteButton} disabled={saving}>
                  <Text style={styles.deleteButtonText}>Eliminar todos</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={saveDayAvailability} style={styles.saveButton} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.saveButtonText}>Guardar ({selectedSlots.size})</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= Settings Modal ================= */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configurar días y horarios</Text>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.sectionTitle}>Días laborables</Text>
              <View style={styles.dowWrap}>
                {[0,1,2,3,4,5,6].map((d) => (
                  <TouchableOpacity key={d} style={[styles.dowChip, settingsDraft.workingDays?.[d] ? styles.chipSelected : styles.chipUnselected]} onPress={() => updateWorkingDay(d)}>
                    <Text style={[styles.dowText, settingsDraft.workingDays?.[d] ? styles.chipTextSelected : styles.chipTextUnselected]}>
                      {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Bloques horarios</Text>
              {(settingsDraft.blocks || []).map((b, i) => (
                <View key={i} style={styles.blockRow}>
                  <TextInput
                    value={b.start}
                    onChangeText={(v) => updateBlock(i, 'start', v)}
                    placeholder="Inicio (09:00)"
                    keyboardType="numeric"
                    style={styles.timeInput}
                  />
                  <Text style={styles.timeSeparator}>-</Text>
                  <TextInput
                    value={b.end}
                    onChangeText={(v) => updateBlock(i, 'end', v)}
                    placeholder="Fin (12:00)"
                    keyboardType="numeric"
                    style={styles.timeInput}
                  />
                  <TouchableOpacity onPress={() => removeBlock(i)} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity onPress={addBlock} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Agregar bloque</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Duración de cada cita (min)</Text>
              <TextInput
                value={String(settingsDraft.slotDuration)}
                onChangeText={(v) => setSettingsDraft((prev) => ({ ...prev, slotDuration: parseInt(v || '0', 10) || SLOT_DURATION_MIN }))}
                keyboardType="numeric"
                style={[styles.timeInput, { width: 120 }]}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={saveSettings} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Guardar configuración</Text>
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
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  todayButton: { flex: 1, alignSelf: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#2196F3', borderRadius: 10 },
  todayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  configButton: { flex: 1, alignSelf: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#455A64', borderRadius: 10 },
  configButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },

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
  dayCellNonWorking: { backgroundColor: '#F0F0F0' },
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
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333', textTransform: 'capitalize' },
  modalClose: { fontSize: 24, color: '#999' },
  modalBody: { padding: 20, maxHeight: 420 },
  modalFooter: { flexDirection: 'row', flexWrap: 'wrap', padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },

  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, marginVertical: 20 },

  // Chips de slots
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  chipSelected: { backgroundColor: '#C8E6C9', borderColor: '#2E7D32' },
  chipUnselected: { backgroundColor: '#FAFAFA', borderColor: '#E0E0E0' },
  chipText: { fontSize: 14 },
  chipTextSelected: { color: '#1B5E20', fontWeight: '700' },
  chipTextUnselected: { color: '#555' },

  // Botones modales
  secondaryButton: { backgroundColor: '#EEEEEE', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  secondaryButtonText: { color: '#333', fontWeight: '600' },
  deleteButton: { backgroundColor: '#F44336', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  deleteButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  saveButton: { backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexGrow: 1 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },

  // Settings
  sectionTitle: { fontSize: 14, color: '#333', fontWeight: '700', marginBottom: 8 },
  dowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dowChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  dowText: { fontSize: 14 },
  blockRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  timeInput: { flex: 1, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, backgroundColor: '#F9F9F9' },
  timeSeparator: { fontSize: 16, color: '#666' },
  removeButton: { padding: 8 },
  removeButtonText: { fontSize: 20 },
  addButton: { borderWidth: 2, borderColor: '#2196F3', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  addButtonText: { color: '#2196F3', fontSize: 16, fontWeight: '600' },
});
