import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

export async function updateUser(uid, updates) {
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserLocation(uid, geoPointLike) {
  // geoPointLike: { latitude, longitude }
  await updateDoc(doc(db, 'users', uid), {
    location: { latitude: geoPointLike.latitude, longitude: geoPointLike.longitude },
    updatedAt: serverTimestamp(),
  });
  // Sugerido: Cloud Function onWrite a users/{uid} recalcula geohash y proyección doctor_search
}
