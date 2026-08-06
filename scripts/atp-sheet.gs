/**
 * KickOffCal — ATP men's matches into the review sheet.
 *
 * Paste this into the sheet's Extensions → Apps Script, set the two
 * Script Properties named below, then run `install()` once.
 *
 * WHAT THIS IS. No feed we can use publishes men's draws, so the men's
 * tour is assembled from a vendor API into a sheet a human can correct,
 * and a Cloud Function reads the sheet into Firestore. The sheet is an
 * INGESTION SOURCE, never the serving layer — the app never reads it.
 *
 * THE THREE RULES IT IS BUILT AROUND:
 *
 * 1. VENDOR QUOTA IS THE SCARCE THING. The free tier is 50 requests per
 *    key per day (measured). So: ask OUR OWN backend what is playing
 *    before spending a single vendor request, cache the vendor's
 *    tournament/season ids in a tab so discovery is paid once, and stop
 *    early when nothing is on.
 * 2. A HUMAN'S EDIT SURVIVES EVERY REBUILD. Tab 2 is rewritten each run.
 *    Overrides are read first, keyed by canonical match key, and written
 *    back — otherwise the first refresh after somebody fixes a time
 *    silently discards the fix, which is worse than never having the
 *    column.
 * 3. AN UNMAPPED PLAYER IS LEFT BLANK, NEVER GUESSED. Auto-mapping
 *    accepts only an exact, unique full-name hit from our own directory;
 *    everything else queues for a person. The Cloud Function refuses to
 *    publish a row with a blank id, so the cost of not knowing is a
 *    missing match, never a wrong one.
 *
 * Script Properties (File → Project Settings → Script Properties):
 *   RAPID_KEYS      comma-separated RapidAPI keys, rotated in order
 *   FUNCTIONS_BASE  https://us-central1-gameday-fixtures.cloudfunctions.net
 */

var VENDOR = 'tennisapi1';
var VENDOR_HOST = 'tennisapi1.p.rapidapi.com';

var TAB_RAW = 'raw_pulls';
var TAB_CANON = 'canonical_matches';
var TAB_MAP = 'player_mapping';
var TAB_DISAGREE = 'vendor_disagreement';
var TAB_TOURNAMENTS = 'tournaments';
var TAB_STATUS = 'status';

var RAW_HEADER = [
  'fetched_at', 'vendor', 'tournament_key', 'vendor_tournament_id',
  'vendor_match_id', 'round', 'home_display', 'home_vendor_player_id',
  'away_display', 'away_vendor_player_id', 'scheduled_utc', 'status',
  'change_timestamp',
];

// The Cloud Function reads THIS tab, by header name. Adding a column is
// safe; renaming one is not.
var CANON_HEADER = [
  'canonical_match_key', 'tournament_key', 'round',
  'home_athlete_id', 'away_athlete_id', 'home_display', 'away_display',
  'home_vendor_player_id', 'away_vendor_player_id',
  'scheduled_utc', 'time_precision', 'status',
  'override_scheduled_utc', 'override_status', 'override_note',
  'vendors', 'vendor_match_id', 'updated_at',
];

var MAP_HEADER = [
  'vendor', 'vendor_player_id', 'vendor_display_name',
  'canonical_athlete_id', 'canonical_name', 'country', 'confidence', 'noted_at',
];

var DISAGREE_HEADER = [
  'canonical_match_key', 'field', 'vendor_a', 'value_a', 'vendor_b', 'value_b', 'seen_at',
];

var TOURNAMENTS_HEADER = [
  'tournament_key', 'our_name', 'vendor_tournament_id', 'vendor_season_id',
  'resolved_at', 'note',
];

// ─── Entry points ─────────────────────────────────────────────────────

function install() {
  ensureTabs_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('poll').timeBased().everyHours(2).create();
  status_('installed', 'trigger every 2 hours');
}

function poll() {
  var t0 = new Date();
  ensureTabs_();
  var windows;
  try {
    windows = activeWindows_();
  } catch (e) {
    // Our own backend failing is not "no tennis on" — say so and stop,
    // rather than writing an empty sheet over a good one.
    status_('error', 'active windows: ' + e);
    return;
  }
  if (windows.length === 0) {
    status_('idle', 'no ATP tournament live or starting within 48h — 0 vendor requests');
    return;
  }
  var observations = [];
  var errors = [];
  for (var i = 0; i < windows.length; i++) {
    try {
      observations = observations.concat(fetchTournament_(windows[i]));
    } catch (e) {
      // ONE TOURNAMENT FAILING MUST NOT STOP THE OTHERS, and it must not
      // look like that tournament has no matches.
      errors.push(windows[i].tournamentKey + ': ' + e);
    }
  }
  if (observations.length > 0) appendRaw_(observations);
  var mapped = updateMapping_(observations);
  rebuildCanonical_(observations, mapped);
  status_(
    errors.length ? 'partial' : 'ok',
    windows.length + ' tournament(s), ' + observations.length + ' matches, ' +
      Math.round((new Date() - t0) / 1000) + 's' +
      (errors.length ? ' | ERRORS: ' + errors.join(' ; ') : '')
  );
}

// ─── Our own backend (free) ───────────────────────────────────────────

function base_() {
  var b = PropertiesService.getScriptProperties().getProperty('FUNCTIONS_BASE');
  if (!b) throw new Error('FUNCTIONS_BASE script property is not set');
  return b.replace(/\/$/, '');
}

function activeWindows_() {
  var r = UrlFetchApp.fetch(base_() + '/activeTennisWindows', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  var body = JSON.parse(r.getContentText());
  if (!body || !body.windows) throw new Error('response carried no windows array');
  return body.windows;
}

/**
 * Our directory, for auto-mapping. Exact unique full-name hits — plus
 * ONE widening, for name ORDER.
 *
 * Measured against the vendor's 500 ranked men: 356 match our roster
 * exactly, and SIX are the same person written the other way round —
 * "Juncheng Shang" here is "Shang Juncheng" in our directory, and the
 * same for Wu Yibing, Zhang Zhizhen, Zhou Yi, Sun Fajing. Chinese and
 * Korean names are rendered family-name-first by some sources and
 * given-name-first by others, and treating that as two people is the
 * F34 mistake pointing the other way: not a collision, a split.
 *
 * The widening is GATED so it cannot invent a match between two
 * genuinely different Western players whose names happen to invert
 * ("Thomas Martin" / "Martin Thomas"). A reversed match is accepted
 * only when the straight one found NOTHING, the reversed one is
 * UNIQUE, and the two sides' countries do not contradict each other.
 */
function searchTennis_(q) {
  var r = UrlFetchApp.fetch(
    base_() + '/searchEntities?q=' + encodeURIComponent(q),
    { muteHttpExceptions: true }
  );
  if (r.getResponseCode() !== 200) return [];
  return (JSON.parse(r.getContentText()).athletes || []).filter(function (a) {
    return a.sportKey === 'tennis';
  });
}

function lookupAthlete_(name, iso3) {
  var tennis = searchTennis_(name);
  var straight = tennis.filter(function (a) {
    return norm_(a.name) === norm_(name);
  });
  if (straight.length === 1) return straight[0];
  if (straight.length > 1) return null; // ambiguous — a human decides
  // ASK AGAIN, REVERSED. Reversing the candidate list is not enough:
  // measured, our search returns ZERO hits for "Juncheng Shang" while
  // the directory holds him as "Shang Juncheng", so there was never a
  // candidate to reverse. The second query is against our own free
  // endpoint and only happens for names the first one missed.
  var reversedName = norm_(name).split(' ').reverse().join(' ');
  var flipped = searchTennis_(reversedName).filter(function (a) {
    return norm_(a.name) === reversedName;
  });
  if (flipped.length !== 1) return null;
  var theirs = flipped[0].countryCode || '';
  // Unknown on either side is not a contradiction; a DIFFERENT country
  // is, and refuses the match.
  if (iso3 && theirs && iso3 !== theirs) return null;
  return flipped[0];
}

// ─── Vendor, with key rotation and quota tracking ─────────────────────

function keys_() {
  var raw = PropertiesService.getScriptProperties().getProperty('RAPID_KEYS');
  if (!raw) throw new Error('RAPID_KEYS script property is not set');
  return raw.split(',').map(function (k) { return k.trim(); }).filter(String);
}

/**
 * Try each key in turn. A key that is out of quota (429) is skipped and
 * its exhaustion recorded; only when EVERY key refuses do we throw. The
 * remaining-quota header is stored per key so the status tab shows real
 * headroom rather than an estimate.
 */
function vendorGet_(path) {
  var ks = keys_();
  var props = PropertiesService.getScriptProperties();
  var lastErr = 'no keys configured';
  for (var i = 0; i < ks.length; i++) {
    var r = UrlFetchApp.fetch('https://' + VENDOR_HOST + path, {
      muteHttpExceptions: true,
      headers: { 'x-rapidapi-host': VENDOR_HOST, 'x-rapidapi-key': ks[i] },
    });
    var code = r.getResponseCode();
    var headers = r.getAllHeaders();
    var remaining = headers['x-ratelimit-requests-remaining'];
    if (remaining !== undefined) {
      props.setProperty('QUOTA_' + i, String(remaining) + ' @ ' + new Date().toISOString());
    }
    if (code === 200) return JSON.parse(r.getContentText());
    if (code === 204) return null; // genuinely nothing there
    if (code === 429) { lastErr = 'key ' + (i + 1) + ' out of quota'; continue; }
    // A 4xx that is not quota is a bad request, not a reason to burn
    // the next key on the identical call.
    throw new Error('vendor HTTP ' + code + ' on ' + path + ': ' + r.getContentText().slice(0, 200));
  }
  throw new Error(lastErr);
}

// ─── Tournament id discovery, paid once ───────────────────────────────

/**
 * Vendor tournament + season ids, cached in the tournaments tab. Costs
 * two vendor requests the first time a tournament appears and nothing
 * ever again — which is what keeps a 50/day budget viable.
 */
function vendorIdsFor_(win) {
  var sh = tab_(TAB_TOURNAMENTS, TOURNAMENTS_HEADER);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === win.tournamentKey && values[i][2] && values[i][3]) {
      return { tournamentId: values[i][2], seasonId: values[i][3] };
    }
  }
  // A row that EXISTS but has no ids is a human's to-do, not a reason
  // to append another blank one every two hours.
  for (var j = 1; j < values.length; j++) {
    if (values[j][0] === win.tournamentKey) {
      throw new Error(
        win.tournamentKey + ': tournaments tab row has no vendor ids yet — ' +
        'fill vendor_tournament_id and vendor_season_id by hand'
      );
    }
  }
  // SEARCH BY CITY, NOT BY TITLE. Vendors index tennis tournaments by
  // where they are played; our titles are the sponsor's ("National Bank
  // Open Presented by Rogers") and find nothing. The venue city comes
  // from our own fixture. The bare city is tried first because it is
  // the form that hits; the title is a fallback for the handful of
  // events named for something other than a place.
  var candidates = [];
  if (win.venueCity) {
    candidates.push(String(win.venueCity).split(/[\s,]+/)[0]);
    candidates.push(String(win.venueCity));
  }
  candidates.push(win.name.split(/[,—-]/)[0].trim());
  var tried = [];
  var entity = null;
  for (var c = 0; c < candidates.length && !entity; c++) {
    var term = candidates[c];
    if (!term || tried.indexOf(term) !== -1) continue;
    tried.push(term);
    var found = vendorGet_('/api/tennis/search/' + encodeURIComponent(term));
    // Doubles and the WTA event share the city name, so the category
    // has to be checked — taking the first hit would publish the
    // women's draw into the men's slice.
    ((found && found.results) || []).forEach(function (r) {
      var e = r.entity || {};
      if (entity) return;
      if ((e.category || {}).name === 'ATP' &&
          String(e.name || '').toLowerCase().indexOf('doubles') === -1) entity = e;
    });
  }
  if (!entity) {
    // Leave the human a row to fill rather than only an error: next run
    // picks up whatever they type.
    sh.appendRow([
      win.tournamentKey, win.name, '', '', new Date().toISOString(),
      'AUTO-DISCOVERY FAILED — searched: ' + tried.join(', ') +
        '. Fill vendor_tournament_id and vendor_season_id by hand.',
    ]);
    throw new Error('no ATP singles entity; searched ' + tried.join(', '));
  }
  var seasons = vendorGet_('/api/tennis/tournament/' + entity.id + '/seasons');
  var year = String(new Date(win.startUtc).getUTCFullYear());
  var season = ((seasons && seasons.seasons) || []).filter(function (s) {
    return String(s.year) === year;
  })[0];
  if (!season) throw new Error('no ' + year + ' season for vendor tournament ' + entity.id);
  sh.appendRow([
    win.tournamentKey, win.name, entity.id, season.id, new Date().toISOString(),
    'auto-resolved; edit if wrong',
  ]);
  return { tournamentId: entity.id, seasonId: season.id };
}

function fetchTournament_(win) {
  var ids = vendorIdsFor_(win);
  var body = vendorGet_(
    '/api/tennis/tournament/' + ids.tournamentId + '/season/' + ids.seasonId + '/events/next/0'
  );
  var events = (body && body.events) || [];
  var now = new Date().toISOString();
  return events.map(function (e) {
    var home = e.homeTeam || {};
    var away = e.awayTeam || {};
    return {
      fetchedAt: now,
      vendor: VENDOR,
      tournamentKey: win.tournamentKey,
      vendorTournamentId: ids.tournamentId,
      vendorMatchId: String(e.id),
      round: (e.roundInfo || {}).name || '',
      homeDisplay: home.name || '',
      homeVendorPlayerId: home.id ? String(home.id) : '',
      homeCountry: ((home.country || {}).alpha3) || '',
      awayDisplay: away.name || '',
      awayVendorPlayerId: away.id ? String(away.id) : '',
      awayCountry: ((away.country || {}).alpha3) || '',
      scheduledUtc: e.startTimestamp
        ? new Date(e.startTimestamp * 1000).toISOString()
        : '',
      status: ((e.status || {}).type) || '',
      changeTimestamp: (e.changes || {}).changeTimestamp || 0,
    };
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────

function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function tab_(name, header) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureTabs_() {
  tab_(TAB_RAW, RAW_HEADER);
  tab_(TAB_CANON, CANON_HEADER);
  tab_(TAB_MAP, MAP_HEADER);
  tab_(TAB_DISAGREE, DISAGREE_HEADER);
  tab_(TAB_TOURNAMENTS, TOURNAMENTS_HEADER);
  tab_(TAB_STATUS, ['at', 'state', 'detail', 'quota']);
}

function status_(state, detail) {
  var props = PropertiesService.getScriptProperties();
  var quota = [];
  for (var i = 0; i < 6; i++) {
    var q = props.getProperty('QUOTA_' + i);
    if (q) quota.push('key' + (i + 1) + ': ' + q);
  }
  tab_(TAB_STATUS, ['at', 'state', 'detail', 'quota'])
    .appendRow([new Date().toISOString(), state, detail, quota.join(' | ')]);
}

function appendRaw_(obs) {
  var sh = tab_(TAB_RAW, RAW_HEADER);
  var rows = obs.map(function (o) {
    return [
      o.fetchedAt, o.vendor, o.tournamentKey, o.vendorTournamentId,
      o.vendorMatchId, o.round, o.homeDisplay, o.homeVendorPlayerId,
      o.awayDisplay, o.awayVendorPlayerId, o.scheduledUtc, o.status,
      o.changeTimestamp,
    ];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, RAW_HEADER.length).setValues(rows);
}

// ─── Player mapping (Tab 3) ───────────────────────────────────────────

/**
 * Fold to a comparable form. THE COMBINING-MARK RANGE IS WRITTEN AS
 * ESCAPES ON PURPOSE: `\u0300-\u036f` survives a clipboard, an editor
 * that re-normalises its input, and a copy-paste through a browser. The
 * same range written as literal characters is invisible in the source
 * and silently stopped stripping when this file was pasted into Apps
 * Script — after which "Jiří Lehečka" and "Jiri Lehečka" folded to
 * DIFFERENT strings, the exact-match test failed, and six of nine
 * Montreal matches went unmapped over players we hold.
 *
 * The second replace matters just as much: anything left non-ASCII
 * becomes a SPACE, so a mark that survives does not merely disappear —
 * it splits the word ("jir i lehec ka") and can never match again.
 */
function norm_(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns vendorPlayerId → canonical athlete id for everyone we can be
 * SURE about. New vendor players get one lookup against our own
 * directory; an exact unique full-name hit is auto-mapped, anything else
 * is written with a blank id for a human. Never guessed.
 */
function updateMapping_(obs) {
  var sh = tab_(TAB_MAP, MAP_HEADER);
  var values = sh.getDataRange().getValues();
  var known = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][1]) {
      known[String(values[i][1])] = { id: String(values[i][3] || ''), row: i + 1 };
    }
  }
  var seen = {};
  obs.forEach(function (o) {
    [[o.homeVendorPlayerId, o.homeDisplay, o.homeCountry],
     [o.awayVendorPlayerId, o.awayDisplay, o.awayCountry]]
      .forEach(function (p) {
        if (!p[0] || seen[p[0]]) return;
        seen[p[0]] = true;
        var row = known[p[0]];
        // A FILLED id is final — it may be a human's decision and is
        // never second-guessed. A BLANK one is an open question, so it
        // is asked again every run: the matcher may have been fixed
        // (it was), or the player may have entered our directory since.
        // Without this retry a player recorded once as unmatchable
        // stays unmatchable for ever, which is how six Montreal
        // matches stayed unpublished after the fold bug was fixed.
        if (row && row.id) return;
        var hit = null;
        try { hit = lookupAthlete_(p[1], p[2]); } catch (e) { hit = null; }
        var cells = [
          VENDOR, p[0], p[1],
          hit ? hit.key : '',
          hit ? hit.name : '',
          hit ? (hit.countryCode || '') : '',
          hit
            ? (norm_(hit.name) === norm_(p[1])
                ? 'auto: exact unique full name'
                : 'auto: name order reversed, country agrees')
            : 'NEEDS A HUMAN',
          new Date().toISOString(),
        ];
        if (row) {
          // Update in place — appending would grow a duplicate row
          // every two hours for every player we cannot resolve.
          sh.getRange(row.row, 1, 1, MAP_HEADER.length).setValues([cells]);
          row.id = hit ? hit.key : '';
        } else {
          sh.appendRow(cells);
          known[p[0]] = { id: hit ? hit.key : '', row: sh.getLastRow() };
        }
      });
  });
  var out = {};
  Object.keys(known).forEach(function (k) { out[k] = known[k].id || ''; });
  return out;
}

// ─── Canonical matches (Tab 2) ────────────────────────────────────────

/**
 * Stable across reschedules and across vendors: the tournament, the
 * round, and the unordered pair of players. Deliberately NOT the time
 * (it moves) and NOT the vendor's match id (it is one vendor's).
 */
function canonicalKey_(o, homeId, awayId) {
  var a = homeId || norm_(o.homeDisplay);
  var b = awayId || norm_(o.awayDisplay);
  var pair = [a, b].sort().join('+');
  return [o.tournamentKey, norm_(o.round).replace(/ /g, '-'), pair].join('|');
}

function rebuildCanonical_(obs, mapped) {
  var sh = tab_(TAB_CANON, CANON_HEADER);
  var existing = sh.getDataRange().getValues();
  var header = existing[0].map(String);
  var col = {};
  header.forEach(function (h, i) { col[h] = i; });
  // RULE 2: read the human's columns BEFORE the rewrite.
  var overrides = {};
  for (var i = 1; i < existing.length; i++) {
    var key = existing[i][col['canonical_match_key']];
    if (!key) continue;
    var o1 = existing[i][col['override_scheduled_utc']];
    var o2 = existing[i][col['override_status']];
    var o3 = existing[i][col['override_note']];
    if (o1 || o2 || o3) overrides[key] = [o1 || '', o2 || '', o3 || ''];
  }
  var now = new Date().toISOString();
  var byKey = {};
  obs.forEach(function (o) {
    var homeId = mapped[o.homeVendorPlayerId] || '';
    var awayId = mapped[o.awayVendorPlayerId] || '';
    var key = canonicalKey_(o, homeId, awayId);
    var ov = overrides[key] || ['', '', ''];
    var prior = byKey[key];
    if (prior && prior.vendors.indexOf(o.vendor) === -1) {
      // Two vendors on one match: keep the first value, record the
      // difference rather than silently choosing.
      if (prior.scheduledUtc !== o.scheduledUtc) {
        tab_(TAB_DISAGREE, DISAGREE_HEADER).appendRow([
          key, 'scheduled_utc', prior.vendors, prior.scheduledUtc,
          o.vendor, o.scheduledUtc, now,
        ]);
      }
      prior.vendors += '+' + o.vendor;
      return;
    }
    byKey[key] = {
      key: key, tournamentKey: o.tournamentKey, round: o.round,
      homeId: homeId, awayId: awayId,
      homeDisplay: o.homeDisplay, awayDisplay: o.awayDisplay,
      homeVendorPlayerId: o.homeVendorPlayerId,
      awayVendorPlayerId: o.awayVendorPlayerId,
      scheduledUtc: o.scheduledUtc, status: o.status,
      ov: ov, vendors: o.vendor, vendorMatchId: o.vendorMatchId,
    };
  });
  var rows = Object.keys(byKey).map(function (k) {
    var m = byKey[k];
    return [
      m.key, m.tournamentKey, m.round, m.homeId, m.awayId,
      m.homeDisplay, m.awayDisplay, m.homeVendorPlayerId, m.awayVendorPlayerId,
      m.scheduledUtc, m.scheduledUtc ? 'exact' : '', m.status,
      m.ov[0], m.ov[1], m.ov[2], m.vendors, m.vendorMatchId, now,
    ];
  });
  // An empty pull must not blank a sheet the Cloud Function is about to
  // read: leaving yesterday's rows is recoverable, publishing nothing is
  // an outage nobody notices.
  if (rows.length === 0) return;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CANON_HEADER.length).clearContent();
  sh.getRange(2, 1, rows.length, CANON_HEADER.length).setValues(rows);
}
