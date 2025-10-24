// Distancia haversine (km)
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * getBoundingBox(lat, lng, radiusKm)
 * Devuelve lat/lng bounds aproximados (no geohash) — útil si necesitas un bbox rápido.
 */
export function getBoundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 110.574; // ~km por grado lat
  const lonDelta = radiusKm / (111.320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lng - lonDelta,
    maxLon: lng + lonDelta,
  };
}
