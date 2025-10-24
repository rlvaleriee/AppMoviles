import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View, ActivityIndicator, Platform } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const BOT_ID = 'bot:dialogflow';
// Cambia por tu URL real (HTTP) o convierte a Callable si prefieres.
const BOT_ENDPOINT = 'https://<tu-region>-<tu-proyecto>.cloudfunctions.net/botWebhook';

export default function ChatbotScreen() {
  const { firebaseUser } = useAuth();
  const [threadId, setThreadId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [initLoading, setInitLoading] = useState(true);

  const unsubRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Limpia suscripción de mensajes si estaba activa
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  // 1) Asegurar thread del usuario
  useEffect(() => {
    const ensureThread = async () => {
      if (!firebaseUser?.uid) {
        setInitLoading(false);
        return;
      }
      try {
        const tRef = doc(db, 'threads', `${firebaseUser.uid}__bot`);
        const tSnap = await getDoc(tRef);
        if (!tSnap.exists()) {
          await setDoc(tRef, {
            type: 'bot',
            participants: [firebaseUser.uid, BOT_ID],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: null,
          });
        }
        if (mountedRef.current) setThreadId(tRef.id);
      } catch (e) {
        console.log('ensureThread error', e);
        if (mountedRef.current) {
          Alert.alert('Error', 'No se pudo iniciar el chat.');
        }
      } finally {
        if (mountedRef.current) setInitLoading(false);
      }
    };

    ensureThread();
  }, [firebaseUser]);

  // 2) Suscribir mensajes
  useEffect(() => {
    if (!threadId) return;
    // Limpia suscripción anterior si existe
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const q = query(
      collection(db, 'threads', threadId, 'messages'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => {
        const m = d.data();
        return {
          _id: d.id,
          text: m.text || '',
          createdAt: m.createdAt?.toDate?.() || new Date(),
          user: {
            _id: m.authorId,
            name: m.authorId?.startsWith?.('bot') ? 'Asistente' : 'Tú',
          },
        };
      });
      if (mountedRef.current) setMsgs(arr);
    });

    unsubRef.current = unsub;
    return () => {
      unsub && unsub();
      unsubRef.current = null;
    };
  }, [threadId]);

  const sendToBot = async (text) => {
    try {
      const resp = await fetch(BOT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: firebaseUser.uid, text }),
      });
      // Si el endpoint falla con 500/404, resp.ok = false
      if (!resp.ok) {
        throw new Error(`Bot HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const botText = data?.text || '...';

      await addDoc(collection(db, 'threads', threadId, 'messages'), {
        authorId: BOT_ID,
        text: botText,
        payload: data?.payload || null,
        createdAt: serverTimestamp(),
        meta: { source: 'bot' },
      });
    } catch (e) {
      console.log('sendToBot error', e);
      Alert.alert('Error', 'No se pudo contactar al bot.');
    }
  };

  const onSend = useCallback(
    async (newMessages = []) => {
      try {
        if (!firebaseUser?.uid || !threadId) return;
        const m = newMessages[0];
        if (!m?.text?.trim()) return;

        // Guarda mensaje del usuario
        await addDoc(collection(db, 'threads', threadId, 'messages'), {
          authorId: firebaseUser.uid,
          text: m.text,
          payload: null,
          createdAt: serverTimestamp(),
          meta: { source: 'user' },
        });

        // Llama al bot
        await sendToBot(m.text);
      } catch (e) {
        console.log('onSend error', e);
        Alert.alert('Error', 'No se pudo enviar el mensaje.');
      }
    },
    [firebaseUser, threadId]
  );

  if (initLoading || !firebaseUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
    }

  return (
    <GiftedChat
      messages={msgs}
      onSend={onSend}
      user={{ _id: firebaseUser.uid, name: 'Tú' }}
      placeholder="Describe tus síntomas... (esto no reemplaza un diagnóstico profesional)"
      alwaysShowSend
      showUserAvatar={false}
      renderAvatar={null}
    />
  );
}
