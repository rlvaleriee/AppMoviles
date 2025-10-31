import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth, 
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'XXXXXXXXXXXXXXXXXXXXXX',
  authDomain: 'XXXXXXXXXXX',
  projectId: 'XXXXXXXXXXX',
  storageBucket: 'XXXXXXXXXXXX',
  messagingSenderId: 'XXXXXXXXXXX',
  appId: 'XXXXXXXXXXXX',
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
