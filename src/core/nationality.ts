// Nationality as identity — the mark we are allowed to draw.
//
// Athletes have no crest and, by owner ruling (Prompt 16), no generated
// likeness: making a picture of a real, identifiable person carries
// personality-rights exposure that a club badge does not, and a
// nearly-right face reads as broken to the fans who know it. What every
// athlete DOES have is a nationality, and a national flag is free to
// use, factually correct, and — in boxing especially — the thing the
// fighter actually walks out behind.
//
// PURE DATA + PURE FUNCTIONS. No react-native import, so it is unit
// testable and usable from any feature.
//
// THE CODES ARE A MIXTURE, measured not assumed. Production carries 78
// distinct country codes across 2,273 athletes (2026-08-04) and they are
// NOT one scheme: IBF publishes IOC-style codes ("GER", "SUI", "NED"),
// while other rows arrive as ISO 3166-1 alpha-3 ("DEU" never appears but
// "DNK", "HRV", "NLD", "ZAF", "CHE", "PHL" all do — beside their IOC
// twins "DEN", "CRO", "NED", "RSA", "SUI", "PHI"). So the lookup accepts
// BOTH spellings and resolves them to one nation.
//
// WHERE THEY CONFLICT, IOC WINS, because our sources are sporting
// bodies. The only live collision is BRN — IOC Bahrain, ISO Brunei —
// recorded here rather than silently decided; neither appears in the
// store today.

export interface Nation {
  /** ISO 3166-1 alpha-2 — what the flag emoji is built from. */
  code2: string;
  /** Display name, in the app's own English. */
  name: string;
}

// [IOC (or primary) code, ISO alpha-2, name, ISO alpha-3 when it differs]
type Row = readonly [string, string, string, string?];

const ROWS: readonly Row[] = [
  ['AFG', 'AF', 'Afghanistan'],
  ['ALB', 'AL', 'Albania'],
  ['ALG', 'DZ', 'Algeria', 'DZA'],
  ['AND', 'AD', 'Andorra'],
  ['ANG', 'AO', 'Angola', 'AGO'],
  ['ANT', 'AG', 'Antigua and Barbuda', 'ATG'],
  ['ARG', 'AR', 'Argentina'],
  ['ARM', 'AM', 'Armenia'],
  ['ARU', 'AW', 'Aruba', 'ABW'],
  ['ASA', 'AS', 'American Samoa', 'ASM'],
  ['AUS', 'AU', 'Australia'],
  ['AUT', 'AT', 'Austria'],
  ['AZE', 'AZ', 'Azerbaijan'],
  ['BAH', 'BS', 'Bahamas', 'BHS'],
  ['BAN', 'BD', 'Bangladesh', 'BGD'],
  ['BAR', 'BB', 'Barbados', 'BRB'],
  ['BDI', 'BI', 'Burundi'],
  ['BEL', 'BE', 'Belgium'],
  ['BEN', 'BJ', 'Benin'],
  ['BER', 'BM', 'Bermuda', 'BMU'],
  ['BHU', 'BT', 'Bhutan', 'BTN'],
  ['BIH', 'BA', 'Bosnia and Herzegovina'],
  ['BIZ', 'BZ', 'Belize', 'BLZ'],
  ['BLR', 'BY', 'Belarus'],
  ['BOL', 'BO', 'Bolivia'],
  ['BOT', 'BW', 'Botswana', 'BWA'],
  ['BRA', 'BR', 'Brazil'],
  // IOC BRN is Bahrain; ISO BRN is Brunei. IOC wins (see header).
  ['BRN', 'BH', 'Bahrain', 'BHR'],
  ['BRU', 'BN', 'Brunei'],
  ['BUL', 'BG', 'Bulgaria', 'BGR'],
  ['BUR', 'BF', 'Burkina Faso', 'BFA'],
  ['CAF', 'CF', 'Central African Republic'],
  ['CAM', 'KH', 'Cambodia', 'KHM'],
  ['CAN', 'CA', 'Canada'],
  ['CAY', 'KY', 'Cayman Islands', 'CYM'],
  ['CGO', 'CG', 'Congo', 'COG'],
  ['CHA', 'TD', 'Chad', 'TCD'],
  ['CHI', 'CL', 'Chile', 'CHL'],
  ['CHN', 'CN', 'China'],
  ['CIV', 'CI', 'Côte d’Ivoire'],
  ['CMR', 'CM', 'Cameroon'],
  ['COD', 'CD', 'DR Congo'],
  ['COK', 'CK', 'Cook Islands'],
  ['COL', 'CO', 'Colombia'],
  ['COM', 'KM', 'Comoros', 'COM'],
  ['CPV', 'CV', 'Cabo Verde'],
  ['CRC', 'CR', 'Costa Rica', 'CRI'],
  ['CRO', 'HR', 'Croatia', 'HRV'],
  ['CUB', 'CU', 'Cuba'],
  ['CYP', 'CY', 'Cyprus'],
  ['CZE', 'CZ', 'Czechia'],
  ['DEN', 'DK', 'Denmark', 'DNK'],
  ['DJI', 'DJ', 'Djibouti'],
  ['DMA', 'DM', 'Dominica'],
  ['DOM', 'DO', 'Dominican Republic'],
  ['ECU', 'EC', 'Ecuador'],
  ['EGY', 'EG', 'Egypt'],
  ['ERI', 'ER', 'Eritrea'],
  ['ESA', 'SV', 'El Salvador', 'SLV'],
  ['ESP', 'ES', 'Spain'],
  ['EST', 'EE', 'Estonia'],
  ['ETH', 'ET', 'Ethiopia'],
  ['FIJ', 'FJ', 'Fiji', 'FJI'],
  ['FIN', 'FI', 'Finland'],
  ['FRA', 'FR', 'France'],
  ['FSM', 'FM', 'Micronesia'],
  ['GAB', 'GA', 'Gabon'],
  ['GAM', 'GM', 'Gambia', 'GMB'],
  ['GBR', 'GB', 'United Kingdom'],
  ['GBS', 'GW', 'Guinea-Bissau', 'GNB'],
  ['GEO', 'GE', 'Georgia'],
  ['GEQ', 'GQ', 'Equatorial Guinea', 'GNQ'],
  ['GER', 'DE', 'Germany', 'DEU'],
  ['GHA', 'GH', 'Ghana'],
  ['GRE', 'GR', 'Greece', 'GRC'],
  ['GRN', 'GD', 'Grenada', 'GRD'],
  ['GUA', 'GT', 'Guatemala', 'GTM'],
  ['GUI', 'GN', 'Guinea', 'GIN'],
  ['GUM', 'GU', 'Guam'],
  ['GUY', 'GY', 'Guyana'],
  ['HAI', 'HT', 'Haiti', 'HTI'],
  ['HKG', 'HK', 'Hong Kong'],
  ['HON', 'HN', 'Honduras', 'HND'],
  ['HUN', 'HU', 'Hungary'],
  ['INA', 'ID', 'Indonesia', 'IDN'],
  ['IND', 'IN', 'India'],
  ['IRI', 'IR', 'Iran', 'IRN'],
  ['IRL', 'IE', 'Ireland'],
  ['IRQ', 'IQ', 'Iraq'],
  ['ISL', 'IS', 'Iceland'],
  ['ISR', 'IL', 'Israel'],
  ['ISV', 'VI', 'US Virgin Islands', 'VIR'],
  ['ITA', 'IT', 'Italy'],
  ['IVB', 'VG', 'British Virgin Islands', 'VGB'],
  ['JAM', 'JM', 'Jamaica'],
  ['JOR', 'JO', 'Jordan'],
  ['JPN', 'JP', 'Japan'],
  ['KAZ', 'KZ', 'Kazakhstan'],
  ['KEN', 'KE', 'Kenya'],
  ['KGZ', 'KG', 'Kyrgyzstan'],
  ['KIR', 'KI', 'Kiribati'],
  ['KOR', 'KR', 'South Korea'],
  ['KOS', 'XK', 'Kosovo'],
  ['KSA', 'SA', 'Saudi Arabia', 'SAU'],
  ['KUW', 'KW', 'Kuwait', 'KWT'],
  ['LAO', 'LA', 'Laos'],
  ['LAT', 'LV', 'Latvia', 'LVA'],
  ['LBA', 'LY', 'Libya', 'LBY'],
  ['LBR', 'LR', 'Liberia'],
  ['LCA', 'LC', 'Saint Lucia'],
  ['LES', 'LS', 'Lesotho', 'LSO'],
  ['LIB', 'LB', 'Lebanon', 'LBN'],
  ['LIE', 'LI', 'Liechtenstein'],
  ['LTU', 'LT', 'Lithuania'],
  ['LUX', 'LU', 'Luxembourg'],
  ['MAD', 'MG', 'Madagascar', 'MDG'],
  ['MAR', 'MA', 'Morocco'],
  ['MAS', 'MY', 'Malaysia', 'MYS'],
  ['MAW', 'MW', 'Malawi', 'MWI'],
  ['MDA', 'MD', 'Moldova'],
  ['MDV', 'MV', 'Maldives'],
  ['MEX', 'MX', 'Mexico'],
  ['MGL', 'MN', 'Mongolia', 'MNG'],
  ['MHL', 'MH', 'Marshall Islands'],
  ['MKD', 'MK', 'North Macedonia'],
  ['MLI', 'ML', 'Mali'],
  ['MLT', 'MT', 'Malta'],
  ['MNE', 'ME', 'Montenegro'],
  ['MON', 'MC', 'Monaco', 'MCO'],
  ['MOZ', 'MZ', 'Mozambique'],
  ['MRI', 'MU', 'Mauritius', 'MUS'],
  ['MTN', 'MR', 'Mauritania', 'MRT'],
  ['MYA', 'MM', 'Myanmar', 'MMR'],
  ['NAM', 'NA', 'Namibia'],
  ['NCA', 'NI', 'Nicaragua', 'NIC'],
  ['NED', 'NL', 'Netherlands', 'NLD'],
  ['NEP', 'NP', 'Nepal', 'NPL'],
  ['NGR', 'NG', 'Nigeria', 'NGA'],
  ['NIG', 'NE', 'Niger', 'NER'],
  ['NOR', 'NO', 'Norway'],
  ['NRU', 'NR', 'Nauru'],
  ['NZL', 'NZ', 'New Zealand'],
  ['OMA', 'OM', 'Oman', 'OMN'],
  ['PAK', 'PK', 'Pakistan'],
  ['PAN', 'PA', 'Panama'],
  ['PAR', 'PY', 'Paraguay', 'PRY'],
  ['PER', 'PE', 'Peru'],
  ['PHI', 'PH', 'Philippines', 'PHL'],
  ['PLE', 'PS', 'Palestine', 'PSE'],
  ['PLW', 'PW', 'Palau'],
  ['PNG', 'PG', 'Papua New Guinea'],
  ['POL', 'PL', 'Poland'],
  ['POR', 'PT', 'Portugal', 'PRT'],
  ['PRK', 'KP', 'North Korea'],
  ['PUR', 'PR', 'Puerto Rico', 'PRI'],
  ['QAT', 'QA', 'Qatar'],
  ['ROU', 'RO', 'Romania'],
  ['RSA', 'ZA', 'South Africa', 'ZAF'],
  ['RUS', 'RU', 'Russia'],
  ['RWA', 'RW', 'Rwanda'],
  ['SAM', 'WS', 'Samoa', 'WSM'],
  ['SEN', 'SN', 'Senegal'],
  ['SEY', 'SC', 'Seychelles', 'SYC'],
  ['SIN', 'SG', 'Singapore', 'SGP'],
  ['SKN', 'KN', 'Saint Kitts and Nevis', 'KNA'],
  ['SLE', 'SL', 'Sierra Leone'],
  ['SLO', 'SI', 'Slovenia', 'SVN'],
  ['SMR', 'SM', 'San Marino'],
  ['SOL', 'SB', 'Solomon Islands', 'SLB'],
  ['SOM', 'SO', 'Somalia'],
  ['SRB', 'RS', 'Serbia'],
  ['SRI', 'LK', 'Sri Lanka', 'LKA'],
  ['SSD', 'SS', 'South Sudan'],
  ['STP', 'ST', 'São Tomé and Príncipe'],
  ['SUD', 'SD', 'Sudan', 'SDN'],
  ['SUI', 'CH', 'Switzerland', 'CHE'],
  ['SUR', 'SR', 'Suriname'],
  ['SVK', 'SK', 'Slovakia'],
  ['SWE', 'SE', 'Sweden'],
  ['SWZ', 'SZ', 'Eswatini'],
  ['SYR', 'SY', 'Syria'],
  ['TAN', 'TZ', 'Tanzania', 'TZA'],
  ['TGA', 'TO', 'Tonga', 'TON'],
  ['THA', 'TH', 'Thailand'],
  ['TJK', 'TJ', 'Tajikistan'],
  ['TKM', 'TM', 'Turkmenistan'],
  ['TLS', 'TL', 'Timor-Leste'],
  ['TOG', 'TG', 'Togo', 'TGO'],
  ['TPE', 'TW', 'Chinese Taipei', 'TWN'],
  ['TRI', 'TT', 'Trinidad and Tobago', 'TTO'],
  ['TUN', 'TN', 'Tunisia'],
  ['TUR', 'TR', 'Türkiye'],
  ['TUV', 'TV', 'Tuvalu'],
  ['UAE', 'AE', 'United Arab Emirates', 'ARE'],
  ['UGA', 'UG', 'Uganda'],
  ['UKR', 'UA', 'Ukraine'],
  ['URU', 'UY', 'Uruguay', 'URY'],
  ['USA', 'US', 'United States'],
  ['UZB', 'UZ', 'Uzbekistan'],
  ['VAN', 'VU', 'Vanuatu', 'VUT'],
  ['VEN', 'VE', 'Venezuela'],
  ['VIE', 'VN', 'Vietnam', 'VNM'],
  ['VIN', 'VC', 'Saint Vincent and the Grenadines', 'VCT'],
  ['YEM', 'YE', 'Yemen'],
  ['ZAM', 'ZM', 'Zambia', 'ZMB'],
  ['ZIM', 'ZW', 'Zimbabwe', 'ZWE'],
];

// The four UK nations. Boxing sources publish "ENG" (13 fighters in the
// store) because that is how a fighter is billed. Three have Unicode
// flags built from subdivision tag sequences; NORTHERN IRELAND HAS NONE,
// so it resolves to a nation with a name and no flag rather than being
// given the Union flag it does not fly.
const UK_NATIONS: Record<string, { name: string; subdivision?: string }> = {
  ENG: { name: 'England', subdivision: 'gbeng' },
  SCO: { name: 'Scotland', subdivision: 'gbsct' },
  WAL: { name: 'Wales', subdivision: 'gbwls' },
  NIR: { name: 'Northern Ireland' },
};

const BY_CODE = new Map<string, Nation>();
for (const [ioc, code2, name, iso3] of ROWS) {
  const nation: Nation = { code2, name };
  BY_CODE.set(ioc, nation);
  // IOC wins a collision: never overwrite an entry a primary code owns.
  if (iso3 && !BY_CODE.has(iso3)) BY_CODE.set(iso3, nation);
}
for (const [code, { name }] of Object.entries(UK_NATIONS)) {
  BY_CODE.set(code, { code2: code, name });
}

// National-team labels → nation code (Round 5). Providers name national
// sides "<Country> <Sport>" ("South Africa Rugby", "England Cricket",
// "Argentina Basketball", "USA Rugby") or plainly ("France"): strip the
// sport tail, then match the nation TABLE by name — or by code, which
// is what "USA" is once "Rugby" goes. A label that survives neither
// (clubs, counties, "AUNZ Invitational XV") returns null, and that
// miss IS the national-team gate: no league flag or config needed.
const TEAM_NAME_TAIL =
  /\s+(?:rugby(?:\s+league)?|cricket|basketball|football|soccer|sevens|xv)$/i;
const BY_NAME = new Map<string, string>();
for (const [ioc, , name] of ROWS) BY_NAME.set(name.toLowerCase(), ioc);
for (const [code, { name }] of Object.entries(UK_NATIONS)) {
  BY_NAME.set(name.toLowerCase(), code);
}

export function codeFromTeamName(
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const stripped = label.replace(TEAM_NAME_TAIL, '').trim();
  const byName = BY_NAME.get(stripped.toLowerCase());
  if (byName) return byName;
  const asCode = stripped.toUpperCase();
  return /^[A-Z]{3}$/.test(asCode) && BY_CODE.has(asCode) ? asCode : null;
}
// ISO alpha-2 joined the mixture when boxing-data became an enrichment
// source (Prompt 25 §7: its roster speaks alpha-2). Indexed LAST and
// only where unclaimed — though a clash is impossible by construction:
// every existing key is three letters and these are two.
for (const [, code2] of ROWS.map((r) => [r[0], r[1]] as const)) {
  if (!BY_CODE.has(code2)) {
    const nation = [...BY_CODE.values()].find((n) => n.code2 === code2);
    if (nation) BY_CODE.set(code2, nation);
  }
}

// A country code we do not recognise resolves to NOTHING — never to a
// guess, and never to a half-flag. Unknown is a real answer: the row
// falls back to the generated treatment it had before.
export function nationOf(code: string | null | undefined): Nation | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

const REGIONAL_INDICATOR_A = 0x1f1e6;
const TAG_BASE = 0xe0000;

// The flag as an emoji: two regional-indicator letters, or a subdivision
// tag sequence for England/Scotland/Wales.
//
// Platform note (measured on the iOS simulator, and the reason the code
// is ALWAYS rendered beside it): a system font without flag glyphs shows
// the two letters instead. That degrades to the country code, which is
// what these rows displayed before — never to tofu.
export function flagEmojiOf(code: string | null | undefined): string | null {
  const key = code?.trim().toUpperCase();
  if (!key) return null;
  const uk = UK_NATIONS[key];
  if (uk) {
    if (!uk.subdivision) return null; // Northern Ireland: no flag exists
    return (
      String.fromCodePoint(0x1f3f4) +
      [...uk.subdivision]
        .map((c) => String.fromCodePoint(TAG_BASE + c.charCodeAt(0)))
        .join('') +
      String.fromCodePoint(0xe007f)
    );
  }
  const nation = BY_CODE.get(key);
  if (!nation || nation.code2.length !== 2 || !/^[A-Z]{2}$/.test(nation.code2)) {
    return null;
  }
  return [...nation.code2]
    .map((c) =>
      String.fromCodePoint(REGIONAL_INDICATOR_A + c.charCodeAt(0) - 65),
    )
    .join('');
}

// Jolpica publishes a driver's nationality as a DEMONYM ("Thai",
// "British", "Dutch") rather than a code, so F1 needs this one hop.
// Deliberately not a general-purpose language table: it covers the
// nationalities an F1 grid has actually carried, and anything else
// returns null and gets the generated treatment.
const DEMONYMS: Readonly<Record<string, string>> = {
  american: 'USA',
  argentine: 'ARG',
  argentinian: 'ARG',
  australian: 'AUS',
  austrian: 'AUT',
  belgian: 'BEL',
  brazilian: 'BRA',
  british: 'GBR',
  canadian: 'CAN',
  chinese: 'CHN',
  colombian: 'COL',
  czech: 'CZE',
  danish: 'DEN',
  dutch: 'NED',
  'east german': 'GER',
  english: 'ENG',
  finnish: 'FIN',
  french: 'FRA',
  german: 'GER',
  hungarian: 'HUN',
  indian: 'IND',
  indonesian: 'INA',
  irish: 'IRL',
  israeli: 'ISR',
  italian: 'ITA',
  japanese: 'JPN',
  liechtensteiner: 'LIE',
  malaysian: 'MAS',
  mexican: 'MEX',
  monegasque: 'MON',
  'new zealander': 'NZL',
  polish: 'POL',
  portuguese: 'POR',
  rhodesian: 'ZIM',
  russian: 'RUS',
  'south african': 'RSA',
  spanish: 'ESP',
  swedish: 'SWE',
  swiss: 'SUI',
  thai: 'THA',
  turkish: 'TUR',
  uruguayan: 'URU',
  venezuelan: 'VEN',
};

export function codeFromDemonym(
  demonym: string | null | undefined,
): string | null {
  if (!demonym) return null;
  return DEMONYMS[demonym.trim().toLowerCase()] ?? null;
}

// "🇲🇽 Mexico" / "England" (no flag glyph exists for NIR) / null when the
// code means nothing to us. One formatter so every surface says it the
// same way.
export function nationLabelOf(code: string | null | undefined): string | null {
  const nation = nationOf(code);
  if (!nation) return null;
  const flag = flagEmojiOf(code);
  return flag ? `${flag} ${nation.name}` : nation.name;
}
