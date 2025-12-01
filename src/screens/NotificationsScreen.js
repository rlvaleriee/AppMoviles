import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function NotificationsScreen({ navigation }) {
  const { firebaseUser } = useAuth();
  const { colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [items, setItems] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!firebaseUser) return;

    const ref = collection(db, 'users', firebaseUser.uid, 'notifications');
    const q = query(ref, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setItems(docs);
    });

    return () => unsub();
  }, [firebaseUser]);

  const markAsRead = async (notificationId) => {
    if (!firebaseUser) return;

    try {
      await updateDoc(
        doc(db, 'users', firebaseUser.uid, 'notifications', notificationId),
        { read: true }
      );
    } catch (e) {
      // Error silencioso
    }
  };

  const markAllAsRead = async () => {
    if (!firebaseUser) return;

    const unreadNotifications = items.filter((n) => !n.read);

    if (unreadNotifications.length === 0) {
      showAlert('Notificaciones', 'No hay notificaciones sin leer.');
      return;
    }

    try {
      const batch = writeBatch(db);

      unreadNotifications.forEach((n) => {
        const notifRef = doc(db, 'users', firebaseUser.uid, 'notifications', n.id);
        batch.update(notifRef, { read: true });
      });

      await batch.commit();
      showAlert('Éxito', 'Todas las notificaciones han sido marcadas como leídas.');
    } catch (e) {
      showAlert('Error', 'No se pudieron marcar todas las notificaciones como leídas.');
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedIds([]);
  };

  const toggleSelectNotification = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((item) => item.id));
    }
  };

  const deleteSelected = async () => {
    if (!firebaseUser || selectedIds.length === 0) return;

    showAlert(
      'Confirmar eliminación',
      `¿Estás seguro de eliminar ${selectedIds.length} notificación${selectedIds.length > 1 ? 'es' : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              selectedIds.forEach((id) => {
                const notifRef = doc(db, 'users', firebaseUser.uid, 'notifications', id);
                batch.delete(notifRef);
              });

              await batch.commit();
              setSelectedIds([]);
              setSelectionMode(false);
              showAlert('Éxito', 'Notificaciones eliminadas correctamente.');
            } catch (e) {
              showAlert('Error', 'No se pudieron eliminar las notificaciones.');
            }
          },
        },
      ]
    );
  };

  const deleteAll = async () => {
    if (!firebaseUser || items.length === 0) return;

    showAlert(
      'Confirmar eliminación',
      '¿Estás seguro de eliminar TODAS las notificaciones? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todas',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              items.forEach((item) => {
                const notifRef = doc(db, 'users', firebaseUser.uid, 'notifications', item.id);
                batch.delete(notifRef);
              });

              await batch.commit();
              setSelectedIds([]);
              setSelectionMode(false);
              showAlert('Éxito', 'Todas las notificaciones han sido eliminadas.');
            } catch (e) {
              showAlert('Error', 'No se pudieron eliminar las notificaciones.');
            }
          },
        },
      ]
    );
  };

  const open = async (notif) => {
    // En modo selección, solo seleccionar
    if (selectionMode) {
      toggleSelectNotification(notif.id);
      return;
    }

    // Marcar como leída si no lo está
    if (!notif.read) {
      await markAsRead(notif.id);
    }

    const t = notif?.type;

    if (
      t === 'appointment-request' ||
      t === 'appointment-accepted' ||
      t === 'appointment-rejected' ||
      t === 'appointment-completed' ||
      t === 'appointment-cancelled' ||
      t === 'appointment-noshow'
    ) {
      // Navegar a la pestaña de citas con el appointmentId específico
      const appointmentId = notif?.data?.appointmentId;
      navigation.navigate('AppointmentsTab', {
        screen: 'AppointmentsMain',
        params: { highlightAppointmentId: appointmentId }
      });
    } else if (t === 'medical-record-submitted') {
      // Navegar a las notas del doctor para la cita
      const appointmentId = notif?.data?.appointmentId;
      const patientName = notif?.data?.patientName;

      try {
        const appointmentRef = doc(db, 'appointments', appointmentId);
        const appointmentSnap = await getDoc(appointmentRef);

        if (appointmentSnap.exists()) {
          const appointmentData = appointmentSnap.data();
          navigation.navigate('Home', {
            screen: 'DoctorNotes',
            params: {
              appointmentId: appointmentId,
              patientName: patientName || 'Paciente',
              appointmentDate: appointmentData.slotStart,
              reason: appointmentData.reason,
            },
          });
        }
      } catch {
        // Error silencioso
      }
    }
  };

  const renderItem = ({ item }) => {
    const dateText = item.createdAt?.toDate
      ? item.createdAt.toDate().toLocaleString()
      : '';

    const isUnread = !item.read;
    const isSelected = selectedIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[
          dynamicStyles.card,
          isUnread && dynamicStyles.cardUnread,
          isSelected && dynamicStyles.cardSelected
        ]}
        onPress={() => open(item)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([item.id]);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          {selectionMode && (
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => toggleSelectNotification(item.id)}
            >
              <View style={[dynamicStyles.checkboxInner, isSelected && styles.checkboxSelected]}>
                {isSelected && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.cardLeft}>
            <View style={styles.cardHeader}>
              {isUnread && !selectionMode && <View style={styles.badgeDot} />}
              <Text style={[dynamicStyles.head, isUnread && styles.headUnread]}>
                {item.title}
              </Text>
            </View>
            <Text style={[dynamicStyles.body, isUnread && styles.bodyUnread]}>
              {item.body}
            </Text>
            {dateText ? <Text style={dynamicStyles.date}>{dateText}</Text> : null}
          </View>

          {isUnread && !selectionMode && (
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={(e) => {
                e.stopPropagation();
                markAsRead(item.id);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={24} color="#2196F3" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const unreadCount = items.filter((n) => !n.read).length;

  const dynamicStyles = {
    screen: {
      ...styles.screen,
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
    headerSubtitle: {
      ...styles.headerSubtitle,
      color: colors.headerText,
    },
    content: {
      ...styles.content,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.textSecondary,
    },
    card: {
      ...styles.card,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    cardUnread: {
      ...styles.cardUnread,
      backgroundColor: colors.card,
      borderColor: '#2196F3',
    },
    head: {
      ...styles.head,
      color: colors.text,
    },
    body: {
      ...styles.body,
      color: colors.textSecondary,
    },
    date: {
      ...styles.date,
      color: colors.textLight,
    },
    checkboxInner: {
      ...styles.checkboxInner,
      backgroundColor: colors.card,
    },
    cardSelected: {
      ...styles.cardSelected,
      backgroundColor: colors.card,
      borderColor: colors.primary,
    },
  };

  return (
    <View style={dynamicStyles.screen}>
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={dynamicStyles.headerTitle}>
            {selectionMode ? `${selectedIds.length} seleccionada${selectedIds.length !== 1 ? 's' : ''}` : 'Notificaciones'}
          </Text>
          {!selectionMode && unreadCount > 0 && (
            <Text style={dynamicStyles.headerSubtitle}>{unreadCount} sin leer</Text>
          )}
        </View>

        {selectionMode ? (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn} onPress={selectAll}>
              <Ionicons name={selectedIds.length === items.length ? "checkbox" : "square-outline"} size={22} color={colors.headerIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, selectedIds.length === 0 && styles.headerBtnDisabled]}
              onPress={deleteSelected}
              disabled={selectedIds.length === 0}
            >
              <Ionicons
                name={selectedIds.length > 0 ? "trash" : "trash-outline"}
                size={22}
                color={selectedIds.length > 0 ? "#EF5350" : colors.icon}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={toggleSelectionMode}>
              <Ionicons name="close" size={24} color={colors.headerIcon} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerActions}>
            {items.length > 0 && unreadCount > 0 && (
              <TouchableOpacity style={styles.headerBtn} onPress={markAllAsRead}>
                <Ionicons name="checkmark-done" size={22} color={colors.headerIcon} />
              </TouchableOpacity>
            )}
            {items.length > 0 && (
              <>
                <TouchableOpacity style={styles.headerBtn} onPress={toggleSelectionMode}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.headerIcon} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerBtn} onPress={deleteAll}>
                  <Ionicons name="trash-outline" size={22} color={colors.headerIcon} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* CONTENIDO */}
      <View style={dynamicStyles.content}>
        {items.length === 0 && (
          <View style={styles.empty}>
            <Text style={dynamicStyles.emptyText}>Aún no tienes notificaciones.</Text>
          </View>
        )}

        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          style={styles.list}
          contentContainerStyle={
            items.length === 0
              ? { flexGrow: 1, paddingVertical: 16 }
              : { paddingBottom: 16 }
          }
        />
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
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

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
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E3F2FD',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnDisabled: {
    opacity: 0.5,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  markAllText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  list: {
    flex: 1,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ececef',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardUnread: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
    borderWidth: 1.5,
  },
  cardSelected: {
    borderWidth: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
    marginRight: 6,
  },
  head: {
    fontWeight: '700',
    fontSize: 16,
    color: '#111',
  },
  headUnread: {
    color: '#1976D2',
  },
  body: {
    color: '#555',
    fontSize: 14,
    marginBottom: 6,
  },
  bodyUnread: {
    color: '#424242',
    fontWeight: '500',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  markReadBtn: {
    padding: 8,
    marginLeft: 8,
  },
  checkbox: {
    marginRight: 12,
  },
  checkboxInner: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
});
