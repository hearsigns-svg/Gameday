// Firebase client. Production project by default; flip USE_EMULATOR for
// the local suite (offset ports so it can coexist with MedHandover's).
// The web apiKey below is a client identifier, not a secret — access is
// governed by Firestore rules.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth, signInAnonymously } from 'firebase/auth';
// @ts-expect-error — getReactNativePersistence is typed only in the
// react-native build; Metro resolves that build at runtime via the
// exports condition, but TS matches the web types first (known firebase
// packaging wart; the standard RN workaround).
import { getReactNativePersistence } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

const USE_EMULATOR = false;

export const EMULATOR_PORTS = { firestore: 8180, functions: 5101 } as const;
export const EMULATOR_HOST =
  Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const app = initializeApp(
  USE_EMULATOR
    ? { projectId: 'demo-gameday', apiKey: 'demo', appId: 'demo' }
    : {
        apiKey: 'AIzaSyDI_r1rTJMhTuphN0lUEWiWeDR5Kx_xzH4',
        authDomain: 'gameday-fixtures.firebaseapp.com',
        projectId: 'gameday-fixtures',
        storageBucket: 'gameday-fixtures.firebasestorage.app',
        messagingSenderId: '188261010398',
        appId: '1:188261010398:web:f3f787dc19737951636b4f',
      },
);

// Long polling: RN networking has no native WebChannel/streams support.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
}

export const functionsBaseUrl = USE_EMULATOR
  ? `http://${EMULATOR_HOST}:${EMULATOR_PORTS.functions}/demo-gameday/us-central1`
  : 'https://us-central1-gameday-fixtures.cloudfunctions.net';

// Anonymous auth: server-side identity for the device registry and
// entitlements with zero sign-up friction (accounts link later).
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export async function ensureSignedIn(): Promise<string | null> {
  try {
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (e) {
    // Offline or provider disabled — sync works without identity; the
    // registry write is skipped and retried on a later run.
    console.warn('[gameday] anonymous sign-in failed:', String(e));
    return null;
  }
}
