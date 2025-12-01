import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
  TextInput,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { createAppointment } from '../services/firestore';
import { UserAvatar } from '../components/UserAvatar';
import {
  isDoctorFavorite,
  addDoctorToFavorites,
  removeDoctorFromFavorites
} from '../services/favoritesService';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

// helper
import { buildSlotsFromRanges } from '../services/slotUtils';

/* ========= helpers ========= */
const toStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const toEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const addMinutes = (date, minutes) =>
  new Date(date.getTime() + minutes * 60000);
const isAfterNow = (d) => d.getTime() > Date.now();

const parseHHmm = (hhmm) => {
  const [h, m] = String(hhmm || '')
    .split(':')
    .map((v) => parseInt(v, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
};
const two = (n) => String(n).padStart(2, '0');
const dateKey = (d) =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// Obtener configuración de trabajo del doctor (versión async para carga inicial)
const fetchDoctorWorkSettings = async (doctorId) => {
  try {
    const ref = doc(db, 'users', doctorId, 'config', 'workSettings');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    return null;
  }
};

// Referencia al documento de workSettings
const getWorkSettingsRef = (doctorId) => doc(db, 'users', doctorId, 'config', 'workSettings');

// Generar slots desde bloques de horario
const generateSlotsFromBlocks = (blocks, slotDuration = 30) => {
  const slots = [];
  const duration = Math.max(5, slotDuration);

  (blocks || []).forEach((block) => {
    if (!block?.start || !block?.end) return;

    const startParts = parseHHmm(block.start);
    const endParts = parseHHmm(block.end);
    const startMin = startParts.h * 60 + startParts.m;
    const endMin = endParts.h * 60 + endParts.m;

    let current = startMin;
    while (current + duration <= endMin) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${two(h)}:${two(m)}`);
      current += duration;
    }
  });

  // Ordenar y eliminar duplicados
  return [...new Set(slots)].sort((a, b) => {
    const aParts = parseHHmm(a);
    const bParts = parseHHmm(b);
    return (aParts.h * 60 + aParts.m) - (bParts.h * 60 + bParts.m);
  });
};

const fetchAvailabilityForDate = async (doctorId, date, workSettings = null, customDates = null, hasActiveAppointments = false, appointmentDuration = null) => {
  try {
    const id = dateKey(date);

    // Si tenemos customDates del listener, verificar si hay documento para este día
    if (customDates && customDates.has(id)) {
      const data = customDates.get(id);
      // PROTECCIÓN: Si el documento tiene citas (hasAppointments) o hay citas activas detectadas,
      // SIEMPRE usar el documento existente para preservar la configuración original
      if (data.hasAppointments || hasActiveAppointments) {
        return data;
      }
      // Si es configuración específica del mes, usarla
      if (data.isMonthSpecific) {
        return data;
      }
      // Si no hay citas activas y hay workSettings, generar dinámicamente
      if (workSettings) {
        const dayOfWeek = date.getDay();
        const isWorkingDay = workSettings.workingDays?.[dayOfWeek] || workSettings.workingDays?.[String(dayOfWeek)];
        if (isWorkingDay) {
          const blocksForDay = workSettings.dayBlocks?.[dayOfWeek] || workSettings.dayBlocks?.[String(dayOfWeek)] || workSettings.blocks || [];
          const slots = generateSlotsFromBlocks(blocksForDay, workSettings.slotDuration);
          return {
            slots,
            slotDuration: workSettings.slotDuration || 30,
            generatedFrom: blocksForDay,
            isDynamic: true,
          };
        }
      }
      return data;
    }

    const ref = doc(db, 'users', doctorId, 'availabilities', id);
    const snap = await getDoc(ref);

    // Si existe documento específico para esta fecha
    if (snap.exists()) {
      const data = snap.data();
      // PROTECCIÓN: Si el documento tiene citas (hasAppointments) o hay citas activas detectadas,
      // SIEMPRE usar el documento existente para preservar la configuración original
      if (data.hasAppointments || hasActiveAppointments) {
        return data;
      }
      // Si es configuración específica del mes, usarla
      if (data.isMonthSpecific) {
        return data;
      }
      // Si no hay citas y no es específico del mes, generar dinámicamente
      if (workSettings) {
        const dayOfWeek = date.getDay();
        const isWorkingDay = workSettings.workingDays?.[dayOfWeek] || workSettings.workingDays?.[String(dayOfWeek)];
        if (isWorkingDay) {
          const blocksForDay = workSettings.dayBlocks?.[dayOfWeek] || workSettings.dayBlocks?.[String(dayOfWeek)] || workSettings.blocks || [];
          const slots = generateSlotsFromBlocks(blocksForDay, workSettings.slotDuration);
          return {
            slots,
            slotDuration: workSettings.slotDuration || 30,
            generatedFrom: blocksForDay,
            isDynamic: true,
          };
        }
      }
      return data;
    }

    // Si no existe documento pero hay citas activas, generar slots con la duración de las citas
    // y crear documento para persistir la protección
    if (hasActiveAppointments && workSettings) {
      const dayOfWeek = date.getDay();
      const isWorkingDay = workSettings.workingDays?.[dayOfWeek] || workSettings.workingDays?.[String(dayOfWeek)];

      if (isWorkingDay) {
        // Usar la duración de la cita existente, no la nueva configuración
        const slotDuration = appointmentDuration || workSettings.slotDuration || 30;
        const blocksForDay = workSettings.dayBlocks?.[dayOfWeek] || workSettings.dayBlocks?.[String(dayOfWeek)] || workSettings.blocks || [];
        const slots = generateSlotsFromBlocks(blocksForDay, slotDuration);

        // Crear documento en Firestore para persistir la protección
        try {
          const dateObj = new Date(date);
          dateObj.setHours(0, 0, 0, 0);

          await setDoc(ref, {
            date: Timestamp.fromDate(dateObj),
            slots,
            slotDuration,
            generatedFrom: blocksForDay,
            updatedAt: serverTimestamp(),
            blocked: false,
            hasAppointments: true,
          });
        } catch (e) {
          // Error silencioso
        }

        return {
          slots,
          slotDuration,
          generatedFrom: blocksForDay,
          hasAppointments: true,
        };
      }
    }

    // Si no existe documento y no hay citas, generar dinámicamente desde workSettings
    if (workSettings) {
      const dayOfWeek = date.getDay();
      const isWorkingDay = workSettings.workingDays?.[dayOfWeek] || workSettings.workingDays?.[String(dayOfWeek)];

      if (!isWorkingDay) {
        return { blocked: true, slots: [] };
      }

      const blocksForDay = workSettings.dayBlocks?.[dayOfWeek] || workSettings.dayBlocks?.[String(dayOfWeek)] || workSettings.blocks || [];
      const slots = generateSlotsFromBlocks(blocksForDay, workSettings.slotDuration);

      return {
        slots,
        slotDuration: workSettings.slotDuration || 30,
        generatedFrom: blocksForDay,
        isDynamic: true,
      };
    }

    return null;
  } catch (e) {
    return null;
  }
};

// Obtiene las excepciones de disponibilidad (días bloqueados y personalizados)
// Retorna: { blockedDates: Set, customDates: Map<dateKey, data> }
const fetchAvailabilityExceptions = async (doctorId) => {
  const blockedDates = new Set();
  const customDates = new Map();

  try {
    const colRef = collection(db, 'users', doctorId, 'availabilities');
    const snap = await getDocs(colRef);

    snap.forEach((d) => {
      const data = d.data();
      const dateKeyStr = d.id;

      if (data.blocked) {
        blockedDates.add(dateKeyStr);
      } else {
        // Guardar datos personalizados (slots específicos para ese día)
        customDates.set(dateKeyStr, data);
      }
    });
  } catch (e) {
    // Error silencioso
  }

  return { blockedDates, customDates };
};

// Verifica si una fecha específica está disponible según workSettings y excepciones
const isDateAvailable = (date, workSettings, blockedDates, customDates) => {
  const today = toStartOfDay(new Date());
  const dateStart = toStartOfDay(date);

  // No mostrar fechas pasadas
  if (dateStart < today) return false;

  const key = dateKey(date);

  // Si está explícitamente bloqueado, no disponible
  if (blockedDates.has(key)) return false;

  // Si tiene documento personalizado, verificar si tiene slots
  if (customDates.has(key)) {
    const data = customDates.get(key);
    const hasSlots = (data.slots && data.slots.length > 0) ||
                     (data.morning?.start && data.morning?.end) ||
                     (data.afternoon?.start && data.afternoon?.end);
    return hasSlots;
  }

  // Si no hay excepción, usar workSettings para determinar disponibilidad
  if (workSettings?.workingDays) {
    const dayOfWeek = date.getDay();

    // Verificar si es día laborable (Firestore convierte claves numéricas a strings)
    const isWorkingDay = workSettings.workingDays[dayOfWeek] || workSettings.workingDays[String(dayOfWeek)];
    if (!isWorkingDay) return false;

    // Verificar si tiene bloques configurados (dayBlocks o blocks)
    const blocksForDay = workSettings.dayBlocks?.[dayOfWeek] ||
                         workSettings.dayBlocks?.[String(dayOfWeek)] ||
                         workSettings.blocks || [];

    return blocksForDay.length > 0;
  }

  return false;
};

/* ========= componente ========= */
export default function DoctorDetailScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const { firebaseUser } = useAuth();
  const { colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();

  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date()); // Mes actual del calendario

  const [daySlots, setDaySlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [requestingAppointment, setRequestingAppointment] = useState(false);

  const [reason, setReason] = useState('');

  // Fechas con citas del paciente (pendientes o aceptadas)
  const [patientAppointmentDates, setPatientAppointmentDates] = useState(new Set());

  // Estado de favoritos
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  // Configuración de trabajo del doctor (para generación dinámica de slots)
  const [doctorWorkSettings, setDoctorWorkSettings] = useState(null);

  // Excepciones de disponibilidad (días bloqueados y personalizados)
  const [blockedDates, setBlockedDates] = useState(new Set());
  const [customDates, setCustomDates] = useState(new Map());

  // Contador para forzar actualización cuando cambian los settings
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Función para verificar si una fecha está disponible (usa workSettings indefinidamente)
  const checkDateAvailable = (date) => {
    return isDateAvailable(date, doctorWorkSettings, blockedDates, customDates);
  };

  // Cargar fechas con citas del paciente con ESTE doctor (pendientes o aceptadas)
  useEffect(() => {
    if (!firebaseUser?.uid || !doctorId) return;

    const patientAppointmentsQuery = query(
      collection(db, 'appointments'),
      where('patientId', '==', firebaseUser.uid),
      where('doctorId', '==', doctorId),
      where('status', 'in', ['requested', 'accepted'])
    );

    const unsubscribe = onSnapshot(patientAppointmentsQuery, (snapshot) => {
      const dates = new Set();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const slotStart = data.slotStart instanceof Timestamp
          ? data.slotStart.toDate()
          : new Date(data.slotStart);
        dates.add(dateKey(slotStart));
      });
      setPatientAppointmentDates(dates);
    });

    return () => unsubscribe();
  }, [firebaseUser?.uid, doctorId]); 

  // Carga doctor + fechas con disponibilidad
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const snap = await getDoc(doc(db, 'users', doctorId));
        if (!snap.exists()) {
          showAlert('Error', 'Doctor no encontrado');
          navigation.goBack();
          return;
        }
        const data = { id: snap.id, ...snap.data() };

        // La foto viene directamente de Cloudinary en photoURL desde Firestore

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

        // Cargar configuración de trabajo del doctor
        const workSettings = await fetchDoctorWorkSettings(doctorId);
        setDoctorWorkSettings(workSettings);

        // Cargar excepciones de disponibilidad (días bloqueados y personalizados)
        const exceptions = await fetchAvailabilityExceptions(doctorId);
        setBlockedDates(exceptions.blockedDates);
        setCustomDates(exceptions.customDates);

        // Verificar si está en favoritos
        if (firebaseUser?.uid) {
          const favStatus = await isDoctorFavorite(firebaseUser.uid, doctorId);
          setIsFavorite(favStatus);
        }
      } catch (e) {
        showAlert('Error', 'No se pudo cargar la información del doctor');
      } finally {
        setLoading(false);
      }
    })();
  }, [doctorId, navigation, firebaseUser?.uid]);

  // ========= LISTENER EN TIEMPO REAL para workSettings =========
  useEffect(() => {
    if (!doctorId) return;

    const workSettingsRef = getWorkSettingsRef(doctorId);

    const unsubscribe = onSnapshot(workSettingsRef, (snap) => {
      if (snap.exists()) {
        const newSettings = snap.data();
        setDoctorWorkSettings(newSettings);
        // Incrementar versión para forzar re-render de slots
        setSettingsVersion(v => v + 1);
      }
    }, (error) => {
      // Error silencioso - mantener configuración actual
      console.log('Error listening to workSettings:', error);
    });

    return () => unsubscribe();
  }, [doctorId]);

  // ========= LISTENER EN TIEMPO REAL para availabilities =========
  useEffect(() => {
    if (!doctorId) return;

    const availabilitiesRef = collection(db, 'users', doctorId, 'availabilities');

    const unsubscribe = onSnapshot(availabilitiesRef, (snap) => {
      const newBlockedDates = new Set();
      const newCustomDates = new Map();

      snap.forEach((d) => {
        const data = d.data();
        const dateKeyStr = d.id;

        if (data.blocked) {
          newBlockedDates.add(dateKeyStr);
        } else {
          newCustomDates.set(dateKeyStr, data);
        }
      });

      setBlockedDates(newBlockedDates);
      setCustomDates(newCustomDates);
      // Incrementar versión para forzar re-render
      setSettingsVersion(v => v + 1);
    }, (error) => {
      console.log('Error listening to availabilities:', error);
    });

    return () => unsubscribe();
  }, [doctorId]);

  // Ocupados del día (citas aceptadas O pendientes - bloquean el slot)
  const fetchBusySet = async (doctorIdParam, date) => {
    const dayStart = Timestamp.fromDate(toStartOfDay(date));
    const dayEnd = Timestamp.fromDate(toEndOfDay(date));

    // Consulta para citas aceptadas
    const qyAccepted = query(
      collection(db, 'appointments'),
      where('doctorId', '==', doctorIdParam),
      where('slotStart', '>=', dayStart),
      where('slotStart', '<=', dayEnd),
      where('status', '==', 'accepted')
    );

    // Consulta para citas pendientes (requested)
    const qyRequested = query(
      collection(db, 'appointments'),
      where('doctorId', '==', doctorIdParam),
      where('slotStart', '>=', dayStart),
      where('slotStart', '<=', dayEnd),
      where('status', '==', 'requested')
    );

    const [snapAccepted, snapRequested] = await Promise.all([
      getDocs(qyAccepted),
      getDocs(qyRequested)
    ]);

    const set = new Set();
    const statusMap = new Map(); // Para saber si es 'accepted' o 'requested'

    snapAccepted.forEach((d) => {
      const ts = d.data().slotStart;
      const js = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
      set.add(js.getTime());
      statusMap.set(js.getTime(), 'accepted');
    });

    snapRequested.forEach((d) => {
      const ts = d.data().slotStart;
      const js = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
      set.add(js.getTime());
      if (!statusMap.has(js.getTime())) {
        statusMap.set(js.getTime(), 'requested');
      }
    });

    return { set, statusMap };
  };

  // Regenerar slots al cambiar fecha + listener en tiempo real para citas
  useEffect(() => {
    if (!selectedDate || !doctorId) {
      setDaySlots([]);
      return;
    }

    let unsubAccepted;
    let unsubRequested;

    // Guardamos el estado de ambas consultas
    // accepted: Map<timeKey, appointmentId>
    // requested: Map<timeKey, { appointmentId, patientId }>
    const busyData = {
      accepted: new Map(),
      requested: new Map(),
    };

    const regenerateSlots = async () => {
      // Verificar si hay citas activas para este día
      const hasActiveAppointments = busyData.accepted.size > 0 || busyData.requested.size > 0;

      // Obtener duración de citas existentes (si las hay)
      let appointmentDuration = null;
      if (hasActiveAppointments) {
        // Buscar la duración de la primera cita del día
        const firstAppointmentData = busyData.accepted.values().next().value ||
                                     busyData.requested.values().next().value;
        if (firstAppointmentData?.duration) {
          appointmentDuration = firstAppointmentData.duration;
        }
      }

      // Pasar workSettings, customDates, estado de citas activas y duración de citas
      const perDate = await fetchAvailabilityForDate(doctorId, selectedDate, doctorWorkSettings, customDates, hasActiveAppointments, appointmentDuration);
      let slots = [];

      // Si el día está bloqueado, no mostrar slots
      if (perDate?.blocked) {
        setDaySlots([]);
        return;
      }

      // 1) si el doc trae 'slots' (array de "HH:mm"), lo usamos directo
      if (Array.isArray(perDate?.slots) && perDate.slots.length) {
        const duration = perDate.slotDuration || 30;
        slots = perDate.slots.map((s) => {
          const { h, m } = parseHHmm(s);
          const start = new Date(selectedDate);
          start.setHours(h, m, 0, 0);
          const end = addMinutes(start, duration);
          return { timeLabel: s, start, end };
        });
      }
      // 2) si trae 'ranges', generamos slots de 30 min (o lo que indique)
      else if (
        perDate?.ranges &&
        Array.isArray(perDate.ranges) &&
        perDate.ranges.length > 0
      ) {
        const duration = perDate.slotDuration || 30;
        slots = buildSlotsFromRanges(selectedDate, perDate.ranges, duration);
      }
      // 3) si no hay doc por fecha ni workSettings, usar horario base semanal (fallback legacy)
      else if (docData?.schedule) {
        const wd = selectedDate.getDay();
        const ranges = docData.schedule.days?.[String(wd)] || [];
        const duration = docData.schedule.slotDuration || 30;
        for (const r of ranges) {
          const { h: sh, m: sm } = parseHHmm(r.start);
          const { h: eh, m: em } = parseHHmm(r.end);
          const rangeStart = new Date(selectedDate);
          rangeStart.setHours(sh, sm, 0, 0);
          const rangeEnd = new Date(selectedDate);
          rangeEnd.setHours(eh, em, 0, 0);
          let cur = new Date(rangeStart);
          while (addMinutes(cur, duration) <= rangeEnd) {
            const next = addMinutes(cur, duration);
            const label = `${two(cur.getHours())}:${two(cur.getMinutes())}`;
            slots.push({ timeLabel: label, start: new Date(cur), end: next });
            cur = next;
          }
        }
      }

      const accepts = docData?.acceptsNewPatients !== false;
      const currentUserId = firebaseUser?.uid;

      // Combinar ambos sets para determinar disponibilidad
      const merged = slots.map((s) => {
        const timeKey = s.start.getTime();
        const isAccepted = busyData.accepted.has(timeKey);
        const requestedData = busyData.requested.get(timeKey);
        const isRequested = !!requestedData;
        const isBusy = isAccepted || isRequested;

        // Verificar si la solicitud pendiente es del usuario actual
        const isMyRequest = isRequested && requestedData?.patientId === currentUserId;

        // Determinar el estado del slot
        let slotStatus = 'available';
        if (!isAfterNow(s.start)) {
          slotStatus = 'past';
        } else if (isAccepted) {
          slotStatus = 'occupied'; // Cita confirmada
        } else if (isMyRequest) {
          slotStatus = 'myPending'; // Mi solicitud pendiente (con color)
        } else if (isRequested) {
          slotStatus = 'otherPending'; // Solicitud de otro paciente (bloqueado sin color)
        }

        return {
          ...s,
          available: accepts && !isBusy && isAfterNow(s.start),
          slotStatus,
        };
      });

      setDaySlots(merged);
    };

    try {
      const dayStart = Timestamp.fromDate(toStartOfDay(selectedDate));
      const dayEnd = Timestamp.fromDate(toEndOfDay(selectedDate));

      // Listener para citas aceptadas
      const qyAccepted = query(
        collection(db, 'appointments'),
        where('doctorId', '==', doctorId),
        where('slotStart', '>=', dayStart),
        where('slotStart', '<=', dayEnd),
        where('status', '==', 'accepted')
      );

      // Listener para citas pendientes (requested)
      const qyRequested = query(
        collection(db, 'appointments'),
        where('doctorId', '==', doctorId),
        where('slotStart', '>=', dayStart),
        where('slotStart', '<=', dayEnd),
        where('status', '==', 'requested')
      );

      unsubAccepted = onSnapshot(
        qyAccepted,
        (snapshot) => {
          busyData.accepted.clear();
          snapshot.forEach((d) => {
            const data = d.data();
            const ts = data.slotStart;
            const tsEnd = data.slotEnd;
            const js = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
            // Calcular duración de la cita
            let duration = 30;
            if (tsEnd) {
              const jsEnd = tsEnd instanceof Timestamp ? tsEnd.toDate() : new Date(tsEnd);
              duration = Math.round((jsEnd.getTime() - js.getTime()) / 60000);
            }
            busyData.accepted.set(js.getTime(), { appointmentId: d.id, duration });
          });
          regenerateSlots();
        },
        () => {
          busyData.accepted.clear();
          regenerateSlots();
        }
      );

      unsubRequested = onSnapshot(
        qyRequested,
        (snapshot) => {
          busyData.requested.clear();
          snapshot.forEach((d) => {
            const data = d.data();
            const ts = data.slotStart;
            const tsEnd = data.slotEnd;
            const js = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
            // Calcular duración de la cita
            let duration = 30;
            if (tsEnd) {
              const jsEnd = tsEnd instanceof Timestamp ? tsEnd.toDate() : new Date(tsEnd);
              duration = Math.round((jsEnd.getTime() - js.getTime()) / 60000);
            }
            // Guardar appointmentId, patientId y duración
            busyData.requested.set(js.getTime(), {
              appointmentId: d.id,
              patientId: data.patientId,
              duration,
            });
          });
          regenerateSlots();
        },
        () => {
          busyData.requested.clear();
          regenerateSlots();
        }
      );
    } catch (err) {
      (async () => {
        try {
          const { set, statusMap } = await fetchBusySet(doctorId, selectedDate);
          // Llenar busyData desde fetchBusySet
          set.forEach((timeKey) => {
            const status = statusMap.get(timeKey);
            if (status === 'accepted') {
              busyData.accepted.set(timeKey, true);
            } else if (status === 'requested') {
              busyData.requested.set(timeKey, true);
            }
          });
          regenerateSlots();
        } catch {
          regenerateSlots();
        }
      })();
    }

    return () => {
      if (unsubAccepted) unsubAccepted();
      if (unsubRequested) unsubRequested();
    };
  }, [selectedDate, doctorId, docData?.schedule, docData?.acceptsNewPatients, doctorWorkSettings, customDates, settingsVersion]);

  // Abrir ubicación en mapa
  const handleOpenMap = () => {
    if (!docData?.location) {
      showAlert('Ubicación no disponible', 'Este doctor no ha configurado su ubicación en el mapa.');
      return;
    }

    const { latitude, longitude } = docData.location;
    const label = encodeURIComponent(`Dr. ${docData.name} - ${docData.clinicAddress || 'Consultorio'}`);

    // URL para diferentes plataformas
    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const latLng = `${latitude},${longitude}`;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });

    Linking.openURL(url).catch(() => {
      // Fallback a Google Maps web
      const webUrl = `https://www.google.com/maps/search/?api=1&query=${latLng}`;
      Linking.openURL(webUrl).catch(() => {
        showAlert('Error', 'No se pudo abrir el mapa');
      });
    });
  };

  // Crear cita (acepta "HH:mm" o "HH:mm – HH:mm")
  const handleToggleFavorite = async () => {
    if (!firebaseUser?.uid) {
      showAlert('Error', 'Debes iniciar sesión para agregar favoritos');
      return;
    }

    try {
      setTogglingFavorite(true);

      if (isFavorite) {
        await removeDoctorFromFavorites(firebaseUser.uid, doctorId);
        setIsFavorite(false);
        showAlert('Quitado', 'El médico fue quitado de favoritos');
      } else {
        await addDoctorToFavorites(firebaseUser.uid, doctorId);
        setIsFavorite(true);
        showAlert('Agregado', 'El médico fue agregado a favoritos');
      }
    } catch (error) {
      showAlert('Error', 'No se pudo actualizar favoritos');
    } finally {
      setTogglingFavorite(false);
    }
  };

  const handleRequestAppointment = async () => {
    if (!selectedDate || !selectedTime) {
      showAlert(
        'Selección requerida',
        'Selecciona una fecha y un horario/bloque.'
      );
      return;
    }

    if (!reason.trim()) {
      showAlert('Motivo requerido', 'Por favor agrega el motivo de la consulta.');
      return;
    }

    // Validar que no sea solo números
    if (/^\d+$/.test(reason.trim())) {
      showAlert('Motivo inválido', 'El motivo de la consulta debe contener texto descriptivo, no solo números.');
      return;
    }

    try {
      setRequestingAppointment(true);
      const startStr = selectedTime.includes('–')
        ? selectedTime.split('–')[0].trim()
        : selectedTime;
      const { h, m } = parseHHmm(startStr);
      const start = new Date(selectedDate);
      start.setHours(h, m, 0, 0);

      // evitar doble reserva (se revalida contra citas aceptadas Y pendientes)
      let busyResult = { set: new Set(), statusMap: new Map() };
      try {
        busyResult = await fetchBusySet(doctorId, selectedDate);
      } catch {}

      if (busyResult.set.has(start.getTime())) {
        const status = busyResult.statusMap.get(start.getTime());
        const message = status === 'requested'
          ? 'Este horario ya tiene una solicitud pendiente. Elige otro.'
          : 'El cupo fue tomado por otro paciente. Elige otro.';
        showAlert('Cupo no disponible', message);
        setSelectedTime(null);
        return;
      }

      // Validar citas existentes del paciente
      const patientAppointmentsQuery = query(
        collection(db, 'appointments'),
        where('patientId', '==', firebaseUser?.uid),
        where('status', 'in', ['requested', 'accepted'])
      );

      const patientAppointmentsSnap = await getDocs(patientAppointmentsQuery);

      // Filtrar en cliente: máximo 1 cita con el mismo doctor
      const dayStartTime = toStartOfDay(selectedDate).getTime();
      const dayEndTime = toEndOfDay(selectedDate).getTime();

      const hasExistingWithSameDoctor = patientAppointmentsSnap.docs.some((doc) => {
        const data = doc.data();
        if (data.doctorId !== doctorId) return false;
        const slotTime = data.slotStart instanceof Timestamp
          ? data.slotStart.toDate().getTime()
          : new Date(data.slotStart).getTime();
        return slotTime >= dayStartTime && slotTime <= dayEndTime;
      });

      if (hasExistingWithSameDoctor) {
        showAlert(
          'Solicitud pendiente',
          'Ya tienes una solicitud de cita pendiente con este doctor. Espera a que sea atendida antes de solicitar otra.'
        );
        return;
      }

      // Filtrar en cliente: no tener cita en el mismo horario con otro doctor
      const startTime = start.getTime();

      const conflictingAppointment = patientAppointmentsSnap.docs.find((doc) => {
        const data = doc.data();
        const slotTime = data.slotStart instanceof Timestamp
          ? data.slotStart.toDate().getTime()
          : new Date(data.slotStart).getTime();
        return slotTime === startTime;
      });

      if (conflictingAppointment) {
        const conflictData = conflictingAppointment.data();
        const statusText = conflictData.status === 'accepted' ? 'confirmada' : 'pendiente';
        showAlert(
          'Conflicto de horario',
          `Ya tienes una cita ${statusText} con otro doctor a esta misma hora. Por favor, selecciona un horario diferente.`
        );
        setSelectedTime(null);
        return;
      }

      await createAppointment({
        patientId: firebaseUser?.uid,
        doctorId,
        reason: reason.trim() || 'Consulta médica',
        slotStart: start,
        // status lo pone firestore.js (ej. 'requested')
      });

      // Limpiar selecciones para ocultar el resumen
      setSelectedDate(null);
      setSelectedTime(null);
      setReason('');

      showAlert(
        'Solicitud enviada',
        `Tu solicitud para el ${start.toLocaleDateString(
          'es-ES'
        )} a las ${two(h)}:${two(m)} fue enviada.`,
        [
          {
            text: 'Ver mis citas',
            onPress: () => {
              // Navegar al tab de Citas desde el stack anidado
              const parent = navigation.getParent();
              if (parent) {
                parent.navigate('AppointmentsTab');
              } else {
                navigation.navigate('AppointmentsTab');
              }
            }
          },
          { text: 'Cerrar' },
        ]
      );
    } catch (e) {
      showAlert('Error', 'No se pudo crear la solicitud de cita');
    } finally {
      setRequestingAppointment(false);
    }
  };

  /* ========= UI ========= */
  // Verificar si un mes tiene disponibilidad
  // Con workSettings, todos los meses futuros tienen disponibilidad potencial
  const hasAvailabilityInMonth = (year, month) => {
    // Si tiene configuración de trabajo, cualquier mes futuro puede tener disponibilidad
    // Verificar tanto dayBlocks (nuevo formato) como blocks (formato antiguo)
    let hasBlocks = false;

    // Verificar dayBlocks (objeto con claves 0-6 para cada día de la semana)
    if (doctorWorkSettings?.dayBlocks) {
      // Verificar si algún día tiene bloques configurados
      hasBlocks = Object.values(doctorWorkSettings.dayBlocks).some(
        blocks => Array.isArray(blocks) && blocks.length > 0
      );
    }

    // Fallback a blocks (formato antiguo - array)
    if (!hasBlocks && doctorWorkSettings?.blocks?.length > 0) {
      hasBlocks = true;
    }

    if (doctorWorkSettings?.workingDays && hasBlocks) {
      const today = new Date();
      const monthEnd = new Date(year, month + 1, 0); // Último día del mes
      return monthEnd >= today;
    }
    return false;
  };

  // Navegación del calendario
  const handlePrevMonth = () => {
    const prevMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1);
    if (hasAvailabilityInMonth(prevMonth.getFullYear(), prevMonth.getMonth())) {
      // Limpiar selección al cambiar de mes
      setSelectedDate(null);
      setSelectedTime(null);
      setDaySlots([]);
      setCurrentCalendarMonth(prevMonth);
    }
  };

  const handleNextMonth = () => {
    const nextMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1);
    if (hasAvailabilityInMonth(nextMonth.getFullYear(), nextMonth.getMonth())) {
      // Limpiar selección al cambiar de mes
      setSelectedDate(null);
      setSelectedTime(null);
      setDaySlots([]);
      setCurrentCalendarMonth(nextMonth);
    }
  };

  // Verificar si se puede navegar al mes anterior/siguiente
  const canGoToPrevMonth = () => {
    const prevMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1);
    return hasAvailabilityInMonth(prevMonth.getFullYear(), prevMonth.getMonth());
  };

  const canGoToNextMonth = () => {
    const nextMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1);
    return hasAvailabilityInMonth(nextMonth.getFullYear(), nextMonth.getMonth());
  };

  // Renderizar calendario
  const renderCalendar = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();

    // Primer día del mes
    const firstDayOfMonth = new Date(year, month, 1);
    // Último día del mes
    const lastDayOfMonth = new Date(year, month + 1, 0);
    // Día de la semana del primer día (0 = domingo)
    const startDayOfWeek = firstDayOfMonth.getDay();
    // Total de días en el mes
    const daysInMonth = lastDayOfMonth.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];

    // Días vacíos al inicio
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ key: `empty-${i}`, empty: true });
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      // Usar checkDateAvailable para disponibilidad indefinida
      const isAvailable = checkDateAvailable(date);
      const isPast = date < today;
      const isSelected = selectedDate && dateKey(selectedDate) === key;
      const isToday = date.getTime() === today.getTime();
      const hasAppointment = patientAppointmentDates.has(key);

      days.push({
        key,
        day,
        date,
        isAvailable,
        isPast,
        isSelected,
        isToday,
        hasAppointment,
        empty: false,
      });
    }

    // Dividir en semanas
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    // Nombres de los días
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const canPrev = canGoToPrevMonth();
    const canNext = canGoToNextMonth();

    return (
      <View style={styles.calendarContainer}>
        {/* Header del calendario con navegación */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            onPress={handlePrevMonth}
            style={[styles.calendarNavBtn, !canPrev && styles.calendarNavBtnDisabled]}
            disabled={!canPrev}
          >
            <Ionicons name="chevron-back" size={24} color={canPrev ? colors.text : colors.textLight} />
          </TouchableOpacity>
          <Text style={[styles.calendarMonthText, { color: colors.text }]}>
            {currentCalendarMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity
            onPress={handleNextMonth}
            style={[styles.calendarNavBtn, !canNext && styles.calendarNavBtnDisabled]}
            disabled={!canNext}
          >
            <Ionicons name="chevron-forward" size={24} color={canNext ? colors.text : colors.textLight} />
          </TouchableOpacity>
        </View>

        {/* Nombres de días de la semana */}
        <View style={styles.calendarWeekDays}>
          {dayNames.map((name) => (
            <Text key={name} style={[styles.calendarWeekDayText, { color: colors.textSecondary }]}>
              {name}
            </Text>
          ))}
        </View>

        {/* Días del mes */}
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarWeek}>
            {week.map((dayData) => {
              if (dayData.empty) {
                return <View key={dayData.key} style={styles.calendarDayEmpty} />;
              }

              const canSelect = dayData.isAvailable && !dayData.isPast;

              return (
                <TouchableOpacity
                  key={dayData.key}
                  style={[
                    styles.calendarDay,
                    dayData.isToday && !dayData.isSelected && styles.calendarDayToday,
                    dayData.isPast && styles.calendarDayPast,
                    dayData.isSelected && styles.calendarDaySelected,
                  ]}
                  onPress={() => {
                    if (canSelect) {
                      // Si ya está seleccionado, deseleccionar
                      if (dayData.isSelected) {
                        setSelectedDate(null);
                      } else {
                        setSelectedDate(dayData.date);
                      }
                      setSelectedTime(null);
                    }
                  }}
                  disabled={!canSelect}
                  activeOpacity={canSelect ? 0.7 : 1}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      { color: colors.text },
                      dayData.isToday && !dayData.isSelected && styles.calendarDayTextToday,
                      dayData.isPast && styles.calendarDayTextPast,
                      !dayData.isAvailable && !dayData.isPast && styles.calendarDayTextUnavailable,
                      dayData.isSelected && styles.calendarDayTextSelected,
                    ]}
                  >
                    {dayData.day}
                  </Text>
                  {dayData.hasAppointment && (
                    <View style={[
                      styles.appointmentDot,
                      dayData.isSelected && styles.appointmentDotSelected,
                    ]} />
                  )}
                </TouchableOpacity>
              );
            })}
            {/* Rellenar la última semana si es necesario */}
            {week.length < 7 && [...Array(7 - week.length)].map((_, i) => (
              <View key={`pad-${i}`} style={styles.calendarDayEmpty} />
            ))}
          </View>
        ))}

      </View>
    );
  };

  const renderTimeSlot = (slot) => {
    const isSelected = selectedTime === slot.timeLabel;
    const isMyPending = slot.slotStatus === 'myPending'; // Mi solicitud (con color)

    // Determinar la etiqueta a mostrar
    const getDisabledLabel = () => {
      if (slot.slotStatus === 'past') return 'Pasado';
      if (slot.slotStatus === 'myPending') return 'Mi solicitud';
      if (slot.slotStatus === 'otherPending') return 'No disponible';
      if (slot.slotStatus === 'occupied') return 'Ocupado';
      return '';
    };

    return (
      <TouchableOpacity
        key={`${slot.timeLabel}-${slot.start.getTime()}`}
        style={[
          dynamicStyles.timeSlot,
          isSelected && styles.timeSlotSelected,
          !slot.available && dynamicStyles.timeSlotDisabled,
          isMyPending && styles.timeSlotMyPending,
        ]}
        onPress={() => slot.available && setSelectedTime(slot.timeLabel)}
        disabled={!slot.available}
      >
        <Text
          style={[
            dynamicStyles.timeText,
            isSelected && styles.timeTextSelected,
            !slot.available && dynamicStyles.timeTextDisabled,
            isMyPending && styles.timeTextMyPending,
          ]}
        >
          {slot.timeLabel}
        </Text>
        {!slot.available && (
          <Text style={[styles.disabledLabel, isMyPending && styles.myPendingLabel]}>
            {getDisabledLabel()}
          </Text>
        )}
      </TouchableOpacity>
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
    headerTitle: {
      ...styles.headerTitle,
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
    errorText: {
      ...styles.errorText,
      color: colors.textSecondary,
    },
    doctorCard: {
      ...styles.doctorCard,
      backgroundColor: colors.card,
      borderTopColor: colors.border,
    },
    doctorName: {
      ...styles.doctorName,
      color: colors.text,
    },
    contactText: {
      ...styles.contactText,
      color: colors.textSecondary,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    timeSlot: {
      ...styles.timeSlot,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    timeText: {
      ...styles.timeText,
      color: colors.text,
    },
    timeSlotDisabled: {
      ...styles.timeSlotDisabled,
      backgroundColor: colors.background,
      borderColor: colors.border,
    },
    timeTextDisabled: {
      ...styles.timeTextDisabled,
      color: colors.textLight,
    },
    summaryCard: {
      ...styles.summaryCard,
      backgroundColor: colors.card,
    },
    summaryTitle: {
      ...styles.summaryTitle,
      color: colors.text,
    },
    summaryText: {
      ...styles.summaryText,
      color: colors.textSecondary,
    },
    reasonLabel: {
      ...styles.reasonLabel,
      color: colors.text,
    },
    reasonInput: {
      ...styles.reasonInput,
      borderColor: colors.inputBorder,
      color: colors.inputText,
      backgroundColor: colors.inputBackground,
    },
    contactButton: {
      ...styles.contactButton,
      backgroundColor: colors.inputBackground,
      borderColor: colors.border,
    },
    contactSection: {
      ...styles.contactSection,
      borderTopColor: colors.border,
    },
    availabilityBadge: {
      ...styles.availabilityBadge,
      backgroundColor: colors.inputBackground,
    },
    emptyText: {
      color: colors.textSecondary,
    },
  };

  if (loading) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={dynamicStyles.loadingText}>Cargando información del doctor...</Text>
      </View>
    );
  }

  if (!docData) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <Text style={dynamicStyles.errorText}>Doctor no encontrado</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={dynamicStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Detalles del Doctor</Text>
        <TouchableOpacity
          style={styles.favoriteBtn}
          onPress={handleToggleFavorite}
          disabled={togglingFavorite}
        >
          {togglingFavorite ? (
            <ActivityIndicator size="small" color={colors.headerIcon} />
          ) : (
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? '#E91E63' : colors.headerIcon}
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info doctor */}
        <View style={dynamicStyles.doctorCard}>
          <View style={styles.avatarContainer}>
            <UserAvatar
              userId={doctorId}
              name={docData.name}
              photoURL={docData.photoURL}
              size={80}
            />
          </View>

          <View style={styles.doctorInfo}>
            <Text style={dynamicStyles.doctorName}>
              Dr. {docData.name} {docData.lastName || ''}
            </Text>
            <Text style={styles.doctorSpecialty}>
              {docData.cssp?.profession || docData.specialty || 'Médico General'}
            </Text>
          </View>

          <View style={dynamicStyles.contactSection}>
            {docData.phone && (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={dynamicStyles.contactButton}
                  onPress={() => {
                    const phoneNumber = docData.phone.replace(/[^0-9]/g, '');
                    const whatsappUrl = `https://wa.me/503${phoneNumber}`;
                    Linking.openURL(whatsappUrl).catch(() => {
                      showAlert('Error', 'No se pudo abrir WhatsApp');
                    });
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                </TouchableOpacity>
                <Text style={dynamicStyles.contactText}>{docData.phone}</Text>
              </View>
            )}
            {docData.email && (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={dynamicStyles.contactButton}
                  onPress={() => {
                    const mailtoUrl = `mailto:${docData.email}`;
                    Linking.openURL(mailtoUrl).catch(() => {
                      showAlert('Error', 'No se pudo abrir el correo electrónico');
                    });
                  }}
                >
                  <Ionicons name="send" size={18} color="#2196F3" />
                </TouchableOpacity>
                <Text style={dynamicStyles.contactText}>{docData.email}</Text>
              </View>
            )}
            {docData.clinicAddress && (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={dynamicStyles.contactButton}
                  onPress={handleOpenMap}
                  disabled={!docData.location}
                >
                  <Ionicons
                    name="location"
                    size={20}
                    color={docData.location ? "#2196F3" : "#999"}
                  />
                </TouchableOpacity>
                <Text style={dynamicStyles.contactText}>{docData.clinicAddress}</Text>
              </View>
            )}
            {docData.location && (
              <TouchableOpacity
                style={styles.mapButton}
                onPress={handleOpenMap}
                activeOpacity={0.7}
              >
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={styles.mapButtonText}>Ver en mapa</Text>
              </TouchableOpacity>
            )}
          </View>

          {typeof docData.verified !== 'undefined' && (
            <View style={dynamicStyles.availabilityBadge}>
              <MaterialCommunityIcons
                name={docData.verified ? 'check-circle' : 'close-circle'}
                size={20}
                color={docData.verified ? '#4CAF50' : '#EF5350'}
              />
              <Text
                style={[
                  styles.availabilityText,
                  { color: docData.verified ? '#4CAF50' : '#EF5350' },
                ]}
              >
                {docData.verified ? 'Doctor verificado' : 'No verificado'}
              </Text>
            </View>
          )}
        </View>

        {/* Calendario */}
        <View style={styles.section}>
          <Text style={dynamicStyles.sectionTitle}>Selecciona una fecha</Text>
          {(() => {
            // Verificar si el doctor tiene horarios configurados
            let hasConfiguredSchedule = false;

            // Verificar dayBlocks (nuevo formato)
            if (doctorWorkSettings?.dayBlocks) {
              hasConfiguredSchedule = Object.values(doctorWorkSettings.dayBlocks).some(
                blocks => Array.isArray(blocks) && blocks.length > 0
              );
            }

            // Fallback a blocks (formato antiguo)
            if (!hasConfiguredSchedule && doctorWorkSettings?.blocks?.length > 0) {
              hasConfiguredSchedule = true;
            }

            return !hasConfiguredSchedule ? (
              <Text style={dynamicStyles.emptyText}>
                Este doctor aún no ha configurado su horario de atención.
              </Text>
            ) : (
              <View style={[styles.calendarWrapper, { backgroundColor: colors.card }]}>
                {renderCalendar()}
              </View>
            );
          })()}
        </View>

        {/* Horarios */}
        {selectedDate && (
          <View style={styles.section}>
            <Text style={dynamicStyles.sectionTitle}>Selecciona un horario</Text>
            {daySlots.length === 0 ? (
              <Text style={dynamicStyles.emptyText}>
                No hay horarios para esta fecha. El doctor podría no atender este día
                o sus bloques aún no fueron configurados.
              </Text>
            ) : (
              <View style={styles.timeSlotsContainer}>
                {daySlots.map((s) => renderTimeSlot(s))}
              </View>
            )}
          </View>
        )}

        {/* Confirmación + motivo */}
        {selectedDate && selectedTime && (
          <View style={styles.requestSection}>
            <View style={dynamicStyles.summaryCard}>
              <Text style={dynamicStyles.summaryTitle}>Resumen de tu cita</Text>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="calendar" size={20} color="#666" />
                <Text style={dynamicStyles.summaryText}>
                  {selectedDate.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="clock" size={20} color="#666" />
                <Text style={dynamicStyles.summaryText}>{selectedTime}</Text>
              </View>

              {/* Motivo de consulta */}
              <View style={styles.reasonContainer}>
                <Text style={dynamicStyles.reasonLabel}>Motivo de consulta</Text>
                <TextInput
                  style={dynamicStyles.reasonInput}
                  placeholder="Describe brevemente el motivo de la consulta..."
                  placeholderTextColor={colors.placeholder}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.requestButton,
                requestingAppointment && styles.requestButtonDisabled,
              ]}
              onPress={handleRequestAppointment}
              disabled={requestingAppointment}
            >
              {requestingAppointment ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="calendar" size={20} color="#fff" />
                  <Text style={styles.requestButtonText}>Solicitar Cita</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onDismiss={hideAlert}
      />
    </KeyboardAvoidingView>
  );
}

/* ========= estilos ========= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  errorText: { fontSize: 18, color: '#666', marginBottom: 20 },
  backButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  header: {
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  favoriteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  doctorCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: { alignItems: 'center', marginBottom: 16 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doctorInfo: { alignItems: 'center', marginBottom: 16 },
  doctorName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  doctorSpecialty: {
    fontSize: 16,
    color: '#2196F3',
    marginBottom: 8,
    textAlign: 'center',
  },
  contactSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 16,
    gap: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactText: { fontSize: 14, color: '#666', flex: 1 },
  contactButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  mapButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  availabilityText: { fontSize: 14, fontWeight: '600' },

  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },

  timeSlotsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeSlot: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 100,
    alignItems: 'center',
  },
  timeSlotSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  timeSlotDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
    opacity: 0.6,
  },
  timeText: { fontSize: 14, fontWeight: '600', color: '#333' },
  timeTextSelected: { color: '#fff' },
  timeTextDisabled: { color: '#999' },
  timeSlotPending: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFB300',
    opacity: 0.9,
  },
  timeTextPending: { color: '#F57C00' },
  // Mi solicitud pendiente (con color destacado)
  timeSlotMyPending: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    opacity: 1,
  },
  timeTextMyPending: { color: '#1976D2' },
  myPendingLabel: { color: '#1976D2' },
  disabledLabel: { fontSize: 10, color: '#999', marginTop: 4, fontWeight: '500' },
  pendingLabel: { color: '#F57C00' },

  requestSection: { marginHorizontal: 16, marginTop: 8 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  summaryText: { fontSize: 15, color: '#666', textTransform: 'capitalize' },

  reasonContainer: { marginTop: 12 },
  reasonLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
    minHeight: 70,
  },

  requestButton: {
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  requestButtonDisabled: { backgroundColor: '#90CAF9' },
  requestButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ========= Calendario =========
  calendarWrapper: {
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  calendarContainer: {
    width: '100%',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  calendarNavBtn: {
    padding: 8,
    borderRadius: 20,
  },
  calendarNavBtnDisabled: {
    opacity: 0.3,
  },
  calendarMonthText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  calendarWeekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  calendarWeekDayText: {
    fontSize: 12,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  calendarWeek: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  calendarDay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayEmpty: {
    width: 40,
    height: 40,
  },
  calendarDayToday: {
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  calendarDaySelected: {
    backgroundColor: '#2196F3',
  },
  calendarDayPast: {
    opacity: 0.4,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  calendarDayTextToday: {
    color: '#2196F3',
    fontWeight: '700',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarDayTextPast: {
    color: '#9E9E9E',
  },
  calendarDayTextUnavailable: {
    color: '#BDBDBD',
  },
  // Punto indicador de cita
  appointmentDot: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
  appointmentDotSelected: {
    backgroundColor: '#FFFFFF',
  },
});
