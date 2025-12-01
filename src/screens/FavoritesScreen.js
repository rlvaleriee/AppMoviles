import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getFavoriteDoctors, removeDoctorFromFavorites, listenToFavorites } from '../services/favoritesService';
import { UserAvatar } from '../components/UserAvatar';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function FavoritesScreen({ navigation }) {
  const { currentUserData } = useAuth();
  const { colors, darkMode } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFavorites();

    // Escuchar cambios en tiempo real
    const unsubscribe = listenToFavorites(currentUserData?.uid, () => {
      loadFavorites();
    });

    return () => unsubscribe && unsubscribe();
  }, [currentUserData?.uid]);

  const loadFavorites = async () => {
    try {
      if (!currentUserData?.uid) return;

      setLoading(true);
      const favDoctors = await getFavoriteDoctors(currentUserData.uid);
      setFavorites(favDoctors);
    } catch (error) {
      showAlert('Error', 'No se pudieron cargar los favoritos');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFavorites();
    setRefreshing(false);
  };

  const handleRemoveFavorite = (doctorId, doctorName) => {
    showAlert(
      'Quitar de favoritos',
      `¿Deseas quitar a ${doctorName} de tus favoritos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeDoctorFromFavorites(currentUserData.uid, doctorId);
              await loadFavorites();
            } catch (error) {
              showAlert('Error', 'No se pudo quitar de favoritos');
            }
          },
        },
      ]
    );
  };

  // Estilos dinámicos
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
    headerSubtitle: {
      ...styles.headerSubtitle,
      color: colors.headerText,
    },
    loadingText: {
      ...styles.loadingText,
      color: colors.textSecondary,
    },
    doctorCard: {
      ...styles.doctorCard,
      backgroundColor: colors.card,
    },
    doctorName: {
      ...styles.doctorName,
      color: colors.text,
    },
    doctorAddress: {
      ...styles.doctorAddress,
      color: colors.textSecondary,
    },
    emptyTitle: {
      ...styles.emptyTitle,
      color: colors.text,
    },
    emptySubtext: {
      ...styles.emptySubtext,
      color: colors.textSecondary,
    },
    removeButton: {
      ...styles.removeButton,
      backgroundColor: darkMode ? colors.inputBackground : '#E3F2FD',
      borderWidth: darkMode ? 1 : 0,
      borderColor: darkMode ? colors.border : 'transparent',
    },
    removeButtonText: {
      ...styles.removeButtonText,
      color: colors.primary || '#2196F3',
    },
    verifyChip: {
      ...styles.verifyChip,
      backgroundColor: colors.successBackground,
    },
    verifyChipText: {
      ...styles.verifyChipText,
      color: colors.success,
    },
    doctorSpecialty: {
      ...styles.doctorSpecialty,
      color: colors.primary,
    },
    emptyIconCircle: {
      ...styles.emptyIconCircle,
      backgroundColor: colors.inputBackground,
    },
    exploreButton: {
      ...styles.exploreButton,
      backgroundColor: colors.primary,
    },
  };

  const renderDoctorItem = ({ item }) => {
    const doctorName = `Dr. ${item.name} ${item.lastName || ''}`.trim();

    return (
      <View style={dynamicStyles.doctorCard}>
        <TouchableOpacity
          style={styles.doctorContent}
          onPress={() => navigation.navigate('DoctorDetail', { doctorId: item.id })}
          activeOpacity={0.8}
        >
          <UserAvatar
            userId={item.id}
            name={item.name}
            photoURL={item.photoURL}
            size={46}
            style={{ marginRight: 12 }}
          />
          <View style={styles.doctorInfo}>
            <View style={styles.doctorHeaderRow}>
              <Text style={dynamicStyles.doctorName} numberOfLines={1}>
                {doctorName}
              </Text>
              {item.verified && (
                <View style={dynamicStyles.verifyChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={dynamicStyles.verifyChipText}>Verificado</Text>
                </View>
              )}
            </View>
            <Text style={dynamicStyles.doctorSpecialty}>
              {item.cssp?.profession || item.specialty || 'Médico General'}
            </Text>
            {item.clinicAddress && (
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={dynamicStyles.doctorAddress} numberOfLines={1}>
                  {item.clinicAddress}
                </Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.chevron} />
        </TouchableOpacity>

        <TouchableOpacity
          style={dynamicStyles.removeButton}
          onPress={() => handleRemoveFavorite(item.id, doctorName)}
          activeOpacity={0.7}
        >
          <Ionicons name="heart-dislike" size={20} color={colors.primary || '#2196F3'} />
          <Text style={dynamicStyles.removeButtonText}>Quitar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={dynamicStyles.emptyIconCircle}>
        <Ionicons name="heart-outline" size={48} color={colors.primary} />
      </View>
      <Text style={dynamicStyles.emptyTitle}>No tienes médicos favoritos</Text>
      <Text style={dynamicStyles.emptySubtext}>
        Explora médicos y agrégalos a favoritos para acceder rápidamente a ellos.
      </Text>
      <TouchableOpacity
        style={dynamicStyles.exploreButton}
        onPress={() => navigation.navigate('Home', { screen: 'HomeMain' })}
      >
        <Ionicons name="search" size={18} color="#fff" />
        <Text style={styles.exploreButtonText}>Explorar médicos</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={styles.headerContent}>
          <Text style={dynamicStyles.headerTitle}>Mis Favoritos</Text>
          {favorites.length > 0 && (
            <Text style={dynamicStyles.headerSubtitle}>
              {favorites.length} {favorites.length === 1 ? 'médico' : 'médicos'}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={dynamicStyles.loadingText}>Cargando favoritos...</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderDoctorItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContainer,
            favorites.length === 0 && styles.listContainerEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={renderEmptyState}
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
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  listContainerEmpty: {
    flex: 1,
  },
  doctorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  doctorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  doctorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
  },
  doctorInfo: {
    flex: 1,
  },
  doctorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#263238',
    flex: 1,
  },
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  verifyChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 2,
  },
  doctorSpecialty: {
    fontSize: 13,
    color: '#1976D2',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doctorAddress: {
    fontSize: 12,
    color: '#607D8B',
    flex: 1,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eaecf5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#263238',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#607D8B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 280,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1072afff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    gap: 8,
    shadowColor: '#255dd4ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
