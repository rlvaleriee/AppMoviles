import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

import HomeScreen from '../screens/HomeScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DoctorDetailScreen from '../screens/DoctorDetailScreen';
import DoctorCalendarScreen from '../screens/DoctorCalendarScreen'; 

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
    </Stack.Navigator>
  );
}

export default function MainNavigator() {
  const { currentUserData } = useAuth();
  const role = currentUserData?.role ?? 'patient'; // 'doctor' | 'patient'
  const appointmentsLabel = role === 'doctor' ? 'Solicitudes' : 'Citas';

  return (
    <Tab.Navigator
      initialRouteName="Home"
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: '#999',
        tabBarHideOnKeyboard: true,
        tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: 60 },
      }}
    >
      {/* 1. Inicio */}
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>🏠</Text>,
        }}
      />

      {/* 2. Citas / Solicitudes */}
      <Tab.Screen
        name="AppointmentsTab"
        component={AppointmentsScreen}
        options={{
          tabBarLabel: appointmentsLabel,
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>📅</Text>,
        }}
      />

      {/* 3. Paciente: Chat | Doctor: Calendario */}
      {role === 'patient' ? (
        <Tab.Screen
          key="ChatbotTab"
          name="ChatbotTab"
          component={ChatbotScreen}
          options={{
            tabBarLabel: 'Chat',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>💬</Text>,
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
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>🗓️</Text>,
          }}
        />
      )}

      {/* 4. Perfil */}
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>👤</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
