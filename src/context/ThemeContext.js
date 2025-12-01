import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(false);

  // Cargar preferencia de tema al iniciar
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('darkMode');
      if (savedTheme !== null) {
        setDarkMode(JSON.parse(savedTheme));
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const toggleDarkMode = async (value) => {
    try {
      setDarkMode(value);
      await AsyncStorage.setItem('darkMode', JSON.stringify(value));
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const colors = {
    // Fondos
    background: darkMode ? '#121212' : '#F8F9FA',
    card: darkMode ? '#1E1E1E' : '#FFFFFF',
    header: darkMode ? '#1E1E1E' : '#2196F3',
    cardElevated: darkMode ? '#252525' : '#FFFFFF',

    // Textos
    text: darkMode ? '#E0E0E0' : '#333333',
    textSecondary: darkMode ? '#9E9E9E' : '#777777',
    textLight: darkMode ? '#BDBDBD' : '#666666',
    headerText: darkMode ? '#FFFFFF' : '#FFFFFF',

    // Bordes y divisores
    border: darkMode ? '#2C2C2C' : '#E5E7EB',
    divider: darkMode ? '#2C2C2C' : '#F0F0F0',
    headerBorder: darkMode ? '#2C2C2C' : '#2196F3',

    // Iconos
    icon: darkMode ? '#9E9E9E' : '#999999',
    iconActive: darkMode ? '#64B5F6' : '#2196F3',
    headerIcon: darkMode ? '#E0E0E0' : '#FFFFFF',

    // Inputs
    inputBackground: darkMode ? '#252525' : '#FFFFFF',
    inputBorder: darkMode ? '#2C2C2C' : '#E5E7EB',
    inputText: darkMode ? '#E0E0E0' : '#333333',
    placeholder: darkMode ? '#757575' : '#999999',

    // Botones primarios
    primary: darkMode ? '#1E88E5' : '#2196F3',
    primaryText: '#FFFFFF',
    primaryDark: darkMode ? '#1565C0' : '#1976D2',

    // Estados especiales
    success: darkMode ? '#66BB6A' : '#4CAF50',
    error: darkMode ? '#EF5350' : '#E53935',
    warning: darkMode ? '#FFA726' : '#FF9800',
    danger: darkMode ? '#81C784' : '#2E7D32',

    // Colores de fondo para elementos específicos
    accentBackground: darkMode ? '#0D47A1' : '#E3F2FD',
    successBackground: darkMode ? '#1B5E20' : '#E8F5E9',
    warningBackground: darkMode ? '#E65100' : '#FFF3E0',
    dangerBackground: darkMode ? '#1B5E20' : '#E8F5E9',

    // Específicos
    chevron: darkMode ? '#757575' : '#999999',
    shadow: darkMode ? '#000000' : '#000000',

    // StatusBar (light-content = texto blanco, dark-content = texto oscuro)
    statusBarStyle: darkMode ? 'light-content' : 'dark-content',
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
