import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function SettingsScreen({ navigation }) {
  const { logout, currentUserData } = useAuth();
  const isPatient = currentUserData?.role === 'patient';
  const { darkMode, toggleDarkMode, colors } = useTheme();
  const { alertConfig, showAlert, hideAlert } = useCustomAlert();

  const goToEditProfile = () => {
    navigation.navigate('Profile');
  };

  const goToSecurity = () => {
    navigation.navigate('Security');
  };

  const goToTerms = () => {
    navigation.navigate('Terms');
  };

  const goToPrivacyPolicy = () => {
    navigation.navigate('PrivacyPolicy');
  };

  const goToHelpCenter = () => {
    navigation.navigate('HelpCenter');
  };

  const goToMedicalProfile = () => {
    navigation.navigate('MedicalProfile');
  };

  const handleLogout = () => {
    showAlert('Cerrar sesión', '¿Estás seguro que deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (e) {
            showAlert('Error', e?.message || 'No se pudo cerrar sesión');
          }
        },
      },
    ]);
  };

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
    item: {
      ...styles.item,
      backgroundColor: colors.card,
    },
    itemText: {
      ...styles.itemText,
      color: colors.text,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.textSecondary,
    },
  };

  return (
    <View style={dynamicStyles.screen}>
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <View style={styles.headerLeft}>
          <Text style={dynamicStyles.headerTitle}>Configuración</Text>
        </View>
      </View>

      {/* CONTENIDO */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {/* Sección: Cuenta */}
        <Text style={dynamicStyles.sectionTitle}>Cuenta</Text>

        <TouchableOpacity
          style={dynamicStyles.item}
          onPress={goToEditProfile}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <Ionicons name="person-circle-outline" size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Editar perfil</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
        </TouchableOpacity>

        <TouchableOpacity
          style={dynamicStyles.item}
          onPress={goToSecurity}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Seguridad</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
        </TouchableOpacity>

        {/* Perfil Médico - Solo para pacientes */}
        {isPatient && (
          <TouchableOpacity
            style={dynamicStyles.item}
            onPress={goToMedicalProfile}
            activeOpacity={0.7}
          >
            <View style={styles.itemLeft}>
              <Ionicons name="medkit-outline" size={24} color="#2196F3" />
              <Text style={dynamicStyles.itemText}>Mi perfil médico</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
          </TouchableOpacity>
        )}

        {/* Sección: Apariencia */}
        <Text style={dynamicStyles.sectionTitle}>Apariencia</Text>

        <View style={dynamicStyles.item}>
          <View style={styles.itemLeft}>
            <Ionicons name={darkMode ? "moon" : "moon-outline"} size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Modo oscuro</Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={toggleDarkMode}
            trackColor={{ false: '#D1D5DB', true: '#64ebb6' }}
            thumbColor={darkMode ? '#2E7D32' : '#f4f3f4'}
            ios_backgroundColor="#D1D5DB"
          />
        </View>

        {/* Sección: Legal */}
        <Text style={dynamicStyles.sectionTitle}>Legal</Text>

        <TouchableOpacity
          style={dynamicStyles.item}
          onPress={goToTerms}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <Ionicons name="document-text-outline" size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Términos de uso</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
        </TouchableOpacity>

        <TouchableOpacity
          style={dynamicStyles.item}
          onPress={goToPrivacyPolicy}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <Ionicons name="lock-closed-outline" size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Política de privacidad</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
        </TouchableOpacity>

        {/* Sección: Ayuda */}
        <Text style={dynamicStyles.sectionTitle}>Ayuda</Text>

        <TouchableOpacity
          style={dynamicStyles.item}
          onPress={goToHelpCenter}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <Ionicons name="help-circle-outline" size={24} color="#2196F3" />
            <Text style={dynamicStyles.itemText}>Centro de ayuda</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.chevron} />
        </TouchableOpacity>

        {/* Botón de cerrar sesión */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
    justifyContent: 'flex-start',
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
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  scroll: {
    flex: 1,
  },
  container: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#777',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  item: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  footer: {
    marginTop: 24,
  },
  logoutButton: {
    backgroundColor: '#E53935',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
