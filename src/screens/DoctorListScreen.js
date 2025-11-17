import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator
} from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import * as Location from 'expo-location';

const distKm = (a, b) => {
  const toRad = (x) => x * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

export default function DoctorsListScreen({ navigation }) {
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [myPos, setMyPos] = useState(null);

  // 1) Ubicación del paciente
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  // 2) Suscripción a médicos registrados en Firestore (users)
  useEffect(() => {
    setLoading(true);

    const base = collection(db, 'users');

    // Si aún no usas verified, cambia por: const q = query(base, where('role','==','doctor'));
    const q = query(base, where('role', '==', 'doctor'), where('verified', '==', true));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => {
          const x = d.data() || {};
          // Nombre
          const name =
            x.name && x.lastName ? `${x.name} ${x.lastName}` :
            x.name || x.displayName || 'Médico/a';

            // Especialidad: del registro guardas cssp.profession, pero si tienes specialties[] también lo usamos
          const specialties = Array.isArray(x.specialties) && x.specialties.length > 0
            ? x.specialties
            : (x.cssp?.profession ? [x.cssp.profession] : []);

          const location = x.location || null; // { latitude, longitude }
          const ratingAvg = x.ratingAvg ?? x.rating ?? null;

          return {
            id: d.id,
            doctorId: d.id,
            name,
            specialties,
            location,
            ratingAvg,
          };
        });

        setDocs(items);
        setLoading(false);
      },
      (err) => {
        console.log('onSnapshot users error:', err?.message);
        setDocs([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 3) Filtro por especialidad (cliente) + orden por distancia
  const list = useMemo(() => {
    const term = (specialty || '').trim().toLowerCase();

    const filtered = term
      ? docs.filter((d) =>
          (d.specialties || []).some((s) => (s || '').toLowerCase().includes(term))
        )
      : docs;

    if (!myPos) return filtered;

    return [...filtered]
      .map((d) => {
        const loc = d.location;
        const km = loc
          ? distKm(myPos, { lat: loc.latitude, lng: loc.longitude })
          : null;
        return { ...d, distanceKm: km };
      })
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }, [docs, specialty, myPos]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Médicos</Text>

      <TextInput
        style={styles.input}
        placeholder="Filtrar por especialidad (ej. Cardiología)"
        value={specialty}
        onChangeText={setSpecialty}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate('DoctorDetail', { doctorId: item.doctorId || item.id })
              }
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{(item.specialties || []).join(' · ') || '—'}</Text>
              <Text style={styles.sub}>
                {item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : '—'}
                {item.ratingAvg != null ? `  · ★ ${Number(item.ratingAvg).toFixed(1)}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 14,
  },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { color: '#666', marginTop: 4 },
});
