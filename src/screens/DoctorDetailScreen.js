import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function DoctorDetailScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const [docData, setDocData] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'users', doctorId));
      if (snap.exists()) setDocData(snap.data());
    })();
  }, [doctorId]);

  if (!docData) return <View style={styles.center}><ActivityIndicator/></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{docData.name}</Text>
      <Text style={styles.sub}>{docData.specialty}</Text>
      <Text style={styles.sub}>{docData.clinicAddress}</Text>
      {/* Lista de próximos slots si usas users/{doctorId}/availability */}
      <TouchableOpacity
        style={styles.button}
        onPress={()=>navigation.navigate('AppointmentCreate', { doctorId })}
      >
        <Text style={styles.buttonText}>Solicitar cita</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles=StyleSheet.create({
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  container:{flex:1,padding:16}, title:{fontSize:22,fontWeight:'700',marginBottom:4}, sub:{color:'#666',marginTop:4},
  button:{backgroundColor:'#2196F3',padding:14,borderRadius:8,marginTop:16,alignItems:'center'},
  buttonText:{color:'#fff',fontWeight:'700'}
});
