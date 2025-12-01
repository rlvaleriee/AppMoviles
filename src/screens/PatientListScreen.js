import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { getUserById } from '../services/firestore';
import { UserAvatar } from '../components/UserAvatar';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function PatientListScreen({ navigation }) {
  const { currentUserData } = useAuth();
  const { colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);

      if (!currentUserData?.uid) {
        showAlert('Error', 'No se pudo obtener la información del usuario');
        return;
      }

      // Obtener todas las citas completadas del doctor
      const appointmentsRef = collection(db, 'appointments');
      const q = query(
        appointmentsRef,
        where('doctorId', '==', currentUserData.uid),
        where('status', '==', 'completed'),
        orderBy('slotStart', 'desc')
      );
      const snapshot = await getDocs(q);

      const uniquePatients = [];
      const seenIds = new Set();

      for (const docSnap of snapshot.docs) {
        const appointment = docSnap.data();
        if (appointment.patientId && !seenIds.has(appointment.patientId)) {
          seenIds.add(appointment.patientId);

          // Obtener información del paciente
          const patientData = await getUserById(appointment.patientId);
          const patientName = patientData
            ? `${patientData.name || ''} ${patientData.lastName || ''}`.trim()
            : 'Paciente';

          // Contar citas completadas con este paciente
          const appointmentsCount = snapshot.docs.filter(
            (d) => d.data().patientId === appointment.patientId
          ).length;

          uniquePatients.push({
            id: appointment.patientId,
            name: patientName || 'Paciente',
            email: patientData?.email || '',
            phone: patientData?.phone || '',
            photoURL: patientData?.photoURL || null,
            appointmentsCount,
          });
        }
      }

      // Ordenar alfabéticamente
      uniquePatients.sort((a, b) => a.name.localeCompare(b.name));

      setPatients(uniquePatients);
    } catch (error) {
      showAlert('Error', 'No se pudo cargar la lista de pacientes');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    searchContainer: {
      ...styles.searchContainer,
      backgroundColor: colors.card,
      borderBottomColor: colors.border,
    },
    searchBar: {
      ...styles.searchBar,
      backgroundColor: colors.inputBackground,
    },
    searchInput: {
      ...styles.searchInput,
      color: colors.inputText,
    },
    resultCount: {
      ...styles.resultCount,
      color: colors.textSecondary,
    },
    loadingText: {
      ...styles.loadingText,
      color: colors.textSecondary,
    },
    patientCard: {
      ...styles.patientCard,
      backgroundColor: colors.card,
    },
    patientName: {
      ...styles.patientName,
      color: colors.text,
    },
    patientDetail: {
      ...styles.patientDetail,
      color: colors.textSecondary,
    },
    emptyTitle: {
      ...styles.emptyTitle,
      color: colors.text,
    },
    emptyText: {
      ...styles.emptyText,
      color: colors.textSecondary,
    },
  };

  const renderPatient = ({ item }) => (
    <TouchableOpacity
      style={dynamicStyles.patientCard}
      onPress={() =>
        navigation.navigate('PatientNotesHistory', {
          patientId: item.id,
          patientName: item.name,
        })
      }
      activeOpacity={0.7}
    >
      <UserAvatar
        userId={item.id}
        name={item.name}
        photoURL={item.photoURL}
        size={50}
        style={{ marginRight: 16 }}
      />
      <View style={styles.patientInfo}>
        <Text style={dynamicStyles.patientName}>{item.name}</Text>
        <View style={styles.patientMetaRow}>
          <Ionicons name="document-text-outline" size={14} color={colors.primary} />
          <Text style={[dynamicStyles.patientDetail, { color: colors.primary }]}>
            {item.appointmentsCount} {item.appointmentsCount === 1 ? 'consulta' : 'consultas'}
          </Text>
        </View>
        {item.phone && (
          <Text style={dynamicStyles.patientDetail}>
            <Ionicons name="call-outline" size={14} color="#666" /> {item.phone}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.chevron} />
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color="#ccc" />
      <Text style={dynamicStyles.emptyTitle}>
        {searchQuery ? 'No se encontraron pacientes' : 'Sin consultas completadas'}
      </Text>
      <Text style={dynamicStyles.emptyText}>
        {searchQuery
          ? 'Intenta con otro término de búsqueda'
          : 'Aquí aparecerán los pacientes con los que hayas completado consultas'}
      </Text>
    </View>
  );

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Pacientes</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Barra de búsqueda */}
      <View style={dynamicStyles.searchContainer}>
        <View style={dynamicStyles.searchBar}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Buscar por nombre..."
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={dynamicStyles.resultCount}>
          {filteredPatients.length} {filteredPatients.length === 1 ? 'paciente' : 'pacientes'}
        </Text>
      </View>

      {/* Lista de pacientes */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={dynamicStyles.loadingText}>Cargando pacientes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPatients}
          renderItem={renderPatient}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
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
  container: {
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  resultCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  listContent: {
    padding: 20,
    flexGrow: 1,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  patientInfo: {
    flex: 1,
  },
  patientMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  patientDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
});
