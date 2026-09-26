// Builds data-sources/border-lines/ — the data the border-lines map will need,
// where selecting a line highlights the countries it separates.
//
//   lines.geojson         traces only, each keyed by a stable line id
//   lines.seed.json       a STARTING POINT for authored records, not records
//   countries.geojson     polygons for the countries the lines name
//   countries.seed.json   id, nameEn, nameBn for those countries
//
// Nothing here is served. It moves into the served tree when the map is built.
//
// Tracing is shared with build-straits-overlay.mjs via lib/border-traces.mjs,
// so the two builds cannot disagree about what a named line is.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSource } from './lib/geo.mjs';
import { loadBoundarySources, traceRuns, joinRuns, simplifyFeatures, innerPoints, labelAnchor, matchesCodes } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the authored line list lives today. It is the straits map's file for
// historical reasons; the border lines are no longer that map's concern, and
// this is the only thing still read from there.
const LINES_SOURCE = path.join(ROOT, 'docs/international/straits/data.js');
// Everything this script writes. Not served. Change here if it moves.
const OUT_DIR = path.join(ROOT, 'data-sources/border-lines');

// Traces are viewed at world-to-regional zooms; 250 m is well below what shows.
const LINE_SIMPLIFY_METRES = 250;
// Country polygons are whole-country shapes shown at world scale, and they ship
// to students on low-end phones, so they are simplified much harder than the
// lines. 2 km is under two pixels at the basemap's maximum world zoom (z6), and
// these shapes exist only to be washed with a translucent highlight — edge
// precision is invisible at any zoom the map reaches.
const COUNTRY_SIMPLIFY_METRES = 2000;

/*
 * INTERNAL KEYS. Never displayed, permanent once set.
 *
 * FAMOUS_LINES is an array with no key field, and these ids cannot be derived
 * from nameEn ("Line of Control (LoC)" -> loc is a judgement, not a slug), so
 * the mapping is authored here and keyed on nameEn, the only stable handle the
 * source offers.
 *
 * Radcliffe is deliberately one id across two source entries: it is one line
 * with a Punjab sector and a Bengal sector, and the map highlights a list of
 * countries rather than a pair.
 */
const LINE_IDS = {
  'McMahon Line': 'mcmahon',
  'Radcliffe Line (Punjab)': 'radcliffe',
  'Radcliffe Line (Bengal)': 'radcliffe',
  'Durand Line': 'durand',
  'Line of Control (LoC)': 'loc',
  'Korean DMZ (38th Parallel)': 'koreanDmz',
  'Green Line': 'greenLine',
  'Berlin Wall': 'berlinWall',
  '17th Parallel': 'parallel17',
  'Sykes–Picot Line': 'sykesPicot',
};

/*
 * WHICH COUNTRIES EACH LINE RUNS BETWEEN, as ADM0_A3 codes.
 *
 * data.js states these as display names, and a display name is content: the
 * countries file has no "China" (it calls it "People's Republic of China") and
 * no "Israel" at all, so a name-based join silently loses lines. ADM0_A3 is
 * unique across all 248 countries and is carried natively by both boundary-line
 * files as ADM0_A3_L / ADM0_A3_R, so it is the identity here.
 *
 * Every code below was read off the features that data.js's name-based rule
 * already matched — none is typed from memory.
 */
const BETWEEN = {
  'McMahon Line': ['CHN', 'IND'],
  'Radcliffe Line (Punjab)': ['IND', 'PAK'],
  'Radcliffe Line (Bengal)': ['BGD', 'IND'],
  'Durand Line': ['AFG', 'PAK'],
  'Line of Control (LoC)': ['IND', 'PAK'],
  'Korean DMZ (38th Parallel)': ['KOR', 'PRK'],
  'Green Line': ['ISR', 'PSX'],
};

/**
 * The code rule for a line: this table's pair, with everything else about the
 * rule still taken from data.js. Only the country identity changes — the
 * featurecla filter that separates the Radcliffe Line from the Line of Control
 * along the same India/Pakistan pair is carried through untouched, because
 * restating it here would be a second place to get it wrong.
 */
const codeRule = (line) =>
  BETWEEN[line.nameEn] ? { between: BETWEEN[line.nameEn], featurecla: line.match?.featurecla } : null;

/*
 * WHEN A LINE CAME INTO BEING, AND WHEN IT CEASED.
 *
 * Taken from the notes exactly as they read, in Bengali digits. Two fields
 * rather than one "signed" year, because several of these were not signed:
 * the Berlin Wall was built, and ১৯৬১–১৯৮৯ is a span, not a signing date.
 *
 * endedBn is ABSENT on a line still in force — not applicable. establishedBn
 * is null only where no source here carries a year at all, which is the repo's
 * convention for a fact that is real but unverified, and puts it on the
 * pending list rather than inviting a guess.
 *
 * sykesPicot is historical and still has no endedBn, deliberately: the 1916
 * line was never implemented as a border, so there is no date on which it
 * ceased. Absent, not null — settled, not awaiting a decision.
 */
const DATES = {
  mcmahon: { establishedBn: '১৯১৪' },
  radcliffe: { establishedBn: '১৯৪৭' },
  durand: { establishedBn: '১৮৯৩' },
  loc: { establishedBn: null },
  koreanDmz: { establishedBn: '১৯৫৩' },
  greenLine: { establishedBn: '১৯৪৯' },
  berlinWall: { establishedBn: '১৯৬১', endedBn: '১৯৮৯' },
  parallel17: { establishedBn: '১৯৫৪', endedBn: '১৯৭৫' },
  sykesPicot: { establishedBn: '১৯১৬' },
};

/*
 * Values for a merged record that no single source entry can supply, given by
 * the project owner. Only what the merge makes ambiguous is listed; everything
 * else still comes straight out of data.js.
 */
const MERGED = {
  radcliffe: {
    nameEn: 'Radcliffe Line',
    // Three, not a pair: the Punjab sector divides India and Pakistan, the
    // Bengal sector India and Bangladesh.
    countries: ['IND', 'PAK', 'BGD'],
  },
};

/*
|--------------------------------------------------------------------------
| GENERATED LINES — computed, not traced
|
| A line of constant latitude or longitude needs no external source: it is
| exact by definition, so nothing here is pinned against Natural Earth and
| nothing here can drift.
|
| CLIPPED, because a parallel circles the globe. Drawing all of 22°N would
| run a line through Mexico and India, neither of which has anything to do
| with Egypt and Sudan. `span` is where the line is drawn and `frame` is
| where the camera goes; BOTH ARE DISPLAY DECISIONS, not facts — a student
| never memorises where the drawn segment stops. They were chosen by eye in
| the shell, starting from where the two countries' boundary actually sits at
| that latitude, which is why they are here in the build and not in the
| records as though they were content.
|
| DENSIFIED even though two points would draw the same straight line in Web
| Mercator: a parallel is only straight in this projection. Clipping and any
| future projection change both need the intermediate points to be real.
|--------------------------------------------------------------------------
*/

// ~28 km between points. Far denser than any zoom this map reaches needs,
// and cheap: the seven lines together are a few hundred coordinates.
const DENSIFY_STEP_DEGREES = 0.25;

/**
 * A line of constant latitude or longitude, as a densified LineString.
 * `value` is the constant; `span` is [from, to] along the other axis.
 */
function generateLine(axis, value, [from, to]) {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / DENSIFY_STEP_DEGREES));
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    // Rounded to the same precision the traced lines are written at, so one
    // file does not mix 5-decimal and 17-decimal coordinates.
    const other = Number(t.toFixed(5));
    coordinates.push(axis === 'parallel' ? [other, value] : [value, other]);
  }
  return { type: 'LineString', coordinates };
}

/*
 * THE GENERATED LINES.
 *
 * `value` null means the line's position is not yet settled, and a line with
 * no settled position is NOT DRAWN — an unverified value is never displayed,
 * and a meridian drawn at a guessed longitude would look exactly as
 * authoritative as one drawn at the right longitude.
 *
 * countries are ADM0_A3 codes for the states the line divides, or [] where
 * the dividing states no longer exist and no code stands for them.
 */
const GENERATED = {
  parallel17: {
    axis: 'parallel',
    value: 17,
    span: [105.3, 108.4],
    frame: [104.8, 15.3, 108.9, 18.7],
  },
  parallel22: {
    axis: 'parallel',
    value: 22,
    span: [24.9, 36.9],
    frame: [24, 19.5, 37.8, 24.5],
    nameEn: '22nd Parallel North',
    status: 'active',
    countries: ['EGY', 'SDN'],
    establishedBn: null,
  },
  parallel24: {
    axis: 'parallel',
    value: 24,
    span: [68, 71],
    frame: [67.3, 22.6, 71.7, 25.4],
    nameEn: '24th Parallel North',
    status: 'active',
    countries: ['PAK', 'IND'],
    establishedBn: null,
  },
  parallel25: {
    axis: 'parallel',
    value: 25,
    span: [-6.7, -4.7],
    frame: [-7.6, 23.8, -3.8, 26.2],
    nameEn: '25th Parallel North',
    status: 'active',
    countries: ['MRT', 'MLI'],
    establishedBn: null,
  },
  parallel38: {
    axis: 'parallel',
    value: 38,
    span: [124.2, 129.6],
    frame: [123.6, 36.4, 130.2, 39.6],
    nameEn: '38th Parallel North',
    status: 'active',
    countries: ['KOR', 'PRK'],
    establishedBn: null,
  },
  parallel49: {
    axis: 'parallel',
    value: 49,
    span: [-123.4, -94.1],
    frame: [-124.5, 46.5, -93, 51.5],
    nameEn: '49th Parallel North',
    status: 'active',
    countries: ['USA', 'CAN'],
    establishedBn: null,
  },
  tordesillas: {
    axis: 'meridian',
    // 46°30′W. Settled from one authoritative source rather than averaged
    // across the spread — see `sources.longitude` and `review` below.
    value: -46.5,
    // Clipped on the same grounds as the parallels: a meridian runs pole to
    // pole, and drawing all of it would put a line through the Arctic and the
    // Antarctic, neither of which has anything to do with what this treaty
    // divided. The span is the Atlantic stretch where the line actually bit —
    // a display decision, not a fact.
    span: [-35, 8],
    // Wide enough to hold the line AND Iberia: the highlight is Spain and
    // Portugal, and a frame showing only the Atlantic makes it look like a bug.
    frame: [-62, -38, 2, 46],
    nameEn: 'Treaty of Tordesillas',
    status: 'historical',
    // NOT the countries the line runs between — it runs through open ocean and
    // Brazil. These are the two powers that drew it, which is the exam-relevant
    // fact about this treaty. The only record where `countries` means that.
    countries: ['ESP', 'PRT'],
    establishedBn: '১৪৯৪',
    sources: {
      longitude: [
        {
          title: 'Treaty of Tordesillas',
          publisher: 'Encyclopaedia Britannica',
          url: 'https://www.britannica.com/event/Treaty-of-Tordesillas',
          states: 'The line was moved to 370 leagues (1,185 miles) west of the Cape Verde Islands, "or about 46°30′ W of Greenwich".',
        },
      ],
    },
    review:
      'Longitude taken as 46°30′W (−46.5), the figure Encyclopaedia Britannica gives for the 370-league line. The treaty fixes the distance, not the meridian, and the length of a league is disputed, so cited meridians spread over roughly two degrees; this value is the one shown, and the disagreement is recorded rather than resolved. Not an average of the cited values. `countries` here is the two powers that drew the line, not the countries it separates — the only record where the field carries that meaning.',
  },
};

/*
 * WHERE THE CAMERA GOES FOR A LINE THAT IS NOT DRAWN AS A LINE.
 *
 * A record with no line geometry is shown as a point marker, and a point
 * gives fitBounds nothing to frame — fitting a single coordinate is a zoom to
 * nowhere. These boxes put the marker in its context: Berlin inside its city,
 * the Sykes–Picot reference point inside the Syria/Iraq region it describes.
 *
 * Display decisions, like the generated lines' span and frame above. A
 * student never memorises where the box stops.
 */
const MARKER_FRAMES = {
  // Wide enough to land inside the world basemap's useful zooms. A box tight
  // around Berlin frames at about z7, and the world tiles stop at z6 outside
  // the detail areas, so the marker sat on blank land with no borders to place
  // it against.
  berlinWall: [8.5, 49.8, 18.5, 55.2],
  sykesPicot: [35, 31, 45, 39],
};

/*
|--------------------------------------------------------------------------
| OPENSTREETMAP LINES — a committed extract, never the live API
|
| tools/sources/osm-border-lines.geojson is a dated snapshot made by
| extract-osm-border-lines.mjs, checksummed in sources.json. The build refuses
| a file whose checksum differs, so a changed upstream cannot slip in: it has
| to be re-fetched, reviewed and re-pinned deliberately.
|
| Pinned TWICE on purpose. The checksum says the file has not changed; the
| per-record count and hash below say what the build made of it. The first
| catches an upstream edit, the second catches a change in how this script
| reads the same bytes.
|--------------------------------------------------------------------------
*/
const OSM_FILE = path.join(ROOT, 'tools/sources/osm-border-lines.geojson');
const OSM_PIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sources.json'), 'utf8')).osmBorderLines;
const osmText = fs.readFileSync(OSM_FILE, 'utf8');
const osmSha = crypto.createHash('sha256').update(osmText).digest('hex');
if (OSM_PIN && osmSha !== OSM_PIN.sha256)
  throw new Error(
    `tools/sources/osm-border-lines.geojson has changed.\n  pinned ${OSM_PIN.sha256}\n  actual ${osmSha}\nRe-run extract-osm-border-lines.mjs only on purpose, review the diff, then re-pin.`,
  );
const osmExtract = JSON.parse(osmText);

/*
 * Which OSM-sourced records become drawn lines. A record is here only if its
 * extract was measured against the feature's historical extent and passed;
 * siegfriedLine is deliberately absent, and is a marker instead.
 */
const OSM_DRAWN = {
  northernLimitLine: {
    nameEn: 'Northern Limit Line',
    kind: 'boundary',
    status: 'active',
    // The tagging the query relied on: left:country=North Korea,
    // right:country=South Korea.
    countries: ['KOR', 'PRK'],
  },
};

/*
|--------------------------------------------------------------------------
| MARKER-ONLY LINES — no geometry anywhere, so a point and a frame
|
| The survey established that none of these can be traced: no present-day
| boundary file carries them, and nothing reachable in OpenStreetMap is the
| line rather than a street named after it. They take the treatment berlinWall
| and sykesPicot already have — a point marker with its label.
|
| `sources` cites the feature's DOCUMENTED EXTENT, not the point. The point
| only has to lie on that extent, the way the straits map marks a strait with
| a point. Two independent, non-circular citations per field, or the record
| gets no point at all and waits on the pending list.
|
| A record with `labelAt: null` is in NO_POINT_YET below, with the reason.
|--------------------------------------------------------------------------
*/
const MARKER_ONLY = {
  mannerheim: {
    nameEn: 'Mannerheim Line',
    kind: 'boundary',
    status: 'historical',
    labelAt: [29.417, 60.5],
    frame: [26.6, 59.2, 32.9, 62.1],
    sources: {
      labelAt: [
        {
          title: 'Mannerheim Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Mannerheim_Line',
          states: 'Ran from the coast of the Gulf of Finland in the west, through Summa to the Vuoksi River, ending at Taipale in the east; gives the line\'s position as 60.500 N 29.417 E.',
        },
        {
          title: 'Archaeology of the Mannerheim Line — History of the Mannerheim Line',
          publisher: 'University of Helsinki',
          url: 'https://blogs.helsinki.fi/mannerheim-line-archaeology/history-of-mannerheim-line/',
          states: 'A 132 km line across the Karelian Isthmus, "Laatokalta Suomenlahdelle" — from Lake Ladoga to the Gulf of Finland.',
        },
      ],
    },
  },
  maginot: {
    nameEn: 'Maginot Line',
    kind: 'boundary',
    status: 'historical',
    // Ouvrage Hackenberg, Fortified Sector of Boulay: a documented work ON
    // the line rather than a point picked off the middle of it.
    labelAt: [6.36556, 49.34139],
    frame: [3.4, 46.1, 10.3, 51.2],
    sources: {
      labelAt: [
        {
          title: 'Maginot Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Maginot_Line',
          states: 'The line stretched from Switzerland to Luxembourg, on the French side of its borders with Italy, Switzerland, Germany, Luxembourg and Belgium.',
        },
        {
          title: 'Maginot Line',
          publisher: 'Encyclopaedia Britannica',
          url: 'https://www.britannica.com/topic/Maginot-Line',
          states: 'An elaborate defensive barrier in north-east France covering the French–German frontier but not the French–Belgian, with Sedan at its northern end.',
        },
      ],
    },
    review:
      'Sources agree on the southern end (the Swiss frontier) and disagree on the northern terminus: Wikipedia says Luxembourg, Britannica says Sedan, and the French heritage literature says Montmédy. The point is deliberately well inside the undisputed stretch.',
  },
  wallaceLine: {
    nameEn: 'Wallace Line',
    kind: 'boundary',
    status: 'active',
    // The Lombok Strait, the southern end of the line and the place the two
    // sources agree on most precisely.
    labelAt: [115.733, -8.767],
    frame: [113.5, -9.6, 120.5, 2.5],
    sources: {
      labelAt: [
        {
          title: 'Wallace Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Wallace_Line',
          states: 'Runs through the Makassar Strait between Borneo and Sulawesi, and through the Lombok Strait between Bali and Lombok.',
        },
        {
          title: 'The Wallace Line',
          publisher: 'Center for Southeast Asia and its Diasporas, University of Washington',
          url: 'https://jsis.washington.edu/csead/resources/educators/where-in-southeast-asia/the-wallace-line/',
          states: 'An imaginary line intersecting the Lombok Strait between Bali and Lombok to the south, extending north through the Makassar Strait between Kalimantan (Borneo) and Sulawesi.',
        },
      ],
    },
    review:
      'A biogeographic boundary rather than a political one, so it sits in the সীমারেখা group for want of a third. Whether the corpus treats it as a সীমারেখা at all is a content decision.',
  },
  mcnamaraLine: {
    nameEn: 'McNamara Line',
    kind: 'boundary',
    status: 'historical',
    // Con Thien, a documented strongpoint on the barrier.
    labelAt: [106.98, 16.90972],
    // Wide enough to stay inside the world basemap's useful zooms: a box tight
    // on the DMZ frames past z8, and the world tiles stop at z6 outside the
    // detail areas, leaving the marker on blank land.
    frame: [104.4, 14.6, 110.2, 19.2],
    sources: {
      labelAt: [
        {
          title: 'McNamara Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/McNamara_Line',
          states: 'Ran across South Vietnam along the Vietnamese Demilitarized Zone from Cửa Việt to the Laotian border at Mường Phìn, 76 km in total; "the Trace" ran from Gio Linh west to Con Thien.',
        },
        {
          title: 'The Story Behind the McNamara Line (Vietnam magazine, February 1996)',
          publisher: 'Peter Brush, hosted by Montclair State University',
          url: 'https://msuweb.montclair.edu/~furrg/pbmcnamara.html',
          states: 'The barrier would begin at the coast of South Vietnam below the DMZ and continue westward across the coastal plain about thirty kilometres, becoming a marked and obstructed route onward to the Laotian border.',
        },
      ],
    },
  },
  hindenburgLine: {
    nameEn: 'Hindenburg Line',
    kind: 'boundary',
    status: 'historical',
    // Croisilles, Pas-de-Calais: the village the Imperial War Museum names as
    // on the line. Coordinate from OSM node/1129276621, selected by place tag
    // inside a bbox around Arras - France has four villages of this name.
    labelAt: [2.87834, 50.19978],
    frame: [-0.6, 47.6, 6.4, 52.4],
    sources: {
      labelAt: [
        {
          title: 'The Hindenburg Line (Siegfriedstellung), 1916-1918 - photograph Q 50309',
          publisher: 'Imperial War Museums',
          url: 'https://www.iwm.org.uk/collections/item/object/205284123',
          states: 'An unfinished pill-box in the Hindenburg Line near Croisilles, May 1917.',
        },
      ],
    },
  },
  purpleLine: {
    nameEn: 'Purple Line',
    kind: 'boundary',
    status: 'historical',
    labelAt: null,
    review:
      'The 1967 Six-Day War ceasefire line on the Golan, replaced in 1974 by Lines A and B, with Israel pulling back west of line A-1 in the Kuneitra area. One attempt was made to find a stretch away from Quneitra where the 1967 and 1974 lines coincide, since a point there would lie on both: the best source for that is the 1974 Separation of Forces Agreement itself (Avalon Project, Yale Law School), and it defines Lines A and A-1 only by reference to an attached map that the text does not include. It locates no coinciding segment, so no point, and by decision no further search.',
  },
  fochLine: {
    nameEn: 'Foch Line',
    kind: 'boundary',
    status: 'historical',
    // On the modern Poland-Lithuania border, which is the part of the Foch
    // Line that still survives. The vertex nearest the centre of Natural
    // Earth's POL/LTU boundary, selected by ADM0_A3 code, not by name.
    labelAt: [23.19727, 54.26785],
    frame: [19.4, 51.6, 27.0, 56.9],
    sources: {
      labelAt: [
        {
          title: 'Foch Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Foch_Line',
          states: 'The 1919 Entente demarcation line between Poland and Lithuania; after the Second World War only its westernmost part, close to the town of Suwalki, follows the line.',
        },
      ],
    },
  },
  siegfriedLine: {
    nameEn: 'Siegfried Line',
    kind: 'boundary',
    status: 'historical',
    // A vertex of the committed OSM extract — way/366849051, "Höckerlinie
    // (Westwall)" — so the point is a surviving stretch of the line itself
    // rather than a spot chosen off a map.
    labelAt: [6.2176, 50.15147],
    // The DOCUMENTED extent, Kleve to Weil am Rhein, not the surviving
    // remains: the marker stands for the whole line.
    frame: [4.8, 47.0, 9.7, 52.5],
    sources: {
      labelAt: [
        {
          title: 'Siegfried Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Siegfried_Line',
          states: 'Stretched more than 630 km from Kleve on the border with the Netherlands, along the western border of Nazi Germany, to Weil am Rhein on the border with Switzerland.',
        },
        {
          title: 'Siegfried Line',
          publisher: 'Encyclopaedia Britannica',
          url: 'https://www.britannica.com/topic/Siegfried-Line',
          states: 'A system of pillboxes and strongpoints built along the German western frontier in the 1930s and greatly expanded in 1944; illustrates its dragon\'s teeth near Aachen.',
        },
      ],
    },
    review:
      'OSM relation/1629004 carries 98 surviving barrier=tank_trap ways, and they were measured against the documented extent before anything was drawn: they span 49.045N to 50.850N, 43.1% of the Kleve-to-Weil-am-Rhein range, against a 60% bar, and occupy 3 of 4 latitude bands with the southern band empty. Clustered in the middle, so drawing them would teach the wrong stretch of border. Marker instead. The extract is still committed and pinned, so the decision can be revisited against the same bytes.',
  },
  parallel90: {
    nameEn: '90th Parallel North',
    kind: 'parallel',
    status: 'active',
    labelAt: null,
    review:
      'Named in the corpus and previously absent from the map altogether, which the never-silently-absent rule forbids. It has no point because Web Mercator cannot represent the pole — the projection runs to about 85.05 degrees — and a marker at 85 would be in the wrong place while looking entirely right. How 90 degrees should appear is a decision, not an omission.',
  },
};

/*
 * FRAMES FOR TRACED LINES THAT WOULD OTHERWISE FIT TOO CLOSE.
 *
 * A traced line with no frame is fitted to its own geometry, which is right
 * for a long line and wrong for a short one: measured at phone width (a 390 px
 * viewport, 368 px of map), these three land past z6, where the world tiles
 * stop outside the detail areas and the line sits on land with nothing around
 * it to place it by. Each box contains the whole trace, so nothing is cut, and
 * widens it until the fit lands at or under z6.
 */
const CONTEXT_FRAMES = {
  loc: [71.9, 30.1, 77.7, 37.0],
  koreanDmz: [124.6, 35.9, 130.4, 40.6],
  greenLine: [32.3, 29.3, 37.5, 34.5],
};

/*
 * WHICH KIND OF LINE EACH ONE IS, for the picker's two groups.
 *
 * সীমারেখা / অক্ষরেখা is how the source material is organised and how the
 * student learned it, so it is a property of the line rather than of its
 * geometry: the Korean DMZ is a boundary that happens to run near a parallel,
 * and the Tordesillas meridian is a demarcation rather than a line of
 * latitude.
 */
const KIND = {
  mcmahon: 'boundary',
  radcliffe: 'boundary',
  durand: 'boundary',
  loc: 'boundary',
  koreanDmz: 'boundary',
  greenLine: 'boundary',
  berlinWall: 'boundary',
  sykesPicot: 'boundary',
  tordesillas: 'boundary',
  parallel17: 'parallel',
  parallel22: 'parallel',
  parallel24: 'parallel',
  parallel25: 'parallel',
  parallel38: 'parallel',
  parallel49: 'parallel',
  mannerheim: 'boundary',
  maginot: 'boundary',
  wallaceLine: 'boundary',
  mcnamaraLine: 'boundary',
  hindenburgLine: 'boundary',
  purpleLine: 'boundary',
  fochLine: 'boundary',
  parallel90: 'parallel',
  northernLimitLine: 'boundary',
  siegfriedLine: 'boundary',
};

/** Decisions left open on purpose, carried into the seed so they stay visible. */
const REVIEW = {
  mcmahon:
    'nameBn spelling undecided: data.js has "ম্যাকমাহন লাইন", the BCS corpus has "ম্যাকমোহন লাইন". Kept as data.js has it; change here and it changes everywhere.',
  radcliffe:
    'noteBn is null because the merge has no source value: the two sectors carry different notes, and merging them is writing new content. The originals are kept verbatim under "sectors".',
  parallel17:
    'Gained a generated line, so the note saying "পূর্ণ রেখা আঁকা হয়নি — রেফারেন্স পয়েন্ট মাত্র" is no longer true and is nulled rather than reworded. Its countries are [] because North and South Vietnam no longer exist and no ADM0_A3 stands for either; VNM is the successor state, not a party to the division. nameBn is the data.js name; the corpus calls it ১৭° উত্তর.',
  parallel38:
    'A separate record from koreanDmz on purpose: 38°N is the 1945 division line, the DMZ is the 1953 armistice line, and they are not the same line — the DMZ crosses 38°N rather than following it.',
};

/*
 * ENGLISH NAMES ARE FINAL for these records. A decision, not a backlog: there
 * is no Bengali name for them, so `nameBn` does not apply and is ABSENT rather
 * than null — it is not waiting on anything and never counts as pending. The
 * map labels them with `nameEn` wherever it would have used `nameBn`.
 *
 * The list replaces BENGALI_PENDING, which meant the opposite. The check below
 * is what keeps it honest: a listed record must have no `nameBn`, every other
 * record must have one, and `nameBn: null` is no longer a state a name can be
 * in. Supplying a Bengali name later means adding it to the entry and taking
 * the record off this list, in the same edit.
 */
const ENGLISH_NAME_FINAL = ['parallel22', 'parallel24', 'parallel25', 'parallel38', 'parallel49', 'tordesillas',
  'mannerheim', 'maginot', 'wallaceLine', 'mcnamaraLine', 'hindenburgLine', 'purpleLine', 'fochLine', 'parallel90',
  'northernLimitLine', 'siegfriedLine'];

const { FAMOUS_LINES } = await import(pathToFileURL(LINES_SOURCE).href);
const sourceLines = loadBoundarySources();

// ---- trace every line, grouped by its id -----------------------------------
const byId = new Map(); // id -> { entries: [], traces: [] }
for (const line of FAMOUS_LINES) {
  const id = LINE_IDS[line.nameEn];
  if (!id) throw new Error(`no id mapped for "${line.nameEn}" — add it to LINE_IDS`);

  // The code rule replaces data.js's name-based one. Anything data.js can
  // match but BETWEEN cannot is a gap to report, not to paper over.
  const rule = codeRule(line);
  if (line.match && !rule) throw new Error(`"${line.nameEn}" has a match rule in data.js but no ADM0_A3 pair in BETWEEN`);
  if (rule && !line.match) throw new Error(`"${line.nameEn}" has an ADM0_A3 pair but no match rule in data.js`);

  const traces = [];
  const runsByPov = traceRuns({ match: rule, region: line.region }, sourceLines, matchesCodes);
  for (const [bdPov, runs] of Object.entries(runsByPov))
    for (const run of joinRuns(runs))
      traces.push({
        type: 'Feature',
        // id first: it is the identity. nameEn/nameBn stay because on a merged
        // line they are the only record of which sector a trace came from.
        properties: { id, kind: 'trace', bdPov, nameEn: line.nameEn, nameBn: line.nameBn, status: line.status },
        geometry: { type: 'LineString', coordinates: run },
      });

  if (rule && !traces.length) throw new Error(`${line.nameEn}: ${rule.between.join('/')} found no Natural Earth lines`);

  const rec = byId.get(id) ?? { entries: [], traces: [] };
  rec.entries.push(line);
  rec.traces.push(...traces);
  byId.set(id, rec);
}

/*
 * A hash of each line's MATCHED SOURCE GEOMETRY — the runs as they come out of
 * Natural Earth, clipped to the line's region and joined, but before any
 * simplification.
 *
 * Hashing this rather than the written file is deliberate: changing
 * LINE_SIMPLIFY_METRES is a rendering decision and must not churn all nine
 * hashes, while a Natural Earth boundary moving must. The inputs are pinned and
 * checksum-verified, so these only move when someone bumps the pin — which is
 * exactly the moment to look at whether a line shifted.
 */
const geometryHash = (traces) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(traces.map((t) => t.geometry.coordinates)))
    .digest('hex')
    .slice(0, 16);

const actualGeometry = Object.fromEntries([...byId].map(([id, rec]) => [id, geometryHash(rec.traces)]));

/*
 * Each line's Bangladesh point of view, as a literal rather than a hash: it is
 * a two-value enum and belongs readable in the source. 'absent' is a line with
 * no traces, which has no point of view at all.
 *
 * A line whose traces disagree comes out as "shown+unrecognized", which matches
 * no expectation and so fails — the right outcome, since the seed stores bdPov
 * as a scalar.
 */
const actualBdPov = Object.fromEntries(
  [...byId].map(([id, rec]) => {
    const povs = [...new Set(rec.traces.map((t) => t.properties.bdPov))].sort();
    return [id, povs.length === 0 ? 'absent' : povs.join('+')];
  }),
);

// Simplify once, across every trace, so a merged line is treated as one line.
const allTraces = await simplifyFeatures([...byId.values()].flatMap((r) => r.traces), LINE_SIMPLIFY_METRES);
const tracesById = new Map();
for (const t of allTraces) {
  const list = tracesById.get(t.properties.id) ?? [];
  list.push(t);
  tracesById.set(t.properties.id, list);
}

/*
 * HOW MANY TRACES EACH LINE MUST HAVE.
 *
 * radcliffe's Punjab sector and loc are both IND/PAK: the only thing telling
 * them apart is a featurecla string. Dropping that filter once moved the total
 * from 12 to 13 and shifted loc by three points, and nothing failed — it was
 * caught only because a number was noticed.
 *
 * A Natural Earth reclassification would merge or swap two lines just as
 * quietly. These counts are the tripwire.
 */
/*
 * The same tripwire for shape rather than count. A boundary can move without
 * changing how many segments it splits into, and the counts alone would not
 * see it. These are hashes of the matched source geometry before
 * simplification, so changing LINE_SIMPLIFY_METRES does not churn them.
 */
const EXPECTED_GEOMETRY = {
  mcmahon: 'b04c9ebd196339a4',
  radcliffe: '31f258d1964cedc1',
  durand: '151646968f622957',
  loc: 'f63ad8a7647f8c65',
  koreanDmz: 'a48d0bd366b5d4cf',
  greenLine: 'c612db704d988b09',
  // The three lines that trace nothing all hash the empty list, which is the
  // same value on purpose: it moves the moment any of them gains geometry.
  berlinWall: '4f53cda18c2baa0c',
  parallel17: '4f53cda18c2baa0c',
  sykesPicot: '4f53cda18c2baa0c',
};

/*
 * The third pin, and the last silent hole. bdPov is derived from Natural
 * Earth's FCLASS_BD, so a pin bump could flip a line from recognised to
 * unrecognised without moving a coordinate or changing a segment count, and
 * neither of the other two checks would see it.
 *
 * Kept separate from the geometry hash rather than folded in, so that "the line
 * moved" and "the classification changed" stay distinguishable — they call for
 * different responses — and so the geometry hashes keep meaning exactly what
 * their name says.
 *
 * status, nameEn and nameBn need no pin: they are authored in data.js and
 * cannot change under the build.
 */
/*
 * One entry per line whose geometry comes FROM NATURAL EARTH, and no others.
 *
 * It used to carry 'absent' for the lines that trace nothing, which pinned a
 * word rather than a fact: 'absent' was true of a line with no geometry, a
 * line this repo generated, and a line whose classification had silently
 * vanished, and the pin could not tell them apart. A line that is not Natural
 * Earth's has no point of view to pin, so it is not listed — and the
 * present-if-and-only-if check below is what makes that safe to rely on.
 */
const EXPECTED_BDPOV = {
  mcmahon: 'shown',
  radcliffe: 'shown',
  durand: 'shown',
  loc: 'shown',
  koreanDmz: 'shown',
  greenLine: 'unrecognized',
};

const EXPECTED_TRACES = {
  mcmahon: 2,
  radcliffe: 3,
  durand: 1,
  loc: 1,
  koreanDmz: 1,
  greenLine: 4,
  berlinWall: 0,
  parallel17: 0,
  sykesPicot: 0,
};

const driftErrors = [];
for (const [id, expected] of Object.entries(EXPECTED_TRACES)) {
  const actual = (tracesById.get(id) ?? []).length;
  if (actual !== expected) driftErrors.push(`${id}: expected ${expected} trace(s), got ${actual}`);
}
for (const id of tracesById.keys())
  if (!(id in EXPECTED_TRACES)) driftErrors.push(`${id}: traced but has no entry in EXPECTED_TRACES`);
const expectedTotal = Object.values(EXPECTED_TRACES).reduce((a, b) => a + b, 0);
if (allTraces.length !== expectedTotal)
  driftErrors.push(`total: expected ${expectedTotal} trace(s), got ${allTraces.length}`);
// A line can keep its segment count and still be reshaped, which the counts
// alone would not see.
for (const [id, expected] of Object.entries(EXPECTED_GEOMETRY)) {
  const actual = actualGeometry[id];
  if (actual === undefined) driftErrors.push(`${id}: in EXPECTED_GEOMETRY but the build produced no such line`);
  else if (actual !== expected) driftErrors.push(`${id}: expected geometry ${expected}, got ${actual}`);
}
for (const id of Object.keys(actualGeometry))
  if (!(id in EXPECTED_GEOMETRY)) driftErrors.push(`${id}: traced but has no entry in EXPECTED_GEOMETRY`);

// A reclassification moves neither a coordinate nor a count.
for (const [id, expected] of Object.entries(EXPECTED_BDPOV)) {
  const actual = actualBdPov[id];
  if (actual === undefined) driftErrors.push(`${id}: in EXPECTED_BDPOV but the build produced no such line`);
  else if (actual !== expected) driftErrors.push(`${id}: expected bdPov ${expected}, got ${actual}`);
}
// 'absent' means the line traced nothing from Natural Earth, so there is no
// point of view to pin and it must not be listed. A line that starts tracing
// fails here rather than quietly acquiring a classification nobody pinned.
for (const [id, actual] of Object.entries(actualBdPov)) {
  if (actual === 'absent' && id in EXPECTED_BDPOV)
    driftErrors.push(`${id}: pinned in EXPECTED_BDPOV but traces nothing from Natural Earth`);
  if (actual !== 'absent' && !(id in EXPECTED_BDPOV))
    driftErrors.push(`${id}: traces Natural Earth (bdPov ${actual}) but has no entry in EXPECTED_BDPOV`);
}

if (driftErrors.length)
  throw new Error(`the source data or a match rule moved under this build:\n  ${driftErrors.join('\n  ')}`);

/**
 * The merged line's Bengali name: the sector names with the parenthetical
 * dropped. A stem of strings that already exist, not new content — and if the
 * sectors ever disagree on the stem this fails rather than picking one.
 */
function mergedNameBn(entries) {
  const stems = [...new Set(entries.map((e) => e.nameBn.replace(/\s*\(.*\)\s*$/, '')))];
  if (stems.length !== 1) throw new Error(`sectors disagree on the merged nameBn stem: ${stems.join(' / ')}`);
  return stems[0];
}

// ---- OpenStreetMap geometry -------------------------------------------------
// Contiguous ways are joined so one record does not carry ten fragments where
// the source means two runs of coastline-to-coastline boundary.
const osmById = new Map();
const osmFeatures = [];
for (const id of Object.keys(OSM_DRAWN)) {
  const runs = osmExtract.features.filter((f) => f.properties.id === id).map((f) => f.geometry.coordinates);
  if (!runs.length) throw new Error(`${id}: OSM_DRAWN names it but the extract has no ways for it`);
  const traces = joinRuns(runs).map((run) => ({
    type: 'Feature',
    properties: { id, kind: 'trace' },
    geometry: { type: 'LineString', coordinates: run },
  }));
  osmById.set(id, traces);
  osmFeatures.push(...traces);
}

/*
 * The same two tripwires the Natural Earth lines have, for the same reasons:
 * a count catches a run splitting or merging, a hash catches it moving
 * without changing how many pieces it is in. Hashed before simplification,
 * so a rendering decision does not churn them.
 */
const EXPECTED_OSM_TRACES = { northernLimitLine: 2 };
const EXPECTED_OSM_GEOMETRY = { northernLimitLine: 'a6e2db9b1fbdd77f' };

for (const [id, expected] of Object.entries(EXPECTED_OSM_TRACES)) {
  const actual = (osmById.get(id) ?? []).length;
  if (actual !== expected) driftErrors.push(`${id}: expected ${expected} OSM trace(s), got ${actual}`);
}
for (const [id, expected] of Object.entries(EXPECTED_OSM_GEOMETRY)) {
  const actual = geometryHash(osmById.get(id) ?? []);
  if (actual !== expected) driftErrors.push(`${id}: expected OSM geometry ${expected}, got ${actual}`);
}
for (const id of osmById.keys()) {
  if (!(id in EXPECTED_OSM_TRACES)) driftErrors.push(`${id}: drawn from OSM but has no entry in EXPECTED_OSM_TRACES`);
  if (!(id in EXPECTED_OSM_GEOMETRY)) driftErrors.push(`${id}: drawn from OSM but has no entry in EXPECTED_OSM_GEOMETRY`);
}
if (driftErrors.length)
  throw new Error(`the source data or a match rule moved under this build:\n  ${driftErrors.join('\n  ')}`);

// ---- generated geometry -----------------------------------------------------
// Computed from the constants above, so there is nothing to pin: these cannot
// move unless someone edits GENERATED, and that edit is the review.
const generatedFeatures = [];
const generatedById = new Map();
for (const [id, spec] of Object.entries(GENERATED)) {
  if (spec.value === null) continue; // position not settled: draw nothing
  const feature = {
    type: 'Feature',
    properties: { id, kind: 'generated' },
    geometry: generateLine(spec.axis, spec.value, spec.span),
  };
  generatedFeatures.push(feature);
  generatedById.set(id, [feature]);
}

/*
 * WHERE EACH RECORD'S GEOMETRY CAME FROM.
 *
 * Derived rather than authored: the build is the only thing that knows, and a
 * hand-written value would be one more thing to keep in step. 'osm' is in the
 * vocabulary and unused — nothing here comes from OpenStreetMap yet.
 *
 * This exists to give bdPov a definition that cannot drift. bdPov describes
 * what Natural Earth's Bangladesh point-of-view file shows, so it is
 * meaningless for a line this repo computed, and absent rather than null:
 * there is no decision pending, the field simply does not apply.
 */
function geometrySourceFor(id, traces) {
  const generated = generatedById.has(id);
  if (traces.length && generated)
    throw new Error(`${id}: has both Natural Earth traces and a generated line — its geometry source is ambiguous`);
  if (traces.length) return 'naturalEarth';
  if (generated) return 'generated';
  return 'none';
}

// ---- lines.seed.json --------------------------------------------------------
const seed = {};
for (const [id, rec] of byId) {
  const traces = tracesById.get(id) ?? [];
  const merged = MERGED[id];
  const single = rec.entries.length === 1 ? rec.entries[0] : null;

  const povs = [...new Set(traces.map((t) => t.properties.bdPov))];
  const statuses = [...new Set(rec.entries.map((e) => e.status))];
  if (statuses.length > 1) throw new Error(`${id}: merged entries disagree on status (${statuses.join(', ')})`);

  const generated = GENERATED[id];
  seed[id] = {
    id,
    nameEn: merged?.nameEn ?? single.nameEn,
    // null means "no source value", the repo's convention for a fact that is
    // real but not yet settled. Never a guess, never a derived string.
    nameBn: single ? single.nameBn : mergedNameBn(rec.entries),
    kind: KIND[id] ?? null,
    status: statuses[0],
    countries: merged?.countries ?? (BETWEEN[single.nameEn] ? [...BETWEEN[single.nameEn]] : []),
    labelAt: labelAnchor(traces, single ? single.coords : null),
    // A note that described the line as undrawn stops being true the moment
    // the line is drawn. Nulled rather than reworded: the replacement is new
    // prose and has to be approved, not slipped in by the build.
    noteBn: generated ? null : single ? single.note : null,
    hasTrace: traces.length > 0,
    hasGeometry: traces.length > 0 || generatedById.has(id),
    geometrySource: geometrySourceFor(id, traces),
  };
  if (generated?.frame) seed[id].frame = generated.frame;
  else if (MARKER_FRAMES[id]) seed[id].frame = MARKER_FRAMES[id];
  else if (CONTEXT_FRAMES[id]) seed[id].frame = CONTEXT_FRAMES[id];
  // establishedBn is always present, value or null. endedBn only where the line
  // ceased: absent means not applicable, which is not the same as unverified.
  const dates = DATES[id];
  if (!dates) throw new Error(`${id}: no entry in DATES`);
  seed[id].establishedBn = dates.establishedBn;
  if ('endedBn' in dates) seed[id].endedBn = dates.endedBn;
  // bdPov describes traces, so a line with none simply has no bdPov: absent,
  // not null. Null would put it on the pending list as if a decision were
  // owed, and none is.
  if (povs.length === 1) seed[id].bdPov = povs[0];
  else if (povs.length > 1) throw new Error(`${id}: traces disagree on bdPov (${povs.join(', ')})`);

  if (REVIEW[id]) seed[id].review = REVIEW[id];
  if (!single)
    seed[id].sectors = rec.entries.map((e) => ({
      nameEn: e.nameEn,
      nameBn: e.nameBn,
      noteBn: e.note,
      labelAt: e.coords,
      countries: BETWEEN[e.nameEn] ? [...BETWEEN[e.nameEn]] : [],
    }));
}

/*
 * Records that exist only as generated lines — no entry in data.js, so every
 * field comes from GENERATED. Their Bengali is null on purpose: a name or a
 * description written here would be new content, and new content is proposed
 * and approved rather than built.
 */
for (const [id, spec] of Object.entries(GENERATED)) {
  if (seed[id]) continue; // already built from data.js, geometry folded in above
  const features = generatedById.get(id) ?? [];
  // The midpoint of the drawn segment. Derived from the geometry, so it
  // cannot disagree with where the line is; a line not yet drawn has its
  // span's midpoint, which is still a real point on the meridian.
  const mid = ([from, to]) => Number((from + (to - from) / 2).toFixed(5));
  const labelAt =
    spec.axis === 'parallel' ? [mid(spec.span), spec.value] : [spec.value, mid(spec.span)];

  seed[id] = {
    id,
    nameEn: spec.nameEn,
    ...(spec.nameBn ? { nameBn: spec.nameBn } : {}),
    kind: KIND[id] ?? null,
    status: spec.status,
    countries: [...spec.countries],
    labelAt: spec.value === null ? null : labelAt,
    noteBn: null,
    hasTrace: false,
    hasGeometry: features.length > 0,
    geometrySource: geometrySourceFor(id, []),
    frame: spec.frame,
    establishedBn: spec.establishedBn,
  };
  if (spec.sources) seed[id].sources = spec.sources;
  // The entry's own note wins: it is written beside the value it explains.
  const note = spec.review ?? REVIEW[id];
  if (note) seed[id].review = note;
}

/*
 * Records drawn from the committed OpenStreetMap extract. geometrySource is
 * 'osm', so bdPov does not apply and the present-if-and-only-if assertion
 * below proves it stays absent.
 */
for (const [id, spec] of Object.entries(OSM_DRAWN)) {
  if (seed[id]) throw new Error(`${id}: already built — an OSM record cannot share an id`);
  const traces = osmById.get(id) ?? [];
  seed[id] = {
    id,
    nameEn: spec.nameEn,
    ...(spec.nameBn ? { nameBn: spec.nameBn } : {}),
    kind: KIND[id] ?? null,
    status: spec.status,
    countries: [...spec.countries],
    // Derived from the drawn geometry, so the label cannot sit off the line.
    labelAt: labelAnchor(traces, null),
    noteBn: null,
    // hasTrace means a NATURAL EARTH trace, which this is not. hasGeometry is
    // what the map keys off, and it is true.
    hasTrace: false,
    hasGeometry: traces.length > 0,
    geometrySource: 'osm',
    establishedBn: null,
    // No frame on purpose: with none, fitBounds unions every feature of the
    // record, which is what a two-segment line needs.
    sources: {
      labelAt: [
        {
          title: 'OpenStreetMap ways named 북방한계선 (Northern Limit Line)',
          publisher: 'OpenStreetMap contributors, ODbL 1.0',
          url: 'https://www.openstreetmap.org/relation/1629004',
          states: 'Mapped as a national maritime boundary: boundary=administrative, admin_level=2, border_type=nation, maritime=yes, left:country=North Korea, right:country=South Korea. Committed as tools/sources/osm-border-lines.geojson.',
        },
        {
          title: 'Northern Limit Line',
          publisher: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Northern_Limit_Line',
          states: 'A disputed maritime demarcation line in the Yellow Sea between North and South Korea, with a corresponding line in the East Sea.',
        },
      ],
    },
  };
}

/*
 * Records with no geometry at all — marked with a point, or held back with no
 * point where the extent could not be established from two sources. Nothing
 * here is traced or generated, so geometrySource is 'none' and bdPov does not
 * apply. Bengali is null throughout: the names come from the BCS corpus.
 */
for (const [id, spec] of Object.entries(MARKER_ONLY)) {
  if (seed[id]) throw new Error(`${id}: already built — a marker-only record cannot share an id`);
  seed[id] = {
    id,
    nameEn: spec.nameEn,
    ...(spec.nameBn ? { nameBn: spec.nameBn } : {}),
    kind: KIND[id] ?? null,
    status: spec.status,
    countries: [],
    labelAt: spec.labelAt ?? null,
    noteBn: null,
    hasTrace: false,
    hasGeometry: false,
    geometrySource: 'none',
    establishedBn: null,
  };
  if (spec.frame) seed[id].frame = spec.frame;
  // The citations for the feature's documented extent, keyed by the field
  // they justify. Seed only — never shipped, never near a student.
  if (spec.sources) seed[id].sources = spec.sources;
  if (spec.review) seed[id].review = spec.review;
}

/*
 * ONE AUTHORITATIVE SOURCE PER CLAIM, and the search stops there. A cited
 * field needs at least one citation; a field that happens to carry two (the
 * records written under the older two-source rule) must not carry them from
 * the same host, because one host is one source however many pages it has.
 * Corroboration is not swept for, and the older second citations are left in
 * place rather than deleted, since removing provenance helps nobody.
 */
for (const [id, rec] of Object.entries(seed)) {
  for (const [field, cites] of Object.entries(rec.sources ?? {})) {
    if (!Array.isArray(cites) || cites.length < 1)
      throw new Error(`${id}.sources.${field}: needs at least one citation, got ${Array.isArray(cites) ? 0 : typeof cites}`);
    const hosts = cites.map((c) => new URL(c.url).host);
    if (new Set(hosts).size !== hosts.length)
      throw new Error(`${id}.sources.${field}: two citations from ${hosts.join(', ')} — one host is one source`);
  }
  // A point that was placed on the strength of an extent must say whose.
  if (rec.labelAt && !rec.hasGeometry && !rec.sources?.labelAt && !(id in DATES))
    throw new Error(`${id}: has a point but no citation for the extent it sits on`);
}

// Nothing may reach the seed unclassified: the picker groups on kind, and a
// record with no kind would simply not appear in either group.
for (const [id, rec] of Object.entries(seed))
  if (!rec.kind) throw new Error(`${id}: no entry in KIND`);

/*
 * A record with no line geometry is drawn as a point marker instead, so it
 * needs a point to sit on and a box to fit to. Anything with neither would be
 * silently missing from the map, which is the one outcome this rule exists to
 * prevent — so it fails the build and gets reported rather than vanishing.
 *
 * tordesillas is the deliberate exception: its longitude is unsettled, so it
 * has no honest point to mark. It is listed here so the gap stays visible.
 */
/*
 * bdPov MEANS ONE THING: what Natural Earth's Bangladesh point-of-view
 * boundary file shows for this record's traces. So it is present exactly when
 * the geometry came from that file, and absent — not null — otherwise. Absent
 * because it does not apply, not because a decision is owed.
 */
for (const [id, rec] of Object.entries(seed)) {
  const hasBdPov = 'bdPov' in rec;
  const isNaturalEarth = rec.geometrySource === 'naturalEarth';
  if (hasBdPov !== isNaturalEarth)
    throw new Error(
      `${id}: bdPov is ${hasBdPov ? `present (${JSON.stringify(rec.bdPov)})` : 'absent'} but geometrySource is ${JSON.stringify(rec.geometrySource)} — bdPov is present if and only if the source is "naturalEarth"`,
    );
}

const NO_POINT_YET = ['purpleLine', 'parallel90'];
for (const [id, rec] of Object.entries(seed)) {
  if (rec.hasGeometry || NO_POINT_YET.includes(id)) continue;
  if (!rec.labelAt) throw new Error(`${id}: no line geometry and no labelAt — it would not appear on the map at all`);
  if (!rec.frame) throw new Error(`${id}: no line geometry and no frame — selecting it would not move the camera. Add one to MARKER_FRAMES.`);
}
for (const id of NO_POINT_YET)
  if (seed[id]?.labelAt) throw new Error(`${id}: listed as having no point yet, but it now has a labelAt — drop it from NO_POINT_YET`);
for (const [id, rec] of Object.entries(seed)) {
  const englishFinal = ENGLISH_NAME_FINAL.includes(id);
  if (rec.nameBn === null)
    throw new Error(`${id}: nameBn is null — a name is either supplied or, by decision, English-final; it is never pending`);
  if (englishFinal && 'nameBn' in rec)
    throw new Error(`${id}: listed as ENGLISH_NAME_FINAL but carries a nameBn — take it off the list`);
  if (englishFinal && !rec.nameEn) throw new Error(`${id}: English-final but has no nameEn to show`);
  if (!englishFinal && !(typeof rec.nameBn === 'string' && rec.nameBn.length))
    throw new Error(`${id}: has no Bengali name and is not listed as ENGLISH_NAME_FINAL`);
}

// ---- countries --------------------------------------------------------------
const wanted = [...new Set(Object.values(seed).flatMap((r) => r.countries))].sort();
const countriesFc = readSource('ne_10m_admin_0_countries_bdg.geojson');
// NAME_EN / NAME_BN / ADM0_A3 are the same fields build-world.mjs reads for
// country_labels, so the two cannot disagree on a country's Bengali name.
const byCode = new Map(countriesFc.features.map((f) => [f.properties.ADM0_A3, f]));

const resolved = [];
const unresolved = [];
for (const code of wanted) {
  const f = byCode.get(code);
  if (f) resolved.push({ code, feature: f });
  else unresolved.push(code);
}

const countryFeatures = await simplifyFeatures(
  resolved.map(({ feature }) => ({
    type: 'Feature',
    properties: { id: feature.properties.ADM0_A3 },
    geometry: feature.geometry,
  })),
  COUNTRY_SIMPLIFY_METRES,
);

// One label point per country, from the simplified polygon rather than from a
// hand-placed guess — see innerPoints for why it is a pole of inaccessibility.
const countryLabelPoints = await innerPoints(countryFeatures);

const countrySeed = {};
for (const { feature } of resolved) {
  const p = feature.properties;
  countrySeed[p.ADM0_A3] = {
    id: p.ADM0_A3,
    nameEn: p.NAME_EN,
    nameBn: p.NAME_BN,
    labelAt: countryLabelPoints[p.ADM0_A3],
  };
}

// ---- write ------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const write = (name, data) => {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, name.endsWith('.seed.json') ? 2 : 0) + '\n');
  return `${name}: ${(fs.statSync(file).size / 1024).toFixed(1)} KB`;
};

const sizes = [
  // Traced first, then generated, so the file reads in the order the two
  // kinds were added rather than interleaved by id.
  write('lines.geojson', { type: 'FeatureCollection', features: [...allTraces, ...osmFeatures, ...generatedFeatures] }),
  write('lines.seed.json', seed),
  write('countries.geojson', { type: 'FeatureCollection', features: countryFeatures }),
  write('countries.seed.json', countrySeed),
];

// ---- report -----------------------------------------------------------------
console.log('wrote data-sources/border-lines/');
sizes.forEach((s) => console.log('  ' + s));

console.log(`\nrecords: ${Object.keys(seed).length}   traces: ${allTraces.length}`);
for (const [id, r] of Object.entries(seed))
  console.log(
    `  ${id.padEnd(12)}${String((tracesById.get(id) ?? []).length).padStart(2)} trace(s)  hasTrace ${String(r.hasTrace).padEnd(6)}${r.countries.length ? r.countries.join(' / ') : '(no countries — no match rule)'}`,
  );

console.log(`\ncountries wanted: ${wanted.length}   resolved: ${resolved.length}   unresolved: ${unresolved.length}`);
for (const code of unresolved) {
  // Reported, never substituted. A code with no polygon is a fact about the
  // Bangladesh point-of-view file, not a typo to correct.
  const elsewhere = countriesFc.features
    .filter((f) => Object.entries(f.properties).some(([k, v]) => /A3/.test(k) && v === code))
    .map((f) => `${JSON.stringify(f.properties.NAME_EN)} (ADM0_A3 ${f.properties.ADM0_A3})`);
  console.log(
    `  UNRESOLVED ${code} — ${elsewhere.length ? "appears only as another country's alternate code: " + elsewhere.join('; ') : 'no feature in the file carries this code in any A3 field'}`,
  );
}

// ---- the pending list -------------------------------------------------------
// Every null field: real, but not yet settled. Absent fields are not listed,
// because absent means not applicable rather than unverified.
console.log('\nPENDING (null = unverified, needs a decision):');
let pending = 0;
for (const [id, r] of Object.entries(seed))
  for (const [k, v] of Object.entries(r))
    if (v === null) {
      console.log(`  ${id}.${k}`);
      pending++;
    }
console.log(`  total pending: ${pending}`);
