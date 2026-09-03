// Every Android network request carries a descriptive User-Agent —
// fetch AND the image pipeline (owner report 2026-09-03: no hero
// photograph ever painted on the Pixel).
//
// MEASURED: Wikimedia answers HTTP 403 to OkHttp's default agent
// (`okhttp/x.y`) on BOTH hops a Commons photo takes — the
// Special:FilePath redirect and upload.wikimedia.org itself — while the
// same request under a named agent returns the image. The Wikidata and
// Commons API lookups already pass a User-Agent header through fetch,
// which is why the card knew the photographer's name and still painted
// no photograph: the lookup succeeded and the image request was
// refused. iOS never showed it because CFNetwork's default agent is
// accepted.
//
// WHY NATIVE, NOT A PER-IMAGE HEADER: `imageSource()` already attaches
// the header to every <Image> source, and React Native's Android view
// does forward it — but the fix has to hold for every request the
// image pipeline makes on the app's behalf, including the ones no
// component authored (redirect follow-ups, prefetches), and for every
// host with the same policy. The OkHttp client factory is the one
// place all of them pass through. The interceptor only fills an ABSENT
// User-Agent; a caller's explicit header wins.
//
// A CONFIG PLUGIN RATHER THAN AN EDIT TO MainApplication.kt, because
// `/android` is generated (CNG) — see withUploadSigning.js for the same
// reasoning. Idempotent: re-running prebuild finds the marker and
// leaves the file alone.

const { withMainApplication } = require('@expo/config-plugins');

// Mirrors IMAGE_USER_AGENT in src/core/components.tsx — the one string
// every request from this app identifies itself with.
const USER_AGENT = 'KickOffCal/1.0 (fixtures calendar app)';
const MARKER = 'OkHttpClientProvider.setOkHttpClientFactory';

const IMPORT = 'import com.facebook.react.modules.network.OkHttpClientProvider\n';

const FACTORY = `    // Every OkHttp request — fetch and the image pipeline alike — carries
    // a descriptive User-Agent (plugins/withNetworkUserAgent.js): Wikimedia
    // refuses okhttp's default agent, and a refused image is a blank hero.
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(this)
        .addInterceptor { chain ->
          val request = chain.request()
          chain.proceed(
            if (request.header("User-Agent") == null) {
              request.newBuilder().header("User-Agent", "${USER_AGENT}").build()
            } else {
              request
            }
          )
        }
        .build()
    }
`;

function withNetworkUserAgent(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    if (!src.includes('import expo.modules.ApplicationLifecycleDispatcher')) {
      throw new Error(
        'withNetworkUserAgent: MainApplication.kt has changed shape — the ' +
          'Expo lifecycle import anchor is missing. Re-fit the plugin.',
      );
    }
    src = src.replace(
      'import expo.modules.ApplicationLifecycleDispatcher',
      `${IMPORT}import expo.modules.ApplicationLifecycleDispatcher`,
    );
    const anchor = /(override fun onCreate\(\) \{\n\s*super\.onCreate\(\)\n)/;
    if (!anchor.test(src)) {
      throw new Error(
        'withNetworkUserAgent: onCreate()/super.onCreate() anchor missing in ' +
          'MainApplication.kt. Re-fit the plugin.',
      );
    }
    src = src.replace(anchor, `$1${FACTORY}`);
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = withNetworkUserAgent;
