// Is the React Native Firebase NATIVE module actually in this binary?
//
// The messaging require sites are try/catch-guarded, but on the new
// architecture that is not enough: RNFB's TurboModule lookup uses
// getEnforcing, whose failure is REPORTED THROUGH THE NATIVE EXCEPTION
// PIPELINE as an uncaught error (a full LogBox in dev) even though the
// JS catch fires and the app carries on. A binary built before the
// RNFB pods — any install predating Prompt 6's prebuild — showed that
// scare the first time the follow flow touched device registration.
// So both sites now ask FIRST, with the non-throwing, non-reporting
// lookup, and skip the require entirely when the module is absent.
//
// TurboModuleRegistry.get returns null on a miss (getEnforcing is the
// thrower); NativeModules covers an old-architecture binary that has
// the pods. Both absent ⇒ pre-RNFB binary ⇒ degrade honestly, exactly
// as the token path always promised.

import { NativeModules, TurboModuleRegistry } from 'react-native';

export function rnfbMessagingAvailable(): boolean {
  try {
    return (
      TurboModuleRegistry.get('NativeRNFBTurboApp') != null ||
      NativeModules.RNFBAppModule != null
    );
  } catch {
    return false;
  }
}
