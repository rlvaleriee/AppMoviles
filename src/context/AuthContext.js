import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { saveUserProfile, getUserById } from '../services/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(false);   // para acciones (login/register/save)
  const [booting, setBooting] = useState(true);    // para el arranque de la sesión

  // Observa cambios de sesión y carga el perfil
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u || null);
      if (!u) {
        setCurrentUserData(null);
        setBooting(false);
        return;
      }
      // lee perfil desde Firestore
      const profile = await getUserById(u.uid);
      setCurrentUserData(profile || null);
      setBooting(false);
    });
    return () => unsub();
  }, []);

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
        role: 'patient', // default; si luego das de alta médicos, se cambia en perfil
      };
      await saveUserProfile(cred.user.uid, userDoc);

      // 4) Refresca en memoria
      setCurrentUserData({ id: cred.user.uid, ...userDoc });

      return { success: true, uid: cred.user.uid };
    } catch (e) {
      console.log('register error', e);
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
      console.log('login error', e);
      return { success: false, message: e?.message || 'No se pudo iniciar sesión' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = useMemo(
    () => ({
      // estado
      firebaseUser,
      currentUserData,
      loading,
      booting,
      // acciones
      register,
      login,
      logout,
    }),
    [firebaseUser, currentUserData, loading, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
