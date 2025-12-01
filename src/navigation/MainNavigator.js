import React from 'react';
import { Text, View, Platform, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DoctorDetailScreen from '../screens/DoctorDetailScreen';
import DoctorCalendarScreen from '../screens/DoctorCalendarScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import SecurityScreen from '../screens/SecurityScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import HelpCenterScreen from '../screens/HelpCenterScreen';
import PatientListScreen from '../screens/PatientListScreen';
import MedicalProfileScreen from '../screens/MedicalProfileScreen';
import DoctorNotesScreen from '../screens/DoctorNotesScreen';
import PatientNotesHistoryScreen from '../screens/PatientNotesHistoryScreen';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator initialRouteName="HomeMain" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="DoctorDetail" component={DoctorDetailScreen} />
      <Stack.Screen name="Appointments" component={AppointmentsScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="PatientList" component={PatientListScreen} />
      <Stack.Screen name="PatientNotesHistory" component={PatientNotesHistoryScreen} />
      <Stack.Screen name="NotificationsTab" component={NotificationsScreen} />
      <Stack.Screen name="MedicalProfile" component={MedicalProfileScreen} />
      <Stack.Screen name="DoctorNotes" component={DoctorNotesScreen} />
    </Stack.Navigator>
  );
}

function AppointmentsStack() {
  return (
    <Stack.Navigator initialRouteName="AppointmentsMain" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AppointmentsMain" component={AppointmentsScreen} />
      <Stack.Screen name="MedicalProfile" component={MedicalProfileScreen} />
      <Stack.Screen name="DoctorNotes" component={DoctorNotesScreen} />
    </Stack.Navigator>
  );
}

function FavoritesStack() {
  return (
    <Stack.Navigator initialRouteName="FavoritesMain" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FavoritesMain" component={FavoritesScreen} />
      <Stack.Screen name="DoctorDetail" component={DoctorDetailScreen} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator initialRouteName="SettingsMain" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Security" component={SecurityScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <Stack.Screen name="MedicalProfile" component={MedicalProfileScreen} />
    </Stack.Navigator>
  );
}

// Icono de campana con badge rojo elegante
function BellIcon({ unread, focused, activeColor, inactiveColor }) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={24}
        color={focused ? activeColor : inactiveColor}
      />

      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            right: -8,
            top: -4,
            backgroundColor: '#FF3B30',
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowOffset: { width: 0, height: 1 },
            shadowRadius: 2,
            elevation: 3,
          }}>
          <Text
            style={{
              color: '#fff',
              fontSize: 11,
              fontWeight: '700',
            }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function MainNavigator() {
  const { currentUserData } = useAuth();
  const { colors, darkMode } = useTheme();

  // Asegurarse de que currentUserData esté cargado antes de determinar el role
  // Si no hay currentUserData, usar 'patient' como fallback para evitar pantalla en blanco
  const role = currentUserData?.role || 'patient';
  const appointmentsLabel = role === 'doctor' ? 'Solicitudes' : 'Citas';
  const isPatientOrAdmin = role === 'patient' || role === 'admin';

  const uid = currentUserData?.uid;
  const unread = useUnreadNotifications(uid);
  const insets = useSafeAreaInsets();

  // No mostrar loading aquí - el loading se maneja en App.js
  // Esto evita pantallas en blanco innecesarias

  return (
    <Tab.Navigator
      initialRouteName="Home"
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: darkMode ? '#999' : '#999',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 5) : insets.bottom + 5,
          paddingTop: 5,
          height: Platform.OS === 'android' ? 60 + Math.max(insets.bottom, 0) : 60 + insets.bottom,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
      }}>

      {/* 1. Inicio */}
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* 2. Citas / Solicitudes */}
      <Tab.Screen
        name="AppointmentsTab"
        component={AppointmentsStack}
        options={{
          tabBarLabel: appointmentsLabel,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* 3. Favoritos (solo para paciente/admin) */}
      {isPatientOrAdmin && (
        <Tab.Screen
          name="FavoritesTab"
          component={FavoritesStack}
          options={{
            tabBarLabel: 'Favoritos',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? 'heart' : 'heart-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
      )}

      {/* 4. Paciente/Admin: Chat | Doctor: Calendario */}
      {isPatientOrAdmin ? (
        <Tab.Screen
          key="ChatbotTab"
          name="ChatbotTab"
          component={ChatbotScreen}
          options={{
            tabBarLabel: 'Chat',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={24}
                color={color}
              />
            ),
            unmountOnBlur: true,
          }}
        />
      ) : (
        <Tab.Screen
          key="DoctorCalendarTab"
          name="DoctorCalendarTab"
          component={DoctorCalendarScreen}
          options={{
            tabBarLabel: 'Calendario',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? 'calendar-number' : 'calendar-number-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
      )}

      {/* 5. Configuración */}
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          tabBarLabel: 'Configuración',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
