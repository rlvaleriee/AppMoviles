import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StatusBar, Platform, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import { setupNotifications } from './src/utils/pushNotifications';

function ThemedStatusBar() {
  const { colors } = useTheme();

  return (
    <StatusBar
      barStyle={colors.statusBarStyle}
      backgroundColor={colors.header}
      translucent={false}
    />
  );
}

function AppRouter() {
  const { firebaseUser, booting } = useAuth();

  // Solo mostrar loading durante el booting inicial
  // Esto reduce significativamente el tiempo de pantalla en blanco
  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return firebaseUser ? <MainNavigator /> : <AuthNavigator />;
}

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    // Configurar notificaciones al inicio de la app
    setupNotifications().catch(err => {
      console.log('Error en setupNotifications:', err);
    });
  }, []);

  // Configuración de deep linking
  const linking = {
    prefixes: ['appcitas://', 'https://app-citas-2c83a.firebaseapp.com'],
    config: {
      screens: {
        ResetPassword: {
          path: 'ResetPassword',
          parse: {
            oobCode: (oobCode) => oobCode,
          },
        },
        Welcome: 'Welcome',
        Login: 'Login',
        Register: 'Register',
        ForgotPassword: 'ForgotPassword',
      },
    },
    async getInitialURL() {
      // Verificar si la app se abrió desde un enlace profundo
      const url = await Linking.getInitialURL();
      if (url) {
        return handleAuthLink(url);
      }
      return null;
    },
    subscribe(listener) {
      // Escuchar enlaces mientras la app está abierta
      const onReceiveURL = ({ url }) => {
        const processedUrl = handleAuthLink(url);
        if (processedUrl) {
          listener(processedUrl);
        }
      };

      const subscription = Linking.addEventListener('url', onReceiveURL);

      return () => {
        subscription.remove();
      };
    },
  };

  // Función para procesar enlaces de Firebase Auth
  const handleAuthLink = (url) => {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const mode = urlObj.searchParams.get('mode');
      const oobCode = urlObj.searchParams.get('oobCode');

      console.log('Deep link recibido:', { url, mode, oobCode });

      // Si es un enlace de restablecimiento de contraseña
      if (mode === 'resetPassword' && oobCode) {
        // Construir URL interna para navegar a ResetPasswordScreen
        return `appcitas://ResetPassword?oobCode=${oobCode}`;
      }

      // Otros modos de Firebase Auth que podrías manejar:
      // - verifyEmail: para verificar correo electrónico
      // - recoverEmail: para recuperar correo electrónico
    } catch (error) {
      console.log('Error procesando deep link:', error);
    }

    return null;
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <AuthProvider>
          <NavigationContainer ref={navigationRef} linking={linking}>
            <AppRouter />
          </NavigationContainer>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}