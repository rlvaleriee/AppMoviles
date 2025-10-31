import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit,
} from 'firebase/firestore';
import { db } from '../firebase/index';
import { distanceKm, getBoundingBox } from '../utils/geo';

/** Normaliza center a { lat, lng } admitiendo varias formas comunes */
function normalizeCenter(c) {
  if (!c || typeof c !== 'object') return null;

  // 1) { lat, lng }
  if (typeof c.lat === 'number' && typeof c.lng === 'number') {
    return { lat: c.lat, lng: c.lng };
  }

  // 2) { latitude, longitude }
  if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
    return { lat: c.latitude, lng: c.longitude };
  }

  // 3) { coords: { latitude, longitude } } (Expo Location)
  const coords = c.coords;
  if (
    coords &&
    typeof coords === 'object' &&
    typeof coords.latitude === 'number' &&
    typeof coords.longitude === 'number'
  ) {
    return { lat: coords.latitude, lng: coords.longitude };
  }

  // 4) strings numéricos
  const toNum = (v) => (typeof v === 'string' ? Number(v) : v);
  if (
    (typeof c.lat === 'string' || typeof c.lng === 'string') &&
    !Number.isNaN(toNum(c.lat)) &&
    !Number.isNaN(toNum(c.lng))
  ) {
    return { lat: Number(c.lat), lng: Number(c.lng) };
  }
  if (
    (typeof c.latitude === 'string' || typeof c.longitude === 'string') &&
    !Number.isNaN(toNum(c.latitude)) &&
    !Number.isNaN(toNum(c.longitude))
  ) {
    return { lat: Number(c.latitude), lng: Number(c.longitude) };
  }

  return null;
}

/** Mapea doc y calcula distancia (km) respecto a center */
function mapDocWithDistance(docSnap, center) {
  const data = docSnap.data();
  const lat = data?.location?.latitude;
  const lon = data?.location?.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const km = distanceKm(center.lat, center.lng, lat, lon);

  return {
    id: docSnap.id,
    ...data,
    name: data?.name || data?.displayName || 'Profesional de salud',
    specialty: data?.specialty || data?.cssp?.profession || 'Salud',
    distanceKm: km,
    distance: Number(km.toFixed(1)),
  };
}

function parseNearbyArgs(args) {
  if (args.length >= 1 && (typeof args[0] === 'object') && !('center' in args[0])) {
    const [centerRaw, radiusKm = 50, limit = 50, verifiedOnly = true, collectionName = 'users'] = args;
    const center = normalizeCenter(centerRaw);
    return { center, radiusKm, limit, verifiedOnly, collectionName };
  }

  const [opts = {}] = args;
  const center = normalizeCenter(opts.center);
  const radiusKm = typeof opts.radiusKm === 'number' ? opts.radiusKm : 50;
  const limit = typeof opts.limit === 'number' ? opts.limit : 50;
  const verifiedOnly = typeof opts.verifiedOnly === 'boolean' ? opts.verifiedOnly : true;
  const collectionName = opts.collectionName || 'users';
  return { center, radiusKm, limit, verifiedOnly, collectionName };
}

/**
 * Obtiene doctores cercanos, ordenados por distancia ascendente.
 *
 * Firmas válidas:
 * - getNearbyDoctors({ center, radiusKm=50, limit=50, verifiedOnly=true, collectionName='users' })
 * - getNearbyDoctors(center, radiusKm=50, limit=50, verifiedOnly=true, collectionName='users')
 *
 * @returns {Promise<Array>}
 */
export async function getNearbyDoctors(...args) {
  const { center, radiusKm, limit, verifiedOnly, collectionName } = parseNearbyArgs(args);

  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
    throw new Error('center { lat, lng } es obligatorio y numérico.');
  }
  if (radiusKm <= 0) return [];

  const bbox = getBoundingBox(center.lat, center.lng, radiusKm);
  const base = collection(db, collectionName);
  const HARD_CAP = Math.max(limit * 5, 100);

  const wheres = [
    where('role', '==', 'doctor'),
    where('location.latitude', '>=', bbox.minLat),
    where('location.latitude', '<=', bbox.maxLat),
  ];
  if (verifiedOnly) wheres.unshift(where('verified', '==', true));

  try {
    const q = query(
      base,
      ...wheres,
      orderBy('location.latitude', 'asc'),
      fbLimit(HARD_CAP)
    );
    const snap = await getDocs(q);

    const items = [];
    snap.forEach((docSnap) => {
      const d = mapDocWithDistance(docSnap, center);
      if (!d) return;

      const lon = d.location?.longitude;
      if (typeof lon !== 'number') return;

      if (lon < bbox.minLon || lon > bbox.maxLon) return;

      if (d.distanceKm <= radiusKm) items.push(d);
    });

    items.sort((a, b) => a.distanceKm - b.distanceKm);
    return items.slice(0, limit);
  } catch (err) {
    if (String(err?.code) !== 'failed-precondition') {
      throw err;
    }

    const qFallback = query(
      base,
      where('location.latitude', '>=', bbox.minLat),
      where('location.latitude', '<=', bbox.maxLat),
      orderBy('location.latitude', 'asc'),
      fbLimit(HARD_CAP + 100)
    );

    const snap = await getDocs(qFallback);

    const items = [];
    snap.forEach((docSnap) => {
      const d = mapDocWithDistance(docSnap, center);
      if (!d) return;

      if (verifiedOnly && d.verified !== true) return;
      if (d.role !== 'doctor') return;

      const lon = d.location?.longitude;
      if (typeof lon !== 'number') return;

      if (lon < bbox.minLon || lon > bbox.maxLon) return;
      if (d.distanceKm <= radiusKm) items.push(d);
    });

    items.sort((a, b) => a.distanceKm - b.distanceKm);
    return items.slice(0, limit);
  }
}

export async function getNearbyDoctorsByProfession(...args) {
  let centerRaw, profession, radiusKm = 50, limit = 50, verifiedOnly = true, forceClientFilter = false, collectionName = 'users';

  if (args.length && typeof args[0] === 'object' && 'center' in args[0]) {
    const o = args[0] || {};
    centerRaw = o.center;
    profession = o.profession;
    radiusKm = o.radiusKm ?? 50;
    limit = o.limit ?? 50;
    verifiedOnly = o.verifiedOnly ?? true;
    forceClientFilter = o.forceClientFilter ?? false;
    collectionName = o.collectionName || 'users';
  } else {
    [centerRaw, profession, radiusKm = 50, limit = 50, verifiedOnly = true, forceClientFilter = false, collectionName = 'users'] = args;
  }

  if (!profession || typeof profession !== 'string') {
    throw new Error('profession (string) es obligatorio.');
  }

  const center = normalizeCenter(centerRaw);
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
    throw new Error('center { lat, lng } es obligatorio y numérico.');
  }
  if (radiusKm <= 0) return [];

  const bbox = getBoundingBox(center.lat, center.lng, radiusKm);
  const base = collection(db, collectionName);
  const HARD_CAP = Math.max(limit * 5, 120);

  const whereLatRange = [
    where('location.latitude', '>=', bbox.minLat),
    where('location.latitude', '<=', bbox.maxLat),
  ];

  let snap = null;

  if (!forceClientFilter) {
    const wheres = [
      where('role', '==', 'doctor'),
      where('cssp.profession', '==', profession),
      ...whereLatRange,
    ];
    if (verifiedOnly) wheres.unshift(where('verified', '==', true));

    try {
      const q = query(
        base,
        ...wheres,
        orderBy('location.latitude', 'asc'),
        fbLimit(HARD_CAP)
      );
      snap = await getDocs(q);
    } catch (err) {
      snap = null;
    }
  }

  if (!snap) {
    const q = query(
      base,
      ...whereLatRange,
      orderBy('location.latitude', 'asc'),
      fbLimit(HARD_CAP + 100)
    );
    snap = await getDocs(q);
  }

  const norm = (s) =>
    String(s || '')
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

  const target = norm(profession);

  const items = [];
  snap.forEach((docSnap) => {
    const d = mapDocWithDistance(docSnap, center);
    if (!d) return;

    if (verifiedOnly && d.verified !== true) return;
    if (d.role !== 'doctor') return;

    const lon = d.location?.longitude;
    if (typeof lon !== 'number') return;

    if (lon < bbox.minLon || lon > bbox.maxLon) return;
    if (d.distanceKm > radiusKm) return;

    const prof = d?.cssp?.profession || d?.specialty;
    if (!prof) return;

    if (norm(prof) !== target) return;

    items.push(d);
  });

  items.sort((a, b) => a.distanceKm - b.distanceKm);
  return items.slice(0, limit);
}

export const getNearbyDoctorsBySpecialty = getNearbyDoctorsByProfession;

