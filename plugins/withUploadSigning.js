// Sign RELEASE builds with the upload keystore, not the debug key.
//
// A CONFIG PLUGIN RATHER THAN AN EDIT TO android/app/build.gradle, because
// `/android` is generated (CNG) and gitignored — AGENTS is explicit that
// both native directories are "generated, never hand-edited". A hand
// edit works until the next `expo prebuild --clean`, at which point the
// release build silently goes back to being signed with the debug key
// that ships in every React Native template. Silently is the problem: a
// debug-signed release APK installs and runs perfectly.
//
// WHAT IT SIGNS WITH, and why that file is not in the repo: the keystore
// and its passwords live in `credentials/` (gitignored wholesale — the
// properties file holds the passwords in plaintext because Gradle has no
// other way to read them). If the file is absent, this plugin leaves the
// project alone and the build stays debug-signed rather than failing —
// a fresh clone should still be able to run a debug build without
// credentials it has no reason to have.
//
// UPLOAD KEY, NOT APP SIGNING KEY (owner ruling 2026-08-11). Play App
// Signing is mandatory for new apps and Google generates the app signing
// key, so APKs from Play carry a DIFFERENT signature from anything this
// signs. That is the recommended posture and it means this sideload
// cannot be updated in place by a future Play build — the test install
// gets uninstalled once before launch. Losing this key is recoverable:
// Play supports an upload key reset.

const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const PROPS = 'credentials/keystore.properties';

function readCreds(projectRoot) {
  const file = path.join(projectRoot, PROPS);
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out.GAMEDAY_UPLOAD_STORE_FILE ? out : null;
}

// Copy the keystore into android/app/ at prebuild time. Gradle's
// `storeFile file(...)` resolves relative to the module, and the
// credentials directory deliberately sits OUTSIDE android/ so that
// `prebuild --clean` cannot delete the key.
const withKeystoreCopied = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const creds = readCreds(root);
      if (!creds) return cfg;
      const src = path.join(root, 'credentials', creds.GAMEDAY_UPLOAD_STORE_FILE);
      if (!fs.existsSync(src)) return cfg;
      const dest = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        creds.GAMEDAY_UPLOAD_STORE_FILE,
      );
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o600);
      return cfg;
    },
  ]);

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    const creds = readCreds(cfg.modRequest.projectRoot);
    if (!creds) {
      // No credentials on this machine: leave the template alone.
      return cfg;
    }
    let gradle = cfg.modResults.contents;

    // 1. Add an `upload` signingConfig beside the template's `debug` one.
    const anchor = `    signingConfigs {\n        debug {`;
    if (!gradle.includes(anchor)) {
      throw new Error(
        'withUploadSigning: could not find the debug signingConfig block. ' +
          'The Expo template changed; re-check this plugin before shipping.',
      );
    }
    if (!gradle.includes('upload {')) {
      gradle = gradle.replace(
        anchor,
        `    signingConfigs {
        upload {
            storeFile file('${creds.GAMEDAY_UPLOAD_STORE_FILE}')
            storePassword '${creds.GAMEDAY_UPLOAD_STORE_PASSWORD}'
            keyAlias '${creds.GAMEDAY_UPLOAD_KEY_ALIAS}'
            keyPassword '${creds.GAMEDAY_UPLOAD_KEY_PASSWORD}'
        }
        debug {`,
      );
    }

    // 2. Point the release build type at it. Asserted rather than
    //    replace-and-hope: if the template's line changes, this must
    //    fail loudly, because the failure mode is a release APK that
    //    builds, installs and runs while signed with the debug key.
    const releaseDebug = `        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug`;
    if (gradle.includes(releaseDebug)) {
      gradle = gradle.replace(
        releaseDebug,
        `        release {\n            signingConfig signingConfigs.upload`,
      );
    } else if (!gradle.includes('signingConfig signingConfigs.upload')) {
      throw new Error(
        'withUploadSigning: release build type does not carry the expected ' +
          'debug signingConfig line and is not already on `upload`. Refusing ' +
          'to leave a release build debug-signed.',
      );
    }

    cfg.modResults.contents = gradle;
    return cfg;
  });

module.exports = (config) => withReleaseSigning(withKeystoreCopied(config));
