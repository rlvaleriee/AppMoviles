import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import { auth, db } from '../firebase';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { saveUserProfile, getUserById } from '../services/firestore';
import { createUserNotification } from '../services/notificationsService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [loadingUserData, setLoadingUserData] = useState(false);    

  // Observa cambios de sesión y carga el perfil
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u || null);
      if (!u) {
        setCurrentUserData(null);
        setLoadingUserData(false);
        setBooting(false);
        return;
      }

      // Marcar que estamos cargando datos del usuario
      setLoadingUserData(true);

      try {
        // lee perfil desde Firestore con reintentos para usuarios recién creados
        let profile = null;
        let retries = 0;
        const maxRetries = 3;

        while (!profile && retries < maxRetries) {
          profile = await getUserById(u.uid);

          if (!profile && retries < maxRetries - 1) {
            // Esperar un poco antes de reintentar (importante para usuarios recién registrados)
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
          } else {
            break;
          }
        }

        setCurrentUserData(profile || null);
      } catch (error) {
        setCurrentUserData(null);
      } finally {
        setLoadingUserData(false);
        setBooting(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    // Registrar notificaciones / FCM para este usuario
    registerForPushNotificationsAsync(firebaseUser.uid).catch(() => {});
  }, [firebaseUser]);

  // Listener en tiempo real para detectar cambios en el documento del usuario
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    const userDocRef = doc(db, 'users', firebaseUser.uid);

    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const newData = { id: docSnapshot.id, ...docSnapshot.data() };

        // PRIMERO: Verificar si es doctor rechazado (bloquear inmediatamente)
        if (newData.role === 'doctor' && newData.rejected === true) {
          const wasAlreadyRejected = currentUserData?.rejected === true;
          const reason = newData.rejectionReason || '';

          // Mensaje diferente si es cambio en tiempo real vs relogin
          const title = wasAlreadyRejected ? '⚠️ Cuenta no disponible' : '❌ Verificación Rechazada';
          const message = reason
            ? `${wasAlreadyRejected ? 'Tu cuenta fue rechazada.' : 'Tu solicitud de verificación no ha sido aprobada.'}\n\nRazón: ${reason}\n\nSi crees que esto es un error, puedes apelar contactando a soporte: mediconnectsv@outlook.com`
            : `${wasAlreadyRejected ? 'Tu cuenta fue rechazada.' : 'Tu solicitud de verificación no ha sido aprobada.'}\n\nSi crees que esto es un error, puedes apelar contactando a soporte: mediconnectsv@outlook.com`;

          Alert.alert(
            title,
            message,
            [
              {
                text: 'Entendido',
                onPress: async () => {
                  try {
                    await signOut(auth);
                  } catch (e) {
                    // Error silencioso
                  }
                },
              },
            ],
            { cancelable: false }
          );
          return; // No actualizar datos, se cerrará la sesión
        }

        // Verificar si el estado de verificación cambió de false a true
        if (
          currentUserData?.role === 'doctor' &&
          currentUserData?.verified === false &&
          newData.verified === true
        ) {
          // El doctor fue verificado
          createUserNotification(firebaseUser.uid, {
            title: '🎉 ¡Cuenta Verificada!',
            body: 'Tu cuenta ha sido verificada exitosamente. Ahora puedes acceder a todas las funcionalidades de la aplicación.',
            type: 'account_verified',
            data: { verified: true },
          }).catch(() => {});

          // Mostrar alerta
          Alert.alert(
            '🎉 ¡Cuenta Verificada!',
            'Tu cuenta ha sido aprobada. Ahora tienes acceso completo a todas las funcionalidades de la aplicación.',
            [{ text: 'Genial' }]
          );
        }

        // Actualizar datos del usuario
        setCurrentUserData(newData);
      }
    }, () => {
      // Error silencioso en listener
    });

    return () => unsubscribe();
  }, [firebaseUser?.uid]);


  // Registro: crea usuario en Auth y guarda perfil en Firestore
  const register = async (name, email, password, phone) => {
    try {
      setLoading(true);

      // 1) Crea la cuenta en Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2) Asigna displayName opcional
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      // 3) Guarda el perfil en Firestore
      const userDoc = {
        name,
        email,
        phone,
        role: 'patient', 
      };
      await saveUserProfile(cred.user.uid, userDoc);

      // 4) Refresca en memoria
      setCurrentUserData({ id: cred.user.uid, ...userDoc });

      return { success: true, uid: cred.user.uid };
    } catch (e) {
      return { success: false, message: e?.message || 'No se pudo crear la cuenta' };
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        message: e?.message || 'No se pudo iniciar sesión',
        error: e
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  // Función para refrescar los datos del usuario actual
  const refreshUserData = async () => {
    if (!firebaseUser?.uid) return;

    try {
      const profile = await getUserById(firebaseUser.uid);
      setCurrentUserData(profile || null);
    } catch (error) {
      // Error silencioso
    }
  };

  const value = useMemo(
    () => ({
      // estado
      firebaseUser,
      currentUserData,
      loading,
      booting,
      loadingUserData,
      // acciones
      register,
      login,
      logout,
      refreshUserData,
    }),
    [firebaseUser, currentUserData, loading, booting, loadingUserData]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
