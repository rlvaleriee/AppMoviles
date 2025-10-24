import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export async function registerUser(payload) {
  const { email, password, name, phone, role, address, specialty, clinicAddress } = payload;

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  await updateProfile(cred.user, { displayName: name });

  const userDoc = {
    role,
    name,
    email,
    phone: phone || null,
    address: role === 'patient' ? (address || null) : null,
    specialty: role === 'doctor' ? (specialty || null) : null,
    clinicAddress: role === 'doctor' ? (clinicAddress || null) : null,
    photoURL: cred.user.photoURL || null,
    location: null,      // se establecerá luego
    geohash: null,       // la calculará una Function al guardar location
    acceptsNewPatients: role === 'doctor' ? true : null,
    ratingAvg: role === 'doctor' ? 0 : null,
    ratingCount: role === 'doctor' ? 0 : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', uid), userDoc, { merge: true });
  return { uid };
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, 'users', cred.user.uid));
  return { uid: cred.user.uid, profile: snap.exists() ? snap.data() : null };
}

export async function logoutUser() {
  await signOut(auth);
}
