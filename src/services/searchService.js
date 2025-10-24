import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { callable, db } from '../firebase';
import { distanceKm } from '../utils/geo';

/** Opción A: usar Cloud Function (recomendado en producción) */
export async function searchNearbyDoctorsCF({ lat, lng, specialty, radiusKm = 20, limitN = 20 }) {
  // Cloud Function debe retornar [{ doctorId, name, specialties, location:{latitude,longitude}, ratingAvg }]
  const resp = await callable.nearbyDoctors({ lat, lng, specialty: specialty || null, radiusKm, limitN });
  return resp?.data || [];
}

/** Opción B: client-side (simple, sin geohash bounds) */
export function subscribeDoctorsClient({ myPos, specialty, cb, limitN = 50 }) {
  const base = collection(db, 'doctor_search');
  const q = specialty
    ? query(base, where('specialties', 'array-contains', specialty), limit(limitN))
    : query(base, limit(limitN));

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const arr = items
      .filter((d) => d.acceptsNewPatients !== false)
      .map((d) => {
        const gp = d.location;
        const km =
          gp && myPos
            ? distanceKm(myPos.lat, myPos.lng, gp.latitude, gp.longitude)
            : null;
        return { ...d, distanceKm: km };
      })
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    cb(arr);
  });
}
