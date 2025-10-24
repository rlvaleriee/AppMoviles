import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export default function NotificationsScreen({ navigation }) {
  const { firebaseUser } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, 'users', firebaseUser.uid, 'notifications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
    return () => unsub();
  }, [firebaseUser]);

  const open = (n) => {
    if (n?.entityRef?.type === 'appointment') {
      navigation.navigate('Appointments');
    } else if (n?.entityRef?.type === 'thread') {
      navigation.navigate('Chatbot'); 
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notificaciones</Text>
      <FlatList
        data={items}
        keyExtractor={(i)=>i.id}
        renderItem={({item})=>(
          <TouchableOpacity style={styles.card} onPress={()=>open(item)}>
            <Text style={styles.head}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={()=><View style={{height:8}}/>}
      />
    </View>
  );
}
const styles=StyleSheet.create({
  container:{flex:1,padding:16}, title:{fontSize:22,fontWeight:'700',marginBottom:8},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#eee',borderRadius:10,padding:14},
  head:{fontWeight:'700',marginBottom:4}, body:{color:'#555'}
});
