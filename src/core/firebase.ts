// Firebase client. Slice phase: always the local emulator suite with the
// offline demo project. Real project wiring lands with M6 (entitlements +
// real FCM); auth joins then too.

import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

// Gameday emulator ports are offset from Firebase defaults so they can
// coexist with the owner's MedHandover emulators (8080/5001/9099).
export const EMULATOR_PORTS = { firestore: 8180, functions: 5101 } as const;

export const EMULATOR_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const app = initializeApp({
  projectId: 'demo-gameday',
  apiKey: 'demo',
  appId: 'demo',
});

// Long polling: RN networking has no native WebChannel/streams support.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);

export const functionsBaseUrl = `http://${EMULATOR_HOST}:${EMULATOR_PORTS.functions}/demo-gameday/us-central1`;
