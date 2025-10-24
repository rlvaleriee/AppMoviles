import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { logout, currentUserData } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo cerrar sesión');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inicio</Text>

      {currentUserData?.name && (
        <Text style={styles.subtitle}>Hola, {currentUserData.name} 👋</Text>
      )}

      <TouchableOpacity
        style={styles.btn}
        onPress={() => navigation.navigate('AppointmentCreate')}
      >
        <Text style={styles.btnText}>Nueva cita</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnLogout]} onPress={handleLogout}>
        <Text style={styles.btnText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
  },
  btn: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 10,
  },
  btnLogout: {
    backgroundColor: '#f44336',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
  },
});
