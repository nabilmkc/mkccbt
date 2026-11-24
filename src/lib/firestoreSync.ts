import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { UserRole } from '../types/cbt';

export async function syncFirebaseUserProfile(
  firebaseUser: User,
  resolvedRole: UserRole,
  username: string,
  className: string
): Promise<void> {
  const uid = firebaseUser.uid;
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        username: username.slice(0, 64),
        name: (firebaseUser.displayName || username).slice(0, 100),
        role: resolvedRole,
        className: className.slice(0, 80),
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        name: (firebaseUser.displayName || username).slice(0, 100),
        className: className.slice(0, 80),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (firebaseUser.email) {
    try {
      const privateRef = doc(db, 'users', uid, 'private', 'info');
      await setDoc(privateRef, {
        uid,
        email: firebaseUser.email.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}
