import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth, 
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAm7rudkR1PSwHNUav9G7gW8wtuVXnJNzo',
  authDomain: 'app-citas-2c83a.firebaseapp.com',
  projectId: 'app-citas-2c83a',
  storageBucket: 'app-citas-2c83a.firebasestorage.app',
  messagingSenderId: '176981257185',
  appId: '1:176981257185:web:2a54bcbf33c669c08e40a0',
};

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
