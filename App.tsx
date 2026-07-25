import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
// Side effect: defines background tasks at module scope (headless launches).
import { registerBackgroundSync } from './src/features/calendar-sync/backgroundSync';
import { runSync, shouldAutoSync } from './src/features/calendar-sync/syncEngine';
import FollowScreen from './src/features/follows/FollowScreen';

export default function App() {
  useEffect(() => {
    void registerBackgroundSync();
    // Propagation layer 3: always sync on foreground (never on a cold
    // first open — shouldAutoSync gates the permission prompt).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && shouldAutoSync()) void runSync();
    });
    if (shouldAutoSync()) void runSync();
    return () => sub.remove();
  }, []);

  return (
    <>
      <FollowScreen />
      <StatusBar style="auto" />
    </>
  );
}
