import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { db } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';

dayjs.locale('es');

// ============================
// Configuración por defecto
// ============================
const SLOT_DURATION_MIN = 30;
let blockIdCounter = 1;
const generateBlockId = () => `block_${Date.now()}_${blockIdCounter++}`;

// Nombres de días
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Crear bloques por defecto para cada día
const createDefaultDayBlocks = () => ({
  0: [], // Domingo - no laboral
  1: [{ id: generateBlockId(), start: '09:00', end: '12:00' }, { id: generateBlockId(), start: '14:00', end: '18:00' }],
  2: [{ id: generateBlockId(), start: '09:00', end: '12:00' }, { id: generateBlockId(), start: '14:00', end: '18:00' }],
  3: [{ id: generateBlockId(), start: '09:00', end: '12:00' }, { id: generateBlockId(), start: '14:00', end: '18:00' }],
  4: [{ id: generateBlockId(), start: '09:00', end: '12:00' }, { id: generateBlockId(), start: '14:00', end: '18:00' }],
  5: [{ id: generateBlockId(), start: '09:00', end: '12:00' }, { id: generateBlockId(), start: '14:00', end: '18:00' }],
  6: [{ id: generateBlockId(), start: '09:00', end: '12:00' }], // Sábado medio día
});

const DEFAULT_WORK_SETTINGS = {
  slotDuration: SLOT_DURATION_MIN,
  workingDays: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
  dayBlocks: createDefaultDayBlocks(),
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
  const d = Math.max(5, duration | 0);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s + 0) return [];
  const result = [];
  let t = s;
  while (t + d <= e) {
    result.push(fromMinutes(t));
    t += d;
  }
  return result;
};

const uniqueSorted = (arr) =>
  Array.from(new Set(arr)).sort((a, b) => toMinutes(a) - toMinutes(b));

const deriveSlotsFromRanges = (ranges = [], duration = SLOT_DURATION_MIN) => {
  const all = [];
  for (const r of ranges) {
    if (r?.start && r?.end) all.push(...sliceIntervalToSlots(r.start, r.end, duration));
  }
  return uniqueSorted(all);
};

export default function DoctorCalendarScreen() {
  const { firebaseUser } = useAuth();
  const { colors, darkMode } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();

  // ============================
  // Estado
  // ============================
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Datos del mes: fecha -> { totalSlots, reservedSlots, blocked }
  const [monthData, setMonthData] = useState({});

  // Citas reservadas por fecha: dateKey -> [{ slotTime, patientName, patientId, appointmentId, status }]
  const [appointmentsByDate, setAppointmentsByDate] = useState({});

  // Ajustes de trabajo
  const [workSettings, setWorkSettings] = useState(DEFAULT_WORK_SETTINGS);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_WORK_SETTINGS);

  // TimePicker state
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerDay, setTimePickerDay] = useState(null);
  const [timePickerBlockId, setTimePickerBlockId] = useState(null);
  const [timePickerField, setTimePickerField] = useState(null);
  const [timePickerValue, setTimePickerValue] = useState(new Date());

  // Estado para el día seleccionado en configuración
  const [selectedConfigDay, setSelectedConfigDay] = useState(1); // Lunes por defecto

  // Modal de día (vista de cupos)
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [daySlots, setDaySlots] = useState([]); // lista de slots con estado
  const [isDayBlocked, setIsDayBlocked] = useState(false);

  // Modo edición de cupos
  const [isEditingSlots, setIsEditingSlots] = useState(false);
  const [selectedSlotsToRemove, setSelectedSlotsToRemove] = useState(new Set());

  // ============================
  // Carga de ajustes y datos del mes
  // ============================
  useEffect(() => {
    loadWorkSettings();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    loadMonthData();
    const unsubscribe = subscribeToAppointments();
    return () => unsubscribe && unsubscribe();
  }, [currentMonth, firebaseUser, workSettings]);

  const settingsDocRef = () =>
    firebaseUser?.uid ? doc(db, 'users', firebaseUser.uid, 'config', 'workSettings') : null;

  const availDocRefFor = (dateKey) =>
    firebaseUser?.uid ? doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey) : null;

  const loadWorkSettings = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    try {
      const ref = settingsDocRef();
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();

        // Cargar dayBlocks - asegurar que cada bloque tenga ID
        let dayBlocks = {};
        if (data.dayBlocks) {
          // dayBlocks existe - cargar y asegurar IDs
          for (let day = 0; day < 7; day++) {
            const key = String(day); // Firestore guarda claves como strings
            const blocks = data.dayBlocks[key] || data.dayBlocks[day] || [];
            dayBlocks[day] = blocks.map((b) => ({
              ...b,
              id: b.id || generateBlockId(),
            }));
          }
        } else if (Array.isArray(data.blocks) && data.blocks.length > 0) {
          // Migrar formato antiguo (blocks) a dayBlocks
          const blocksWithIds = data.blocks.map((b) => ({
            ...b,
            id: b.id || generateBlockId(),
          }));
          for (let day = 0; day < 7; day++) {
            dayBlocks[day] = data.workingDays?.[day] ? blocksWithIds.map(b => ({ ...b, id: generateBlockId() })) : [];
          }
        } else {
          dayBlocks = createDefaultDayBlocks();
        }

        const merged = {
          slotDuration: data.slotDuration ?? DEFAULT_WORK_SETTINGS.slotDuration,
          workingDays: { ...DEFAULT_WORK_SETTINGS.workingDays, ...(data.workingDays || {}) },
          dayBlocks,
        };
        setWorkSettings(merged);
        setSettingsDraft(merged);
      } else {
        setWorkSettings(DEFAULT_WORK_SETTINGS);
        setSettingsDraft(DEFAULT_WORK_SETTINGS);
      }
    } catch (e) {
      setWorkSettings(DEFAULT_WORK_SETTINGS);
      setSettingsDraft(DEFAULT_WORK_SETTINGS);
    }
  }, [firebaseUser]);

  // Suscripción a citas del doctor para el mes actual
  const subscribeToAppointments = useCallback(() => {
    if (!firebaseUser?.uid) return null;

    const startOfMonth = currentMonth.startOf('month').toDate();
    const endOfMonth = currentMonth.endOf('month').toDate();

    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('doctorId', '==', firebaseUser.uid),
      where('slotStart', '>=', Timestamp.fromDate(startOfMonth)),
      where('slotStart', '<=', Timestamp.fromDate(endOfMonth))
    );

    return onSnapshot(q, async (snapshot) => {
      const appointmentsMap = {};

      // Obtener nombres de pacientes
      const patientIds = new Set();
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.patientId) patientIds.add(data.patientId);
      });

      // Cargar nombres de pacientes
      const patientNames = {};
      for (const patientId of patientIds) {
        try {
          const patientDoc = await getDoc(doc(db, 'users', patientId));
          if (patientDoc.exists()) {
            const pData = patientDoc.data();
            patientNames[patientId] = `${pData.name || ''} ${pData.lastName || ''}`.trim() || 'Paciente';
          }
        } catch (e) {
          patientNames[patientId] = 'Paciente';
        }
      }

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const slotStart = data.slotStart?.toDate();
        if (!slotStart) return;

        const dateKey = dayjs(slotStart).format('YYYY-MM-DD');
        const slotTime = dayjs(slotStart).format('HH:mm');

        if (!appointmentsMap[dateKey]) {
          appointmentsMap[dateKey] = [];
        }

        appointmentsMap[dateKey].push({
          slotTime,
          patientName: patientNames[data.patientId] || 'Paciente',
          patientId: data.patientId,
          appointmentId: docSnap.id,
          status: data.status,
          reason: data.reason,
        });
      });

      setAppointmentsByDate(appointmentsMap);
    });
  }, [currentMonth, firebaseUser]);

  const loadMonthData = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    try {
      setCalendarLoading(true);

      // 1. Cargar documentos de disponibilidad
      const availabilitiesRef = collection(db, 'users', firebaseUser.uid, 'availabilities');
      const snapshot = await getDocs(availabilitiesRef);

      const map = {};
      snapshot.forEach((docSnap) => {
        const dateKey = docSnap.id;
        const dateObj = dayjs(dateKey);
        if (dateObj.month() === currentMonth.month() && dateObj.year() === currentMonth.year()) {
          const data = docSnap.data();
          let totalSlots = 0;
          if (Array.isArray(data.slots)) {
            totalSlots = data.slots.length;
          } else if (Array.isArray(data.ranges)) {
            totalSlots = deriveSlotsFromRanges(
              data.ranges,
              data.slotDuration || SLOT_DURATION_MIN
            ).length;
          }
          map[dateKey] = {
            totalSlots,
            blocked: data.blocked || false,
            slots: data.slots || [],
            hasAppointments: data.hasAppointments || false, // Marcador de protección
            isMonthSpecific: data.isMonthSpecific || false,
            slotDuration: data.slotDuration || SLOT_DURATION_MIN,
          };
        }
      });

      // 2. Consultar citas activas del mes para marcar días con citas
      // Esto cubre citas creadas ANTES del cambio que agregó hasAppointments
      const startOfMonth = currentMonth.startOf('month').toDate();
      const endOfMonth = currentMonth.endOf('month').toDate();

      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef,
        where('doctorId', '==', firebaseUser.uid),
        where('slotStart', '>=', Timestamp.fromDate(startOfMonth)),
        where('slotStart', '<=', Timestamp.fromDate(endOfMonth)),
        where('status', 'in', ['requested', 'accepted'])
      );

      const appointmentsSnap = await getDocs(appointmentsQuery);

      // Marcar días que tienen citas activas y crear documentos de disponibilidad si no existen
      const daysWithAppointmentsNoDoc = new Map(); // dateKey -> slotDuration de la cita

      appointmentsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const slotStart = data.slotStart?.toDate();
        const slotEnd = data.slotEnd?.toDate();
        if (!slotStart) return;

        const dateKey = dayjs(slotStart).format('YYYY-MM-DD');

        // Calcular duración de la cita si tiene slotEnd
        let appointmentDuration = SLOT_DURATION_MIN;
        if (slotEnd) {
          appointmentDuration = Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000);
        }

        if (map[dateKey]) {
          // Ya existe documento de disponibilidad - marcar que tiene citas
          map[dateKey].hasAppointments = true;
        } else {
          // No existe documento - agregar a lista para crear
          if (!daysWithAppointmentsNoDoc.has(dateKey)) {
            daysWithAppointmentsNoDoc.set(dateKey, appointmentDuration);
          }
        }
      });

      // Para días con citas pero sin documento, generar slots con la duración de la cita
      // y crear el documento en Firestore para futuras consultas
      for (const [dateKey, appointmentDuration] of daysWithAppointmentsNoDoc) {
        const date = dayjs(dateKey);
        const dayOfWeek = date.day();

        // Generar slots usando workSettings pero con la duración de la cita existente
        let slots = [];
        let slotDuration = appointmentDuration;

        if (workSettings?.workingDays?.[dayOfWeek] && workSettings?.dayBlocks) {
          const blocksForDay = workSettings.dayBlocks[dayOfWeek] || workSettings.dayBlocks[String(dayOfWeek)] || [];
          const all = [];
          blocksForDay.forEach((b) => {
            if (b?.start && b?.end) {
              all.push(...sliceIntervalToSlots(b.start, b.end, slotDuration));
            }
          });
          slots = uniqueSorted(all);
        }

        map[dateKey] = {
          totalSlots: slots.length,
          blocked: false,
          slots,
          hasAppointments: true,
          isMonthSpecific: false,
          slotDuration,
        };

        // Crear documento en Firestore para persistir la protección
        try {
          const availRef = doc(db, 'users', firebaseUser.uid, 'availabilities', dateKey);
          const dateObj = date.toDate();
          dateObj.setHours(0, 0, 0, 0);

          await setDoc(availRef, {
            date: Timestamp.fromDate(dateObj),
            slots,
            slotDuration,
            updatedAt: Timestamp.now(),
            blocked: false,
            hasAppointments: true,
          });
        } catch (e) {
          // Error silencioso - al menos el mapa local está actualizado
        }
      }

      setMonthData(map);
    } catch (error) {
      // Error silencioso
    } finally {
      setCalendarLoading(false);
    }
  }, [currentMonth, firebaseUser]);

  // ============================
  // Generación automática de slots desde dayBlocks
  // ============================
  const generateMasterSlotsForDate = useCallback((date, settings) => {
    const dayOfWeek = date.day();
    if (!settings?.workingDays?.[dayOfWeek]) return [];

    const all = [];
    const duration = settings.slotDuration || SLOT_DURATION_MIN;

    // Obtener bloques del día (probar número y string por Firestore)
    const dayBlocks = settings.dayBlocks;
    const blocksForDay = dayBlocks?.[dayOfWeek] || dayBlocks?.[String(dayOfWeek)] || [];

    blocksForDay.forEach((b) => {
      if (b?.start && b?.end) {
        all.push(...sliceIntervalToSlots(b.start, b.end, duration));
      }
    });
    return uniqueSorted(all);
  }, []);

  // ============================
  // Obtener estado de cada slot
  // ============================
  const getSlotStatus = useCallback(
    (dateKey, slotTime) => {
      const appointments = appointmentsByDate[dateKey] || [];
      const appointment = appointments.find((a) => a.slotTime === slotTime);

      if (!appointment) {
        return { status: 'available', label: 'Disponible', color: '#FFFFFF' };
      }

      switch (appointment.status) {
        case 'requested':
          return {
            status: 'requested',
            label: `Solicitado - ${appointment.patientName}`,
            color: '#FF9800',
            appointment,
          };
        case 'accepted':
        case 'confirmed':
          return {
            status: 'accepted',
            label: `Aceptada - ${appointment.patientName}`,
            color: '#4CAF50',
            appointment,
          };
        case 'completed':
          return {
            status: 'completed',
            label: `Completado - ${appointment.patientName}`,
            color: '#9E9E9E',
            appointment,
          };
        case 'noShow':
          return {
            status: 'noShow',
            label: `No se presentó - ${appointment.patientName}`,
            color: '#F44336',
            appointment,
          };
        case 'cancelled':
        case 'rejected':
          // Para el médico, los cupos cancelados vuelven a estar disponibles
          return { status: 'available', label: 'Disponible', color: '#FFFFFF' };
        default:
          return {
            status: 'reserved',
            label: `Reservado - ${appointment.patientName}`,
            color: '#2196F3',
            appointment,
          };
      }
    },
    [appointmentsByDate]
  );

  // ============================
  // Calcular estadísticas del día
  // ============================
  const getDayStats = useCallback(
    (dateKey) => {
      const data = monthData[dateKey];
      const appointments = appointmentsByDate[dateKey] || [];
      const date = dayjs(dateKey);
      const isPast = date.isBefore(dayjs(), 'day');

      // Si está bloqueado explícitamente
      if (data?.blocked) {
        return { total: 0, reserved: 0, available: 0, blocked: true };
      }

      // Verificar si hay citas activas (pendientes o aceptadas)
      const hasActiveAppointments = appointments.some(
        (a) => ['requested', 'accepted'].includes(a.status)
      );

      // PROTECCIÓN: También verificar si el documento tiene el marcador hasAppointments
      // Esto cubre casos donde las citas están en otro mes pero el documento preserva la config
      const documentHasAppointments = data?.hasAppointments === true;

      let totalSlots = 0;

      // FECHAS PASADAS: usar documento existente (no modificar histórico)
      // FECHAS CON CITAS ACTIVAS o con marcador hasAppointments: usar documento existente (proteger citas)
      if ((isPast || hasActiveAppointments || documentHasAppointments) && data) {
        totalSlots = data.totalSlots || data.slots?.length || 0;
      }
      // FECHAS PRESENTES/FUTURAS SIN CITAS: calcular dinámicamente desde workSettings
      else if (workSettings?.workingDays && workSettings?.dayBlocks) {
        const dayOfWeek = date.day();

        if (workSettings.workingDays[dayOfWeek]) {
          const slots = generateMasterSlotsForDate(date, workSettings);
          totalSlots = slots.length;
        }
      }

      const activeAppointments = appointments.filter(
        (a) => ['requested', 'accepted'].includes(a.status)
      ).length;

      return {
        total: totalSlots,
        reserved: activeAppointments,
        available: totalSlots - activeAppointments,
        blocked: false,
      };
    },
    [monthData, appointmentsByDate, workSettings, generateMasterSlotsForDate]
  );

  // ============================
  // Modal de día
  // ============================
  const openDayModal = useCallback(
    async (date) => {
      if (!firebaseUser?.uid) return;
      setSelectedDate(date);
      const dateKey = date.format('YYYY-MM-DD');
      const dayOfWeek = date.day();
      const isPast = date.isBefore(dayjs(), 'day');

      // Verificar si hay citas activas para este día
      const appointments = appointmentsByDate[dateKey] || [];
      const hasActiveAppointments = appointments.some(
        (a) => ['requested', 'accepted'].includes(a.status)
      );

      // Obtener datos existentes
      const ref = availDocRefFor(dateKey);
      try {
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // No hay documento específico - GENERAR DINÁMICAMENTE desde workSettings
          if (workSettings?.workingDays?.[dayOfWeek]) {
            const dynamicSlots = generateMasterSlotsForDate(date, workSettings);
            const slotsWithStatus = dynamicSlots.map((slotTime) => ({
              time: slotTime,
              ...getSlotStatus(dateKey, slotTime),
            }));
            setDaySlots(slotsWithStatus);
          } else {
            // No es día laborable
            setDaySlots([]);
          }
          setIsDayBlocked(false);
          setDayModalVisible(true);
          return;
        }

        const existingData = snap.data();

        if (existingData.blocked) {
          setDaySlots([]);
          setIsDayBlocked(true);
          setDayModalVisible(true);
          return;
        }

        // PROTECCIÓN: También verificar si el documento tiene el marcador hasAppointments
        const documentHasAppointments = existingData.hasAppointments === true;

        // FECHAS PASADAS o CON CITAS ACTIVAS o con marcador hasAppointments: mostrar slots del documento (proteger)
        if (isPast || hasActiveAppointments || documentHasAppointments) {
          const slots = existingData.slots || [];
          const slotsWithStatus = slots.map((slotTime) => ({
            time: slotTime,
            ...getSlotStatus(dateKey, slotTime),
          }));
          setDaySlots(slotsWithStatus);
        }
        // FECHAS PRESENTES/FUTURAS SIN CITAS: generar dinámicamente desde workSettings
        else {
          if (workSettings?.workingDays?.[dayOfWeek]) {
            const dynamicSlots = generateMasterSlotsForDate(date, workSettings);
            const slotsWithStatus = dynamicSlots.map((slotTime) => ({
              time: slotTime,
              ...getSlotStatus(dateKey, slotTime),
            }));
            setDaySlots(slotsWithStatus);
          } else {
            setDaySlots([]);
          }
        }

        setIsDayBlocked(false);
        setDayModalVisible(true);
      } catch (e) {
        // Error al obtener datos - intentar generar dinámicamente
        if (workSettings?.workingDays?.[dayOfWeek]) {
          const dynamicSlots = generateMasterSlotsForDate(date, workSettings);
          const slotsWithStatus = dynamicSlots.map((slotTime) => ({
            time: slotTime,
            ...getSlotStatus(dateKey, slotTime),
          }));
          setDaySlots(slotsWithStatus);
        } else {
          setDaySlots([]);
        }
        setIsDayBlocked(false);
        setDayModalVisible(true);
      }
    },
    [firebaseUser, getSlotStatus, workSettings, generateMasterSlotsForDate, appointmentsByDate]
  );

  // ============================
  // Acciones rápidas
  // ============================
  const blockDay = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;
    const dateKey = selectedDate.format('YYYY-MM-DD');

    // Verificar si hay citas activas
    const appointments = appointmentsByDate[dateKey] || [];
    const activeAppointments = appointments.filter((a) =>
      ['requested', 'accepted'].includes(a.status)
    );

    if (activeAppointments.length > 0) {
      showAlert(
        'No se puede bloquear',
        `Hay ${activeAppointments.length} cita(s) activa(s) este día. Cancélalas primero.`
      );
      return;
    }

    showAlert('Bloquear día', '¿Bloquear todo el día? No se podrán agendar citas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Bloquear',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            const ref = availDocRefFor(dateKey);
            await setDoc(
              ref,
              {
                blocked: true,
                slots: [],
                updatedAt: Timestamp.now(),
              },
              { merge: true }
            );

            setMonthData((prev) => ({
              ...prev,
              [dateKey]: { totalSlots: 0, blocked: true, slots: [] },
            }));
            setIsDayBlocked(true);
            setDaySlots([]);
            showAlert('Día bloqueado', 'Este día ha sido bloqueado.');
          } catch (e) {
            showAlert('Error', 'No se pudo bloquear el día');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const unblockDay = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;
    const dateKey = selectedDate.format('YYYY-MM-DD');

    try {
      setSaving(true);
      const slots = generateMasterSlotsForDate(selectedDate, workSettings);
      const dateObj = selectedDate.toDate();
      dateObj.setHours(0, 0, 0, 0);

      const ref = availDocRefFor(dateKey);
      await setDoc(ref, {
        date: Timestamp.fromDate(dateObj),
        slots,
        slotDuration: workSettings.slotDuration || SLOT_DURATION_MIN,
        generatedFrom: workSettings.blocks,
        updatedAt: Timestamp.now(),
        blocked: false,
      });

      const slotsWithStatus = slots.map((slotTime) => ({
        time: slotTime,
        ...getSlotStatus(dateKey, slotTime),
      }));

      setDaySlots(slotsWithStatus);
      setIsDayBlocked(false);
      setMonthData((prev) => ({
        ...prev,
        [dateKey]: { totalSlots: slots.length, blocked: false, slots },
      }));

      showAlert('Día desbloqueado', 'Los cupos han sido restaurados.');
    } catch (e) {
      showAlert('Error', 'No se pudo desbloquear el día');
    } finally {
      setSaving(false);
    }
  };

  const blockWeek = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;

    const startOfWeek = selectedDate.startOf('week');
    const daysToBlock = [];

    for (let i = 0; i < 7; i++) {
      const day = startOfWeek.add(i, 'day');
      if (!day.isBefore(dayjs(), 'day')) {
        const dateKey = day.format('YYYY-MM-DD');
        const isWorkingDay = !!workSettings.workingDays?.[day.day()];
        const isExtraDay = monthData[dateKey]?.isExtraDay;
        // Solo bloquear días laborables o días extra
        if (isWorkingDay || isExtraDay) {
          daysToBlock.push(day);
        }
      }
    }

    if (daysToBlock.length === 0) {
      showAlert('Info', 'No hay días laborables en esta semana.');
      return;
    }

    // Verificar citas activas en la semana
    let totalActiveAppointments = 0;
    for (const day of daysToBlock) {
      const dateKey = day.format('YYYY-MM-DD');
      const appointments = appointmentsByDate[dateKey] || [];
      totalActiveAppointments += appointments.filter((a) =>
        ['requested', 'accepted'].includes(a.status)
      ).length;
    }

    if (totalActiveAppointments > 0) {
      showAlert(
        'No se puede bloquear',
        `Hay ${totalActiveAppointments} cita(s) activa(s) esta semana. Cancélalas primero.`
      );
      return;
    }

    showAlert(
      'Bloquear semana',
      `¿Bloquear ${daysToBlock.length} día(s) laborable(s) de esta semana?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);

              for (const day of daysToBlock) {
                const dateKey = day.format('YYYY-MM-DD');
                const ref = availDocRefFor(dateKey);
                await setDoc(
                  ref,
                  {
                    blocked: true,
                    slots: [],
                    updatedAt: Timestamp.now(),
                  },
                  { merge: true }
                );

                setMonthData((prev) => ({
                  ...prev,
                  [dateKey]: { totalSlots: 0, blocked: true, slots: [] },
                }));
              }

              showAlert('Semana bloqueada', 'Los días han sido bloqueados.');
              setDayModalVisible(false);
            } catch (e) {
              showAlert('Error', 'No se pudo bloquear la semana');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const unblockWeek = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;

    const startOfWeek = selectedDate.startOf('week');
    const daysToUnblock = [];

    for (let i = 0; i < 7; i++) {
      const day = startOfWeek.add(i, 'day');
      if (!day.isBefore(dayjs(), 'day')) {
        const dateKey = day.format('YYYY-MM-DD');
        // Solo incluir días bloqueados
        if (monthData[dateKey]?.blocked) {
          daysToUnblock.push(day);
        }
      }
    }

    if (daysToUnblock.length === 0) {
      showAlert('Info', 'No hay días bloqueados en esta semana.');
      return;
    }

    showAlert(
      'Desbloquear semana',
      `¿Desbloquear ${daysToUnblock.length} día(s) bloqueado(s) de esta semana?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear',
          onPress: async () => {
            try {
              setSaving(true);

              for (const day of daysToUnblock) {
                const dateKey = day.format('YYYY-MM-DD');
                const slots = generateMasterSlotsForDate(day, workSettings);
                const dateObj = day.toDate();
                dateObj.setHours(0, 0, 0, 0);

                const ref = availDocRefFor(dateKey);
                await setDoc(ref, {
                  date: Timestamp.fromDate(dateObj),
                  slots,
                  slotDuration: workSettings.slotDuration || SLOT_DURATION_MIN,
                  generatedFrom: workSettings.blocks,
                  updatedAt: Timestamp.now(),
                  blocked: false,
                });

                setMonthData((prev) => ({
                  ...prev,
                  [dateKey]: { totalSlots: slots.length, blocked: false, slots },
                }));
              }

              // Actualizar el día actual si estaba bloqueado
              const currentDateKey = selectedDate.format('YYYY-MM-DD');
              if (daysToUnblock.some(d => d.format('YYYY-MM-DD') === currentDateKey)) {
                const slots = generateMasterSlotsForDate(selectedDate, workSettings);
                const slotsWithStatus = slots.map((slotTime) => ({
                  time: slotTime,
                  ...getSlotStatus(currentDateKey, slotTime),
                }));
                setDaySlots(slotsWithStatus);
                setIsDayBlocked(false);
              }

              showAlert('Semana desbloqueada', `${daysToUnblock.length} día(s) han sido desbloqueados.`);
            } catch (e) {
              showAlert('Error', 'No se pudo desbloquear la semana');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const openExtraDay = async () => {
    if (!firebaseUser?.uid || !selectedDate) return;
    const dateKey = selectedDate.format('YYYY-MM-DD');
    const dow = selectedDate.day();

    // Verificar si es día no laborable
    if (workSettings.workingDays?.[dow]) {
      showAlert('Info', 'Este ya es un día laborable en tu configuración.');
      return;
    }

    showAlert(
      'Abrir día extra',
      'Este día no está en tu horario regular. ¿Deseas abrirlo de todos modos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir',
          onPress: async () => {
            try {
              setSaving(true);

              // Generar slots usando la configuración pero ignorando el día de la semana
              const all = [];
              const duration = workSettings.slotDuration || SLOT_DURATION_MIN;
              (workSettings.blocks || []).forEach((b) => {
                if (b?.start && b?.end) {
                  all.push(...sliceIntervalToSlots(b.start, b.end, duration));
                }
              });
              const slots = uniqueSorted(all);

              if (slots.length === 0) {
                showAlert('Error', 'No hay bloques horarios configurados.');
                return;
              }

              const dateObj = selectedDate.toDate();
              dateObj.setHours(0, 0, 0, 0);

              const ref = availDocRefFor(dateKey);
              await setDoc(ref, {
                date: Timestamp.fromDate(dateObj),
                slots,
                slotDuration: workSettings.slotDuration || SLOT_DURATION_MIN,
                generatedFrom: workSettings.blocks,
                updatedAt: Timestamp.now(),
                blocked: false,
                isExtraDay: true,
              });

              const slotsWithStatus = slots.map((slotTime) => ({
                time: slotTime,
                ...getSlotStatus(dateKey, slotTime),
              }));

              setDaySlots(slotsWithStatus);
              setIsDayBlocked(false);
              setMonthData((prev) => ({
                ...prev,
                [dateKey]: { totalSlots: slots.length, blocked: false, slots, isExtraDay: true },
              }));

              showAlert('Día abierto', `Se han generado ${slots.length} cupos para este día.`);
            } catch (e) {
              showAlert('Error', 'No se pudo abrir el día');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // ============================
  // Edición de cupos
  // ============================
  const toggleSlotSelection = (slotTime) => {
    setSelectedSlotsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(slotTime)) {
        next.delete(slotTime);
      } else {
        next.add(slotTime);
      }
      return next;
    });
  };

  const selectSlotsFromTime = (fromTime) => {
    // Toggle: seleccionar/deseleccionar cupos desde una hora en adelante (tarde)
    const afternoonSlots = daySlots
      .filter((s) => s.status === 'available' && toMinutes(s.time) >= toMinutes(fromTime))
      .map((s) => s.time);

    // Verificar si ya están todos seleccionados
    const allSelected = afternoonSlots.every((slot) => selectedSlotsToRemove.has(slot));

    if (allSelected) {
      // Deseleccionar todos los de la tarde
      setSelectedSlotsToRemove((prev) => {
        const next = new Set(prev);
        afternoonSlots.forEach((slot) => next.delete(slot));
        return next;
      });
    } else {
      // Seleccionar todos los de la tarde
      setSelectedSlotsToRemove((prev) => {
        const next = new Set(prev);
        afternoonSlots.forEach((slot) => next.add(slot));
        return next;
      });
    }
  };

  const selectSlotsUntilTime = (untilTime) => {
    // Toggle: seleccionar/deseleccionar cupos hasta una hora (mañana)
    const morningSlots = daySlots
      .filter((s) => s.status === 'available' && toMinutes(s.time) <= toMinutes(untilTime))
      .map((s) => s.time);

    // Verificar si ya están todos seleccionados
    const allSelected = morningSlots.every((slot) => selectedSlotsToRemove.has(slot));

    if (allSelected) {
      // Deseleccionar todos los de la mañana
      setSelectedSlotsToRemove((prev) => {
        const next = new Set(prev);
        morningSlots.forEach((slot) => next.delete(slot));
        return next;
      });
    } else {
      // Seleccionar todos los de la mañana
      setSelectedSlotsToRemove((prev) => {
        const next = new Set(prev);
        morningSlots.forEach((slot) => next.add(slot));
        return next;
      });
    }
  };

  const selectAllAvailableSlots = () => {
    const availableSlots = daySlots
      .filter((s) => s.status === 'available')
      .map((s) => s.time);
    setSelectedSlotsToRemove(new Set(availableSlots));
  };

  const clearSlotSelection = () => {
    setSelectedSlotsToRemove(new Set());
  };

  const cancelEditMode = () => {
    setIsEditingSlots(false);
    setSelectedSlotsToRemove(new Set());
  };

  const saveRemovedSlots = async () => {
    if (!firebaseUser?.uid || !selectedDate || selectedSlotsToRemove.size === 0) return;

    const dateKey = selectedDate.format('YYYY-MM-DD');

    // Verificar que no haya citas en los slots a eliminar
    const slotsWithAppointments = daySlots.filter(
      (s) => selectedSlotsToRemove.has(s.time) && s.status !== 'available'
    );

    if (slotsWithAppointments.length > 0) {
      showAlert(
        'No se pueden eliminar',
        `Hay ${slotsWithAppointments.length} cupo(s) con citas. Solo se pueden eliminar cupos disponibles.`
      );
      return;
    }

    showAlert(
      'Eliminar cupos',
      `¿Eliminar ${selectedSlotsToRemove.size} cupo(s) seleccionado(s)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);

              // Filtrar los slots que NO están seleccionados para eliminar
              const remainingSlots = daySlots
                .filter((s) => !selectedSlotsToRemove.has(s.time))
                .map((s) => s.time);

              const dateObj = selectedDate.toDate();
              dateObj.setHours(0, 0, 0, 0);

              const ref = availDocRefFor(dateKey);
              await setDoc(ref, {
                date: Timestamp.fromDate(dateObj),
                slots: remainingSlots,
                slotDuration: workSettings.slotDuration || SLOT_DURATION_MIN,
                updatedAt: Timestamp.now(),
                blocked: false,
              }, { merge: true });

              // Actualizar UI
              const updatedSlots = remainingSlots.map((slotTime) => ({
                time: slotTime,
                ...getSlotStatus(dateKey, slotTime),
              }));

              setDaySlots(updatedSlots);
              setMonthData((prev) => ({
                ...prev,
                [dateKey]: {
                  ...prev[dateKey],
                  totalSlots: remainingSlots.length,
                  slots: remainingSlots,
                },
              }));

              setIsEditingSlots(false);
              setSelectedSlotsToRemove(new Set());

              showAlert('Cupos eliminados', `Se eliminaron ${selectedSlotsToRemove.size} cupo(s).`);
            } catch (e) {
              showAlert('Error', 'No se pudieron eliminar los cupos');
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

  const updateBlock = (day, blockId, field, value) => {
    setSettingsDraft((prev) => ({
      ...prev,
      dayBlocks: {
        ...prev.dayBlocks,
        [day]: (prev.dayBlocks?.[day] || []).map((b) =>
          b.id === blockId ? { ...b, [field]: value } : b
        ),
      },
    }));
  };

  const addBlock = (day) => {
    setSettingsDraft((prev) => {
      const blocks = prev.dayBlocks?.[day] || [];
      let newStart = '09:00';
      let newEnd = '11:00';

      if (blocks.length > 0) {
        const lastBlock = blocks[blocks.length - 1];
        const lastEndMinutes = toMinutes(lastBlock.end);

        if (Number.isFinite(lastEndMinutes)) {
          const newStartMinutes = lastEndMinutes + 60;
          const newEndMinutes = newStartMinutes + 120;

          const formatTime = (mins) => {
            const h = Math.floor(mins / 60) % 24;
            const m = mins % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          };

          newStart = formatTime(newStartMinutes);
          newEnd = formatTime(newEndMinutes);
        }
      }

      return {
        ...prev,
        dayBlocks: {
          ...prev.dayBlocks,
          [day]: [...blocks, { id: generateBlockId(), start: newStart, end: newEnd }],
        },
      };
    });
  };

  const removeBlock = (day, blockId) => {
    setSettingsDraft((prev) => ({
      ...prev,
      dayBlocks: {
        ...prev.dayBlocks,
        [day]: (prev.dayBlocks?.[day] || []).filter((b) => b.id !== blockId),
      },
    }));
  };

  // Copiar bloques de un día a otros días laborables
  const copyBlocksToAllDays = (sourceDay) => {
    const sourceBlocks = settingsDraft.dayBlocks?.[sourceDay] || [];
    if (sourceBlocks.length === 0) {
      showAlert('Sin bloques', 'El día seleccionado no tiene bloques para copiar.');
      return;
    }

    setSettingsDraft((prev) => {
      const newDayBlocks = { ...prev.dayBlocks };
      for (let day = 0; day < 7; day++) {
        if (day !== sourceDay && prev.workingDays?.[day]) {
          // Copiar bloques con nuevos IDs
          newDayBlocks[day] = sourceBlocks.map((b) => ({
            ...b,
            id: generateBlockId(),
          }));
        }
      }
      return { ...prev, dayBlocks: newDayBlocks };
    });

    showAlert('Bloques copiados', 'Los bloques se han copiado a todos los días laborables.');
  };

  // Validar y limpiar dayBlocks
  const validateDayBlocks = () => {
    const cleanDayBlocks = {};
    let hasAtLeastOneBlock = false;

    for (let day = 0; day < 7; day++) {
      const blocks = settingsDraft.dayBlocks?.[day] || [];
      const validBlocks = blocks
        .map((b) => ({
          id: b.id,
          start: b.start?.trim(),
          end: b.end?.trim()
        }))
        .filter(
          (b) =>
            Number.isFinite(toMinutes(b.start)) &&
            Number.isFinite(toMinutes(b.end)) &&
            toMinutes(b.end) > toMinutes(b.start)
        );

      cleanDayBlocks[day] = validBlocks;
      if (validBlocks.length > 0 && settingsDraft.workingDays?.[day]) {
        hasAtLeastOneBlock = true;
      }
    }

    return { cleanDayBlocks, hasAtLeastOneBlock };
  };

  // ============================
  // GUARDAR CONFIGURACIÓN GENERAL (indefinida)
  // ============================
  const saveGeneralConfig = async () => {
    if (!firebaseUser?.uid) return;

    const { cleanDayBlocks, hasAtLeastOneBlock } = validateDayBlocks();

    if (!hasAtLeastOneBlock) {
      showAlert(
        'Configurar horario',
        'Debes definir al menos un bloque válido en algún día laborable.'
      );
      return;
    }

    const parsedDuration = parseInt(settingsDraft.slotDuration, 10);
    const newDuration = Math.max(5, isNaN(parsedDuration) ? SLOT_DURATION_MIN : parsedDuration);

    // Función para ejecutar el guardado
    const executeGeneralSave = async (overwriteMonthSpecific = false) => {
      const payload = {
        slotDuration: newDuration,
        workingDays: settingsDraft.workingDays,
        dayBlocks: cleanDayBlocks,
        updatedAt: Timestamp.now(),
      };

      try {
        setSaving(true);

        // Guardar configuración general
        await setDoc(settingsDocRef(), payload, { merge: true });
        setWorkSettings(payload);
        setSettingsDraft(payload);

        // Si se debe sobrescribir meses específicos, actualizar esos documentos
        if (overwriteMonthSpecific) {
          const availabilitiesRef = collection(db, 'users', firebaseUser.uid, 'availabilities');
          const snapshot = await getDocs(availabilitiesRef);
          const today = dayjs();

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const dateKey = docSnap.id;
            const date = dayjs(dateKey);

            // Solo procesar días futuros con isMonthSpecific que NO tengan citas
            if (data.isMonthSpecific && !date.isBefore(today, 'day') && !data.hasAppointments) {
              const dayOfWeek = date.day();

              // Solo actualizar si es día laborable en la nueva configuración
              if (settingsDraft.workingDays?.[dayOfWeek]) {
                const blocksForDay = cleanDayBlocks[dayOfWeek] || [];
                const all = [];
                blocksForDay.forEach((b) => {
                  if (b?.start && b?.end) {
                    all.push(...sliceIntervalToSlots(b.start, b.end, newDuration));
                  }
                });
                const slots = uniqueSorted(all);

                if (slots.length > 0) {
                  const ref = availDocRefFor(dateKey);
                  await setDoc(ref, {
                    slots,
                    slotDuration: newDuration,
                    updatedAt: Timestamp.now(),
                    blocked: false,
                    isMonthSpecific: false, // Ya no es específico, ahora sigue la config general
                  }, { merge: true });
                }
              } else {
                // Si ya no es día laborable, eliminar el documento
                const ref = availDocRefFor(dateKey);
                await deleteDoc(ref);
              }
            }
          }
        }

        setSettingsModalVisible(false);

        // Recargar datos del mes para reflejar cambios
        await loadMonthData();

        // Contar días laborables configurados
        const workingDaysCount = Object.values(payload.workingDays).filter(Boolean).length;

        showAlert(
          'Configuración guardada',
          `Tu horario se aplicará automáticamente a todos los meses.\n\n${workingDaysCount} día(s) laborables configurados.`
        );
      } catch (e) {
        showAlert('Error', 'No se pudo guardar la configuración');
      } finally {
        setSaving(false);
      }
    };

    // Verificar si hay documentos con isMonthSpecific en fechas futuras
    try {
      const availabilitiesRef = collection(db, 'users', firebaseUser.uid, 'availabilities');
      const snapshot = await getDocs(availabilitiesRef);
      const today = dayjs();

      const monthsWithSpecificConfig = new Set();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = docSnap.id;
        const date = dayjs(dateKey);

        // Solo contar días futuros con isMonthSpecific que NO tengan citas activas
        if (data.isMonthSpecific && !date.isBefore(today, 'day') && !data.hasAppointments) {
          const monthYear = date.format('MMMM YYYY');
          monthsWithSpecificConfig.add(monthYear);
        }
      });

      if (monthsWithSpecificConfig.size > 0) {
        const monthsList = Array.from(monthsWithSpecificConfig).slice(0, 3).join(', ');
        const moreMonths = monthsWithSpecificConfig.size > 3
          ? ` y ${monthsWithSpecificConfig.size - 3} más`
          : '';

        showAlert(
          'Horarios personalizados',
          `Tienes horarios especiales configurados para: ${monthsList}${moreMonths}.\n\n¿Qué deseas hacer con estos meses?`,
          [
            {
              text: 'Actualizar todos',
              style: 'destructive',
              onPress: () => executeGeneralSave(true),
            },
            {
              text: 'Mantenerlos',
              onPress: () => executeGeneralSave(false),
            },
            {
              text: 'Cancelar',
              style: 'cancel',
            },
          ]
        );
      } else {
        // No hay meses específicos, guardar directamente
        await executeGeneralSave(false);
      }
    } catch (e) {
      // Si hay error verificando, guardar normalmente
      await executeGeneralSave(false);
    }
  };

  // ============================
  // GUARDAR CONFIGURACIÓN DE MES ESPECÍFICO
  // ============================
  const saveMonthConfig = async () => {
    if (!firebaseUser?.uid) return;

    const { cleanDayBlocks, hasAtLeastOneBlock } = validateDayBlocks();

    if (!hasAtLeastOneBlock) {
      showAlert(
        'Configurar horario',
        'Debes definir al menos un bloque válido en algún día laborable.'
      );
      return;
    }

    const parsedDuration = parseInt(settingsDraft.slotDuration, 10);
    const duration = Math.max(5, isNaN(parsedDuration) ? SLOT_DURATION_MIN : parsedDuration);

    try {
      setSaving(true);

      const startOfMonth = currentMonth.startOf('month');
      const endOfMonth = currentMonth.endOf('month');
      const today = dayjs();

      let generatedCount = 0;
      let currentDay = startOfMonth;

      while (currentDay.isBefore(endOfMonth) || currentDay.isSame(endOfMonth, 'day')) {
        const dow = currentDay.day();
        const dateKey = currentDay.format('YYYY-MM-DD');

        // Solo días futuros o de hoy
        if (!currentDay.isBefore(today, 'day') && settingsDraft.workingDays?.[dow]) {
          const existingData = monthData[dateKey];
          const hasActiveAppointments = (appointmentsByDate[dateKey] || []).some(
            (a) => ['requested', 'accepted'].includes(a.status)
          );
          // También verificar el marcador hasAppointments del documento
          const documentHasAppointments = existingData?.hasAppointments === true;

          // Solo generar si no hay citas activas, ni marcador hasAppointments, ni está bloqueado
          if (!existingData?.blocked && !hasActiveAppointments && !documentHasAppointments) {
            const blocksForDay = cleanDayBlocks[dow] || [];
            const all = [];
            blocksForDay.forEach((b) => {
              if (b?.start && b?.end) {
                all.push(...sliceIntervalToSlots(b.start, b.end, duration));
              }
            });
            const slots = uniqueSorted(all);

            if (slots.length > 0) {
              const dateObj = currentDay.toDate();
              dateObj.setHours(0, 0, 0, 0);

              const ref = availDocRefFor(dateKey);
              await setDoc(ref, {
                date: Timestamp.fromDate(dateObj),
                slots,
                slotDuration: duration,
                updatedAt: Timestamp.now(),
                blocked: false,
                isMonthSpecific: true, // Marcador de configuración específica
              });

              generatedCount++;
            }
          }
        }
        currentDay = currentDay.add(1, 'day');
      }

      setSettingsModalVisible(false);
      await loadMonthData();

      showAlert(
        'Mes configurado',
        `Se generaron cupos para ${generatedCount} día(s) en ${currentMonth.format('MMMM YYYY')}.\n\nEsta configuración solo afecta a este mes.`
      );
    } catch (e) {
      showAlert('Error', 'No se pudo aplicar la configuración del mes');
    } finally {
      setSaving(false);
    }
  };

  // Borrar cupos del mes actual
  const clearMonthSlots = async () => {
    if (!firebaseUser?.uid) return;

    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const today = dayjs();

    // Contar días con citas activas (incluyendo marcador hasAppointments)
    let daysWithActiveAppointments = 0;
    let daysToDelete = 0;

    let currentDay = startOfMonth;
    while (currentDay.isBefore(endOfMonth) || currentDay.isSame(endOfMonth, 'day')) {
      const dateKey = currentDay.format('YYYY-MM-DD');
      const hasData = monthData[dateKey];

      if (hasData && !currentDay.isBefore(today, 'day')) {
        const hasActiveAppointments = (appointmentsByDate[dateKey] || []).some(
          (a) => ['requested', 'accepted'].includes(a.status)
        );
        // También verificar marcador hasAppointments del documento
        const documentHasAppointments = hasData.hasAppointments === true;

        if (hasActiveAppointments || documentHasAppointments) {
          daysWithActiveAppointments++;
        } else {
          daysToDelete++;
        }
      }
      currentDay = currentDay.add(1, 'day');
    }

    if (daysToDelete === 0) {
      showAlert(
        'Sin cupos para borrar',
        daysWithActiveAppointments > 0
          ? `No hay cupos sin citas para borrar. ${daysWithActiveAppointments} día(s) tienen citas activas.`
          : 'No hay cupos generados en este mes.'
      );
      return;
    }

    const warningMessage = daysWithActiveAppointments > 0
      ? `Se borrarán ${daysToDelete} día(s) sin citas.\n${daysWithActiveAppointments} día(s) con citas activas se mantendrán.`
      : `Se borrarán los cupos de ${daysToDelete} día(s) de ${currentMonth.format('MMMM')}.`;

    showAlert(
      'Borrar cupos del mes',
      warningMessage + '\n\n¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);

              let deletedCount = 0;
              currentDay = startOfMonth;

              while (currentDay.isBefore(endOfMonth) || currentDay.isSame(endOfMonth, 'day')) {
                const dateKey = currentDay.format('YYYY-MM-DD');
                const hasData = monthData[dateKey];

                if (hasData && !currentDay.isBefore(today, 'day')) {
                  const hasActiveAppointments = (appointmentsByDate[dateKey] || []).some(
                    (a) => ['requested', 'accepted'].includes(a.status)
                  );
                  // También verificar marcador hasAppointments del documento
                  const documentHasAppointments = hasData.hasAppointments === true;

                  if (!hasActiveAppointments && !documentHasAppointments) {
                    const ref = availDocRefFor(dateKey);
                    await deleteDoc(ref);
                    deletedCount++;
                  }
                }
                currentDay = currentDay.add(1, 'day');
              }

              await loadMonthData();
              showAlert(
                'Cupos borrados',
                `Se eliminaron los cupos de ${deletedCount} día(s).`
              );
            } catch (e) {
              showAlert('Error', 'No se pudieron borrar los cupos');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // Contar días con cupos en el mes actual (solo días futuros desde hoy)
  const getMonthSlotsCount = useCallback(() => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const today = dayjs();
    let count = 0;

    let currentDay = startOfMonth;
    while (currentDay.isBefore(endOfMonth) || currentDay.isSame(endOfMonth, 'day')) {
      const dateKey = currentDay.format('YYYY-MM-DD');
      // Solo contar días futuros o de hoy
      if (!currentDay.isBefore(today, 'day') && monthData[dateKey] && !monthData[dateKey].blocked && monthData[dateKey].totalSlots > 0) {
        count++;
      }
      currentDay = currentDay.add(1, 'day');
    }

    return count;
  }, [currentMonth, monthData]);

  // TimePicker helpers
  const openTimePicker = (day, blockId, field) => {
    const blocks = settingsDraft.dayBlocks?.[day] || [];
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const timeStr = field === 'start' ? block.start : block.end;
    const [hours, minutes] = (timeStr || '09:00').split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    setTimePickerValue(date);
    setTimePickerDay(day);
    setTimePickerBlockId(blockId);
    setTimePickerField(field);
    setShowTimePicker(true);
  };

  const onTimePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }
    if (selectedDate && timePickerDay !== null && timePickerBlockId !== null && timePickerField) {
      const hours = String(selectedDate.getHours()).padStart(2, '0');
      const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      updateBlock(timePickerDay, timePickerBlockId, timePickerField, timeString);
      setTimePickerValue(selectedDate);
    }
  };

  const closeTimePicker = () => {
    setShowTimePicker(false);
    setTimePickerDay(null);
    setTimePickerBlockId(null);
    setTimePickerField(null);
  };

  // ============================
  // Calendario
  // ============================
  const handlePrevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
  const handleNextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));
  const handleToday = () => setCurrentMonth(dayjs());

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
    monthNavigation: {
      ...styles.monthNavigation,
      backgroundColor: colors.card,
      borderBottomColor: colors.border,
    },
    monthText: {
      ...styles.monthText,
      color: colors.text,
    },
    legendText: {
      ...styles.legendText,
      color: colors.textSecondary,
    },
    calendar: {
      ...styles.calendar,
      backgroundColor: colors.card,
    },
    weekDayText: {
      ...styles.weekDayText,
      color: colors.textSecondary,
    },
    dayCell: {
      ...styles.dayCell,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    dayText: {
      ...styles.dayText,
      color: colors.text,
    },
    modalContent: {
      ...styles.modalContent,
      backgroundColor: colors.card,
    },
    modalTitle: {
      ...styles.modalTitle,
      color: colors.text,
    },
    modalClose: {
      ...styles.modalClose,
      color: colors.textSecondary,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.textSecondary,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    timeInput: {
      ...styles.timeInput,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      color: colors.inputText,
    },
    dayCellOtherMonth: {
      ...styles.dayCellOtherMonth,
      backgroundColor: darkMode ? '#2A2A2A' : '#F9F9F9',
    },
    dayCellToday: {
      ...styles.dayCellToday,
      backgroundColor: darkMode ? '#1E3A5F' : '#E3F2FD',
      borderColor: '#2196F3',
    },
    dayCellPast: {
      ...styles.dayCellPast,
      opacity: darkMode ? 0.3 : 0.4,
    },
    dayCellNonWorking: {
      ...styles.dayCellNonWorking,
      backgroundColor: darkMode ? '#333333' : '#F0F0F0',
    },
    dayTextOtherMonth: {
      ...styles.dayTextOtherMonth,
      color: darkMode ? '#555555' : '#999',
    },
    dayTextToday: {
      ...styles.dayTextToday,
      color: '#2196F3',
      fontWeight: 'bold',
    },
    dayTextPast: {
      ...styles.dayTextPast,
      color: darkMode ? '#555555' : '#999',
    },
    slotItem: {
      ...styles.slotItem,
      backgroundColor: darkMode ? '#2A2A2A' : '#F9F9F9',
      borderColor: colors.border,
    },
    slotTime: {
      ...styles.slotTime,
      color: colors.text,
    },
    slotStatus: {
      ...styles.slotStatus,
      color: colors.textSecondary,
    },
    editFooter: {
      ...styles.editFooter,
      backgroundColor: colors.card,
      borderTopColor: colors.border,
    },
    editCancelButton: {
      ...styles.editCancelButton,
      backgroundColor: darkMode ? '#3A3A3A' : '#F3F4F6',
    },
    editCancelText: {
      ...styles.editCancelText,
      color: darkMode ? '#E5E7EB' : '#6B7280',
    },
  };

  const renderCalendar = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');

    let startDate = startOfMonth;
    while (startDate.day() !== 0) startDate = startDate.subtract(1, 'day');
    let endDate = endOfMonth;
    while (endDate.day() !== 6) endDate = endDate.add(1, 'day');

    const days = [];
    let currentDate = startDate;

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      days.push(currentDate);
      currentDate = currentDate.add(1, 'day');
    }

    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

    return (
      <View style={dynamicStyles.calendar}>
        <View style={styles.weekDays}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={dynamicStyles.weekDayText}>{day}</Text>
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
              const isWorkingDay = !!workSettings?.workingDays?.[day.day()];
              const isExtraDay = monthData[dateKey]?.isExtraDay;
              const stats = getDayStats(dateKey);

              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    dynamicStyles.dayCell,
                    !isCurrentMonth && dynamicStyles.dayCellOtherMonth,
                    isToday && dynamicStyles.dayCellToday,
                    isPast && dynamicStyles.dayCellPast,
                    !isWorkingDay && !isExtraDay && !monthData[dateKey] && dynamicStyles.dayCellNonWorking,
                  ]}
                  onPress={() => {
                    if (!isCurrentMonth) return;
                    openDayModal(day);
                  }}
                  disabled={!isCurrentMonth}
                >
                  <Text
                    style={[
                      dynamicStyles.dayText,
                      !isCurrentMonth && dynamicStyles.dayTextOtherMonth,
                      isToday && dynamicStyles.dayTextToday,
                      isPast && dynamicStyles.dayTextPast,
                    ]}
                  >
                    {day.date()}
                  </Text>

                  {/* Indicador de citas - solo muestra si hay citas pendientes o aceptadas */}
                  {isCurrentMonth && stats.reserved > 0 && (
                    <View style={[styles.availabilityIndicator, { backgroundColor: '#4CAF50' }]}>
                      <Text style={styles.availabilityText}>{stats.reserved}</Text>
                    </View>
                  )}

                  {/* Indicador de día extra */}
                  {isExtraDay && (
                    <View style={styles.extraDayBadge}>
                      <Text style={styles.extraDayText}>+</Text>
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

  const renderDayModal = () => {
    const dateKey = selectedDate?.format('YYYY-MM-DD');
    const stats = getDayStats(dateKey);
    const isNonWorkingDay = selectedDate && !workSettings?.workingDays?.[selectedDate.day()];
    const hasExistingData = monthData[dateKey];
    const availableSlotsCount = daySlots.filter((s) => s.status === 'available').length;
    const isPastDay = selectedDate?.isBefore(dayjs(), 'day');

    return (
      <Modal
        visible={dayModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (isEditingSlots) {
            cancelEditMode();
          } else {
            setDayModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={dynamicStyles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={dynamicStyles.modalTitle}>
                  {isEditingSlots ? 'Editar cupos' : selectedDate?.format('dddd, D [de] MMMM')}
                </Text>
                {isEditingSlots ? (
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                    {selectedSlotsToRemove.size} cupo(s) seleccionado(s) para eliminar
                  </Text>
                ) : (
                  !isDayBlocked && stats.total > 0 && (
                    <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                      {stats.available} disponibles de {stats.total} cupos
                    </Text>
                  )
                )}
              </View>
              <TouchableOpacity onPress={() => {
                if (isEditingSlots) {
                  cancelEditMode();
                } else {
                  setDayModalVisible(false);
                }
              }}>
                <Text style={dynamicStyles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Modo edición - Acciones de selección rápida */}
            {isEditingSlots ? (
              <View style={styles.editActionsContainer}>
                <Text style={[styles.editHelpText, { color: colors.textSecondary }]}>
                  Toca los cupos disponibles para seleccionarlos, o usa las opciones:
                </Text>
                <View style={styles.editActions}>
                    <TouchableOpacity
                      style={[styles.editActionChip, { backgroundColor: colors.inputBackground }]}
                      onPress={selectAllAvailableSlots}
                    >
                      <Text style={[styles.editActionText, { color: colors.text }]}>Todos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editActionChip, { backgroundColor: colors.inputBackground }]}
                      onPress={clearSlotSelection}
                    >
                      <Text style={[styles.editActionText, { color: colors.text }]}>Limpiar</Text>
                    </TouchableOpacity>
                    {daySlots.filter(s => s.status === 'available').length > 0 && (() => {
                      const afternoonSlots = daySlots.filter(s => s.status === 'available' && toMinutes(s.time) >= toMinutes('12:00')).map(s => s.time);
                      const morningSlots = daySlots.filter(s => s.status === 'available' && toMinutes(s.time) <= toMinutes('11:30')).map(s => s.time);
                      const isAfternoonSelected = afternoonSlots.length > 0 && afternoonSlots.every(slot => selectedSlotsToRemove.has(slot));
                      const isMorningSelected = morningSlots.length > 0 && morningSlots.every(slot => selectedSlotsToRemove.has(slot));

                      return (
                        <>
                          {afternoonSlots.length > 0 && (
                            <TouchableOpacity
                              style={[
                                styles.editActionChip,
                                { backgroundColor: isAfternoonSelected ? '#E65100' : '#FFF3E0' }
                              ]}
                              onPress={() => selectSlotsFromTime('12:00')}
                            >
                              <Text style={[styles.editActionText, { color: isAfternoonSelected ? '#fff' : '#E65100' }]}>
                                {isAfternoonSelected ? '✓ Tarde' : 'Tarde'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {morningSlots.length > 0 && (
                            <TouchableOpacity
                              style={[
                                styles.editActionChip,
                                { backgroundColor: isMorningSelected ? '#1565C0' : '#E3F2FD' }
                              ]}
                              onPress={() => selectSlotsUntilTime('11:30')}
                            >
                              <Text style={[styles.editActionText, { color: isMorningSelected ? '#fff' : '#1565C0' }]}>
                                {isMorningSelected ? '✓ Mañana' : 'Mañana'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      );
                    })()}
                </View>
              </View>
            ) : isPastDay ? (
              /* Día pasado - solo información */
              <View style={styles.quickActions}>
                <View style={[styles.quickActionButton, { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' }]}>
                  <Ionicons name="time-outline" size={18} color="#9E9E9E" />
                  <Text style={[styles.quickActionText, { color: '#9E9E9E' }]}>Día pasado</Text>
                </View>
              </View>
            ) : (
              /* Acciones rápidas normales */
              <View style={styles.quickActions}>
                {isDayBlocked ? (
                  <>
                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickActionUnblock]}
                      onPress={unblockDay}
                      disabled={saving}
                    >
                      <Ionicons name="lock-open-outline" size={18} color="#4CAF50" />
                      <Text style={[styles.quickActionText, { color: '#4CAF50' }]}>Desbloquear día</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickActionUnblock]}
                      onPress={unblockWeek}
                      disabled={saving}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#4CAF50" />
                      <Text style={[styles.quickActionText, { color: '#4CAF50' }]}>Desbloquear semana</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {availableSlotsCount > 0 && (
                      <TouchableOpacity
                        style={[styles.quickActionButton, styles.quickActionEdit]}
                        onPress={() => setIsEditingSlots(true)}
                        disabled={saving}
                      >
                        <Ionicons name="create-outline" size={18} color="#2196F3" />
                        <Text style={[styles.quickActionText, { color: '#2196F3' }]}>Editar cupos</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickActionBlock]}
                      onPress={blockDay}
                      disabled={saving}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color="#F44336" />
                      <Text style={[styles.quickActionText, { color: '#F44336' }]}>Bloquear día</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickActionBlock]}
                      onPress={blockWeek}
                      disabled={saving}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#FF9800" />
                      <Text style={[styles.quickActionText, { color: '#FF9800' }]}>Bloquear semana</Text>
                    </TouchableOpacity>

                    {isNonWorkingDay && !hasExistingData && (
                      <TouchableOpacity
                        style={[styles.quickActionButton, styles.quickActionOpen]}
                        onPress={openExtraDay}
                        disabled={saving}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#4CAF50" />
                        <Text style={[styles.quickActionText, { color: '#4CAF50' }]}>Abrir día</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {isDayBlocked ? (
                <View style={styles.blockedContainer}>
                  <Ionicons name="lock-closed" size={48} color="#F44336" />
                  <Text style={[styles.blockedText, { color: colors.text }]}>
                    Este día está bloqueado
                  </Text>
                  <Text style={[styles.blockedSubtext, { color: colors.textSecondary }]}>
                    No se pueden agendar citas
                  </Text>
                </View>
              ) : daySlots.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
                  <Text style={dynamicStyles.emptyText}>
                    {isNonWorkingDay && !hasExistingData
                      ? 'Este día no es laborable. Puedes abrirlo como día extra.'
                      : 'No hay cupos configurados para este día.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotsContainer}>
                  {daySlots.map((slot, index) => {
                    const isSelected = selectedSlotsToRemove.has(slot.time);
                    const canSelect = isEditingSlots && slot.status === 'available';
                    const slotColor = isSelected ? '#F44336' : (slot.status === 'available' ? '#4CAF50' : slot.color);
                    const isOccupied = slot.status !== 'available';

                    // Etiqueta corta para estado
                    const getShortLabel = () => {
                      if (isSelected) return null;
                      switch (slot.status) {
                        case 'requested': return 'Pend.';
                        case 'accepted': return 'Acept.';
                        case 'completed': return 'Compl.';
                        case 'noShow': return 'Ausente';
                        case 'cancelled': return 'Cancel.';
                        default: return null;
                      }
                    };

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          dynamicStyles.slotItem,
                          {
                            borderColor: slotColor,
                            backgroundColor: isSelected ? '#FFEBEE' : (isOccupied ? slot.color + '15' : colors.card),
                          },
                          isSelected && styles.slotItemSelected,
                        ]}
                        onPress={() => canSelect && toggleSlotSelection(slot.time)}
                        disabled={!canSelect}
                        activeOpacity={canSelect ? 0.7 : 1}
                      >
                        <View style={styles.slotContent}>
                          {isEditingSlots && slot.status === 'available' && (
                            <View style={[styles.checkboxSmall, isSelected && styles.checkboxSmallSelected]}>
                              {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                            </View>
                          )}
                          <Text style={[dynamicStyles.slotTime, { color: slotColor }]}>
                            {slot.time}
                          </Text>
                          {isOccupied && !isEditingSlots && (
                            <Ionicons
                              name={slot.status === 'requested' ? 'time' : slot.status === 'accepted' ? 'checkmark-circle' : 'person'}
                              size={12}
                              color={slot.color}
                            />
                          )}
                        </View>
                        {getShortLabel() && !isEditingSlots && (
                          <Text style={[styles.slotStatusLabel, { color: slot.color }]}>
                            {getShortLabel()}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Footer para modo edición */}
            {isEditingSlots && (
              <View style={dynamicStyles.editFooter}>
                <TouchableOpacity style={dynamicStyles.editCancelButton} onPress={cancelEditMode}>
                  <Text style={dynamicStyles.editCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.editSaveButton,
                    selectedSlotsToRemove.size === 0 && styles.editSaveButtonDisabled,
                  ]}
                  onPress={saveRemovedSlots}
                  disabled={selectedSlotsToRemove.size === 0}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.editSaveText}>
                    Eliminar {selectedSlotsToRemove.size} cupo{selectedSlotsToRemove.size !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {saving && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="large" color="#2196F3" />
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.title}>Calendario de Disponibilidad</Text>
        <Text style={dynamicStyles.subtitle}>
          Los cupos se generan automáticamente según tu configuración
        </Text>
      </View>

      <View style={dynamicStyles.monthNavigation}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>←</Text>
        </TouchableOpacity>

        <View style={styles.monthDisplay}>
          <Text style={dynamicStyles.monthText}>
            {currentMonth.format('MMMM YYYY').toUpperCase()}
          </Text>
        </View>

        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Hoy</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openSettings} style={styles.configButton}>
          <Ionicons name="settings-outline" size={16} color="#fff" />
          <Text style={styles.configButtonText}>Configurar horarios</Text>
        </TouchableOpacity>
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

      {/* Day Modal */}
      {renderDayModal()}

      {/* ================= Settings Modal ================= */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={dynamicStyles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Configurar días y horarios</Text>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                <Text style={dynamicStyles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {/* Duración de cita */}
              <View style={styles.durationRow}>
                <Text style={[styles.durationLabel, { color: colors.text }]}>Duración de cita:</Text>
                <TextInput
                  value={String(settingsDraft.slotDuration ?? '')}
                  onChangeText={(v) => {
                    const numericValue = v.replace(/[^0-9]/g, '');
                    setSettingsDraft((prev) => ({
                      ...prev,
                      slotDuration: numericValue,
                    }));
                  }}
                  placeholder="30"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numeric"
                  style={[dynamicStyles.timeInput, { width: 80, textAlign: 'center' }]}
                />
                <Text style={[styles.durationLabel, { color: colors.textSecondary }]}>minutos</Text>
              </View>

              {/* Configurar horarios por día - UNIFICADO */}
              <Text style={[dynamicStyles.sectionTitle, { marginTop: 15 }]}>Configura tus horarios</Text>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Toca un día para activarlo/desactivarlo y configura sus bloques horarios
              </Text>

              {/* Selector de día unificado */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dayTabsContainer}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const isWorkingDay = settingsDraft.workingDays?.[d];
                  const blocksCount = (settingsDraft.dayBlocks?.[d] || []).length;
                  const isSelected = selectedConfigDay === d;

                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.dayTab,
                        isSelected && styles.dayTabSelected,
                        !isWorkingDay && styles.dayTabInactive,
                      ]}
                      onPress={() => setSelectedConfigDay(d)}
                    >
                      <Text style={[
                        styles.dayTabText,
                        isSelected && styles.dayTabTextSelected,
                        !isWorkingDay && styles.dayTabTextInactive,
                      ]}>
                        {DAY_SHORT_NAMES[d]}
                      </Text>
                      {isWorkingDay && blocksCount > 0 && (
                        <View style={[styles.dayTabBadge, isSelected && styles.dayTabBadgeSelected]}>
                          <Text style={[styles.dayTabBadgeText, isSelected && { color: '#2196F3' }]}>{blocksCount}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Configuración del día seleccionado */}
              <View style={[styles.dayConfigContainer, { backgroundColor: darkMode ? '#2A2A2A' : '#F5F5F5' }]}>
                <View style={styles.dayConfigHeader}>
                  <Text style={[styles.dayConfigTitle, { color: colors.text }]}>
                    {DAY_NAMES[selectedConfigDay]}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.dayToggleButton,
                      settingsDraft.workingDays?.[selectedConfigDay]
                        ? styles.dayToggleActive
                        : styles.dayToggleInactive
                    ]}
                    onPress={() => updateWorkingDay(selectedConfigDay)}
                  >
                    <Text style={[
                      styles.dayToggleText,
                      settingsDraft.workingDays?.[selectedConfigDay]
                        ? styles.dayToggleTextActive
                        : styles.dayToggleTextInactive
                    ]}>
                      {settingsDraft.workingDays?.[selectedConfigDay] ? 'Laborable' : 'No laborable'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {!settingsDraft.workingDays?.[selectedConfigDay] ? (
                  <View style={styles.inactiveDayMessage}>
                    <Ionicons name="moon-outline" size={24} color={colors.textSecondary} />
                    <Text style={[styles.noBlocksText, { color: colors.textSecondary }]}>
                      Día de descanso
                    </Text>
                    <Text style={[styles.helperText, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Toca "No laborable" para activar este día
                    </Text>
                  </View>
                ) : (
                  <>
                    {(settingsDraft.dayBlocks?.[selectedConfigDay] || []).length === 0 ? (
                      <Text style={[styles.noBlocksText, { color: colors.textSecondary }]}>
                        Sin bloques horarios configurados
                      </Text>
                    ) : (
                      (settingsDraft.dayBlocks?.[selectedConfigDay] || []).map((b, i) => (
                        <View key={b.id} style={styles.blockRow}>
                          <View style={styles.blockNumber}>
                            <Text style={styles.blockNumberText}>{i + 1}</Text>
                          </View>
                          <TouchableOpacity
                            style={dynamicStyles.timeInput}
                            onPress={() => openTimePicker(selectedConfigDay, b.id, 'start')}
                          >
                            <Text style={{ color: b.start ? colors.text : colors.placeholder, fontSize: 16 }}>
                              {b.start || 'Inicio'}
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.timeSeparator}>-</Text>
                          <TouchableOpacity
                            style={dynamicStyles.timeInput}
                            onPress={() => openTimePicker(selectedConfigDay, b.id, 'end')}
                          >
                            <Text style={{ color: b.end ? colors.text : colors.placeholder, fontSize: 16 }}>
                              {b.end || 'Fin'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeBlock(selectedConfigDay, b.id)}
                            style={styles.removeBlockButton}
                          >
                            <Ionicons name="trash-outline" size={20} color="#E53935" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}

                    <View style={styles.blockActions}>
                      <TouchableOpacity
                        onPress={() => addBlock(selectedConfigDay)}
                        style={styles.addBlockButton}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#2196F3" />
                        <Text style={styles.addBlockButtonText}>Agregar bloque</Text>
                      </TouchableOpacity>

                      {(settingsDraft.dayBlocks?.[selectedConfigDay] || []).length > 0 && (
                        <TouchableOpacity
                          onPress={() => copyBlocksToAllDays(selectedConfigDay)}
                          style={styles.copyButton}
                        >
                          <Ionicons name="copy-outline" size={16} color="#455A64" />
                          <Text style={styles.copyButtonText}>Copiar a todos</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
              </View>

              {/* Resumen de configuración */}
              <View style={[styles.configSummary, { backgroundColor: darkMode ? '#1E3A5F' : '#E3F2FD' }]}>
                <Ionicons name="calendar-outline" size={20} color="#2196F3" />
                <View style={styles.configSummaryText}>
                  <Text style={[styles.configSummaryTitle, { color: colors.text }]}>
                    Resumen de {currentMonth.format('MMMM')}
                  </Text>
                  <Text style={[styles.configSummaryDetail, { color: colors.textSecondary }]}>
                    {(() => {
                      const workingDaysCount = Object.values(settingsDraft.workingDays || {}).filter(Boolean).length;
                      let totalSlots = 0;
                      const duration = parseInt(settingsDraft.slotDuration) || SLOT_DURATION_MIN;

                      for (let day = 0; day < 7; day++) {
                        if (settingsDraft.workingDays?.[day]) {
                          const blocks = settingsDraft.dayBlocks?.[day] || [];
                          blocks.forEach(b => {
                            if (b?.start && b?.end) {
                              const slots = sliceIntervalToSlots(b.start, b.end, duration);
                              totalSlots += slots.length;
                            }
                          });
                        }
                      }

                      // Calcular días del mes actual que son laborables
                      const startOfMonth = currentMonth.startOf('month');
                      const endOfMonth = currentMonth.endOf('month');
                      let daysInMonth = 0;
                      let currentDay = startOfMonth;
                      while (currentDay.isBefore(endOfMonth) || currentDay.isSame(endOfMonth, 'day')) {
                        if (settingsDraft.workingDays?.[currentDay.day()]) {
                          daysInMonth++;
                        }
                        currentDay = currentDay.add(1, 'day');
                      }

                      return `${workingDaysCount} día(s) laborables por semana · ${daysInMonth} días en el mes · ~${totalSlots} cupos/semana`;
                    })()}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Botones de guardado */}
            <View style={styles.saveButtonsContainer}>
              {saving ? (
                <View style={styles.savingContainer}>
                  <ActivityIndicator size="small" color="#2196F3" />
                  <Text style={[styles.savingText, { color: colors.text }]}>Guardando configuración...</Text>
                </View>
              ) : (
                <>
                  {/* Botón principal - Guardar general */}
                  <TouchableOpacity
                    onPress={saveGeneralConfig}
                    style={styles.primarySaveButton}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <View style={styles.saveButtonIconContainer}>
                      <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    </View>
                    <View style={styles.saveButtonContent}>
                      <Text style={styles.primarySaveButtonTitle}>Guardar configuración</Text>
                      <Text style={styles.primarySaveButtonSubtitle}>Se aplicará a todos los meses</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>

                  {/* Botón secundario - Solo este mes */}
                  <TouchableOpacity
                    onPress={saveMonthConfig}
                    style={[styles.secondarySaveButton, { borderColor: colors.border }]}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-number-outline" size={20} color="#666" />
                    <Text style={[styles.secondarySaveButtonText, { color: colors.text }]}>
                      Aplicar solo a {currentMonth.format('MMMM YYYY')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* TimePicker for iOS (modal style) */}
            {Platform.OS === 'ios' && showTimePicker && (
              <View style={styles.timePickerContainer}>
                <View style={styles.timePickerHeader}>
                  <TouchableOpacity onPress={closeTimePicker}>
                    <Text style={styles.timePickerCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerTitle}>
                    {timePickerField === 'start' ? 'Hora de inicio' : 'Hora de fin'}
                  </Text>
                  <TouchableOpacity onPress={closeTimePicker}>
                    <Text style={styles.timePickerDone}>Listo</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={timePickerValue}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={onTimePickerChange}
                  minuteInterval={5}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* TimePicker for Android (native dialog) */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={timePickerValue}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={onTimePickerChange}
          minuteInterval={5}
        />
      )}

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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#2196F3', paddingTop: 40, paddingBottom: 16, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#E3F2FD' },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  navButtonText: { fontSize: 20, color: '#2196F3' },
  monthDisplay: { flex: 1, alignItems: 'center' },
  monthText: { fontSize: 16, fontWeight: '600', color: '#333' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 10,
  },
  todayButton: {
    flex: 1,
    alignSelf: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 10,
  },
  todayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  configButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#455A64',
    borderRadius: 10,
  },
  configButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  legend: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBox: { width: 16, height: 16, borderRadius: 3 },
  legendText: { fontSize: 12, color: '#666' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calendarContainer: { flex: 1, paddingHorizontal: 10 },
  calendar: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayCell: { flex: 1, alignItems: 'center' },
  weekDayText: { fontSize: 12, fontWeight: '600', color: '#666' },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    position: 'relative',
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
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    minWidth: 24,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  availabilityText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  extraDayBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: '#9C27B0',
    borderRadius: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraDayText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333', textTransform: 'capitalize' },
  modalSubtitle: { fontSize: 13, marginTop: 4 },
  modalClose: { fontSize: 24, color: '#999' },
  modalBody: { flex: 1, padding: 20, paddingBottom: 40 },
  modalBodyContent: { paddingBottom: 30 },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },

  // Indicador de cupos del mes
  monthSlotsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#E8F5E9',
    borderTopWidth: 1,
    borderTopColor: '#C8E6C9',
  },
  monthSlotsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  monthSlotsText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  clearSlotsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  clearSlotsText: {
    fontSize: 13,
    color: '#F44336',
    fontWeight: '600',
  },

  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, marginVertical: 20 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
  },
  quickActionBlock: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFCDD2',
  },
  quickActionEdit: {
    backgroundColor: '#E3F2FD',
    borderColor: '#BBDEFB',
  },
  quickActionUnblock: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  quickActionOpen: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Blocked state
  blockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  blockedText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  blockedSubtext: {
    fontSize: 14,
    marginTop: 8,
  },

  // Slots list
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotItem: {
    flexDirection: 'column',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 80,
  },
  slotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasonText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Saving overlay
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },

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
  saveButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexGrow: 1,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  // Settings
  sectionTitle: { fontSize: 14, color: '#333', fontWeight: '700', marginBottom: 8 },
  dowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dowChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  dowText: { fontSize: 14 },
  blockRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  blockNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  timeSeparator: { fontSize: 16, color: '#666' },
  removeBlockButton: { padding: 8 },
  addButton: {
    borderWidth: 2,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  addButtonText: { color: '#2196F3', fontSize: 16, fontWeight: '600', marginLeft: 6 },

  // Save buttons container
  saveButtonsContainer: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 10,
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  savingText: {
    fontSize: 15,
    fontWeight: '500',
  },
  primarySaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  saveButtonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonContent: {
    flex: 1,
  },
  primarySaveButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  primarySaveButtonSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  secondarySaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  secondarySaveButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Helper text
  helperText: { fontSize: 13, marginBottom: 12 },

  // Day tabs for config
  dayTabsContainer: { marginBottom: 12 },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayTabSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#1976D2',
  },
  dayTabDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.5,
  },
  dayTabInactive: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  dayTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  dayTabTextSelected: {
    color: '#fff',
  },
  dayTabTextDisabled: {
    color: '#999',
  },
  dayTabTextInactive: {
    color: '#999',
  },
  dayTabBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  dayTabBadgeSelected: {
    backgroundColor: '#fff',
  },
  dayTabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Day config container
  dayConfigContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  dayConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dayConfigTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  dayStatusBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dayStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noBlocksText: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 10,
  },

  // Day toggle button
  dayToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  dayToggleActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  dayToggleInactive: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  dayToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayToggleTextActive: {
    color: '#2E7D32',
  },
  dayToggleTextInactive: {
    color: '#999',
  },

  // Inactive day message
  inactiveDayMessage: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },

  // Duration row
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 5,
  },
  durationLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Add block button
  addBlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  addBlockButtonText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },

  // Config summary
  configSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  configSummaryText: {
    flex: 1,
  },
  configSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  configSummaryDetail: {
    fontSize: 12,
  },

  // Block actions
  blockActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ECEFF1',
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#455A64',
    fontSize: 13,
    fontWeight: '500',
  },

  // Save month button style
  saveMonthButton: {
    backgroundColor: '#455A64',
  },

  // TimePicker styles (iOS)
  timePickerContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  timePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timePickerCancel: {
    fontSize: 16,
    color: '#999',
  },
  timePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  // Estilos para modo edición de cupos
  editActionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  editHelpText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 6,
  },
  editActionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editActionText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  checkboxSmall: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSmallSelected: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  slotItemSelected: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  slotStatusLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  editFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  editSaveButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editSaveButtonDisabled: {
    backgroundColor: '#FFCDD2',
  },
  editSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
