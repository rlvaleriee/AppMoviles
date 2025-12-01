import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useUnreadNotifications(uid) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) return;

    const ref = collection(db, 'users', uid, 'notifications');
    const q = query(ref, where('read', '==', false));

    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size);
    });

    return () => unsub();
  }, [uid]);

  return count;
}
