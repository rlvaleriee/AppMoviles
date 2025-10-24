import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, onSnapshot, query, where, orderBy, startAt, endAt } from 'firebase/firestore';
import { db } from '../firebase';
import * as Location from 'expo-location'; // si usas Expo

const distKm = (a, b) => {
  const toRad = (x)=>x*Math.PI/180;
  const R=6371;
  const dLat=toRad(b.lat-a.lat); const dLon=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat); const lat2=toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(lat1)*Math.cos(lat2);
  return 2*R*Math.asin(Math.sqrt(x));
};

export default function DoctorsListScreen({ navigation }) {
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [myPos, setMyPos] = useState(null);

  // 1) Obtener ubicación del paciente
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  // 2) Suscribirse a doctores (filtro por especialidad si se escribe)
  useEffect(() => {
    setLoading(true);

    // Si tienes geohash bounds, úsalo (startAt/endAt). Aquí dejamos un query minimal:
    const base = collection(db, 'doctor_search');
    const q = specialty
      ? query(base, where('specialties', 'array-contains', specialty))
      : query(base);

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDocs(items);
      setLoading(false);
    });

    return () => unsub();
  }, [specialty]);

  const list = useMemo(() => {
    if (!myPos) return docs;
    return [...docs]
      .map(d => {
        const loc = d.location; // GeoPoint
        const km = loc ? distKm(myPos, { lat: loc.latitude, lng: loc.longitude }) : null;
        return { ...d, distanceKm: km };
      })
      .sort((a,b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }, [docs, myPos]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Médicos cercanos</Text>

      <TextInput style={styles.input} placeholder="Filtrar por especialidad (ej. Cardiología)"
        value={specialty} onChangeText={setSpecialty} />

      {loading ? <ActivityIndicator/> : (
        <FlatList
          data={list}
          keyExtractor={(item)=>item.id}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.card}
              onPress={()=>navigation.navigate('DoctorDetail', { doctorId: item.doctorId || item.id })}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{(item.specialties||[]).join(' · ')}</Text>
              <Text style={styles.sub}>
                {item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : '—'}
                {item.ratingAvg != null ? `  · ★ ${item.ratingAvg.toFixed(1)}` : ''}
              </Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={()=><View style={{height:8}}/>}
        />
      )}
    </View>
  );
}

const styles=StyleSheet.create({
  container:{flex:1,padding:16}, title:{fontSize:22,fontWeight:'700',marginBottom:8},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:12,marginBottom:12},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#eee',borderRadius:10,padding:14},
  name:{fontSize:16,fontWeight:'700'}, sub:{color:'#666',marginTop:4}
});
