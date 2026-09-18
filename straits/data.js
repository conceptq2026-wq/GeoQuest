/*
|--------------------------------------------------------------------------
| STRAIT DATA
|--------------------------------------------------------------------------
|
| center      = [longitude, latitude]
| frame       = [west, south, east, north] — the first view after picking it:
|               both neighbouring countries and a clear piece of each
|               connected sea. Hand-set on purpose: a frame computed from
|               label positions put Gibraltar at a third of the world.
|               tools/verify.mjs checks the point and both sea labels fall
|               inside it.
| countriesBn = the land either side, Bengali (Natural Earth NAME_BN spellings)
| connectsBn  = what it joins, Bengali, as shown on the card
| seas        = keys into SEAS below — the water bodies it joins, labelled on
|               the map (Layers → Connected seas)
| routeStatus = what the card says about the shipping lane, judged by
|               looking at the mapped OpenStreetMap scheme through the
|               narrows (straits/routes.geojson):
|                 'mapped'  — the scheme through the strait is mapped
|                 'partial' — only pieces of it are mapped
|                 'none'    — nothing mapped; no line is drawn at all
|               Hand-drawn routes were removed on purpose: a guessed line
|               shown as the real channel teaches something false.
| boundaryNote = short human-readable note on the actual political /
|          maritime line near the strait, shown in the info card.
|
*/

/*
|--------------------------------------------------------------------------
| CONNECTED SEAS
|--------------------------------------------------------------------------
|
| Only the seas some passage connects — a label each, at a hand-placed
| point in open water that lies inside every frame showing that sea.
| Names are Bengali content (drafts to be checked against BCS usage).
|
*/

export const SEAS = {
  persianGulf: { nameBn: 'পারস্য উপসাগর', at: [51.3, 27.2] },
  gulfOfOman: { nameBn: 'ওমান উপসাগর', at: [58.8, 24.4] },
  andamanSea: { nameBn: 'আন্দামান সাগর', at: [96.5, 10.5] },
  southChinaSea: { nameBn: 'দক্ষিণ চীন সাগর', at: [109.0, 8.0] },
  redSea: { nameBn: 'লোহিত সাগর', at: [40.2, 17.0] },
  gulfOfAden: { nameBn: 'এডেন উপসাগর', at: [48.5, 12.6] },
  atlantic: { nameBn: 'আটলান্টিক মহাসাগর', at: [-9.3, 35.2] },
  mediterranean: { nameBn: 'ভূমধ্যসাগর', at: [-2.2, 36.3] },
  blackSea: { nameBn: 'কৃষ্ণ সাগর', at: [34.0, 43.4] },
  marmara: { nameBn: 'মারমারা সাগর', at: [28.35, 40.62] },
  aegean: { nameBn: 'ইজিয়ান সাগর', at: [25.0, 38.9] },
  chukchi: { nameBn: 'চুকচি সাগর', at: [-170.5, 69.5] },
  beringSea: { nameBn: 'বেরিং সাগর', at: [-176.0, 59.5] },
};

export const STRAITS = {
  hormuz: {
    nameEn: 'Strait of Hormuz',
    nameBn: 'হরমুজ প্রণালি',
    center: [56.35, 26.55],
    frame: [50.0, 22.5, 60.5, 30.5],
    countriesBn: 'ইরান — ওমান',
    connectsBn: 'পারস্য উপসাগর → ওমান উপসাগর',
    seas: ['persianGulf', 'gulfOfOman'],
    boundaryNote: 'ইরান–ওমান সামুদ্রিক সীমানা (মাসকট অঞ্চল, ১৯৭৪ চুক্তি)',
    routeStatus: 'partial',
  },

  malacca: {
    nameEn: 'Strait of Malacca',
    nameBn: 'মালাক্কা প্রণালি',
    center: [101.2, 3.2],
    frame: [93.5, -1.5, 111.0, 13.5],
    countriesBn: 'মালয়েশিয়া — ইন্দোনেশিয়া',
    connectsBn: 'আন্দামান সাগর → দক্ষিণ চীন সাগর',
    seas: ['andamanSea', 'southChinaSea'],
    boundaryNote: 'মালয়েশিয়া–ইন্দোনেশিয়া সামুদ্রিক সীমানা (১৯৭০ চুক্তি)',
    routeStatus: 'mapped',
  },

  babMandeb: {
    nameEn: 'Bab el-Mandeb',
    nameBn: 'বাব-এল-মান্দেব প্রণালি',
    center: [43.35, 12.65],
    frame: [37.5, 9.0, 50.0, 18.5],
    countriesBn: 'ইয়েমেন — জিবুতি / ইরিত্রিয়া',
    connectsBn: 'লোহিত সাগর → এডেন উপসাগর',
    seas: ['redSea', 'gulfOfAden'],
    boundaryNote: 'ইয়েমেন ও জিবুতি/ইরিত্রিয়ার আঞ্চলিক জলসীমা',
    routeStatus: 'mapped',
  },

  gibraltar: {
    nameEn: 'Strait of Gibraltar',
    nameBn: 'জিব্রাল্টার প্রণালি',
    center: [-5.55, 35.95],
    frame: [-11.0, 33.5, 1.0, 39.5],
    countriesBn: 'স্পেন — মরক্কো',
    connectsBn: 'আটলান্টিক মহাসাগর → ভূমধ্যসাগর',
    seas: ['atlantic', 'mediterranean'],
    boundaryNote: 'স্পেন–মোরক্কো জলসীমা (ইউরোপ–আফ্রিকা বিভাজন)',
    routeStatus: 'mapped',
  },

  bosporus: {
    nameEn: 'Bosporus Strait',
    nameBn: 'বসফরাস প্রণালি',
    center: [29.05, 41.12],
    frame: [26.0, 39.5, 36.0, 44.5],
    countriesBn: 'তুরস্ক (উভয় তীর)',
    connectsBn: 'কৃষ্ণ সাগর → মারমারা সাগর',
    seas: ['blackSea', 'marmara'],
    boundaryNote: 'সম্পূর্ণ তুর্কি জলসীমা — ইউরোপ ও এশিয়ার মহাদেশীয় বিভাজন রেখা',
    routeStatus: 'mapped',
  },

  dardanelles: {
    nameEn: 'Dardanelles',
    nameBn: 'দার্দানেলিস প্রণালি',
    center: [26.5, 40.2],
    frame: [23.0, 38.0, 30.0, 41.5],
    countriesBn: 'তুরস্ক (উভয় তীর)',
    connectsBn: 'মারমারা সাগর → ইজিয়ান সাগর',
    seas: ['marmara', 'aegean'],
    boundaryNote: 'সম্পূর্ণ তুর্কি জলসীমা — ইউরোপ ও এশিয়ার মহাদেশীয় বিভাজন রেখা',
    routeStatus: 'partial',
  },

  bering: {
    nameEn: 'Bering Strait',
    nameBn: 'বেরিং প্রণালি',
    center: [-169.0, 65.9],
    frame: [-180.0, 58.5, -160.0, 70.5],
    countriesBn: 'রাশিয়া — মার্কিন যুক্তরাষ্ট্র',
    connectsBn: 'উত্তর মহাসাগর (চুকচি সাগর) → প্রশান্ত মহাসাগর (বেরিং সাগর)',
    seas: ['chukchi', 'beringSea'],
    boundaryNote: 'রাশিয়া–যুক্তরাষ্ট্র সামুদ্রিক সীমানা (১৯৯০ চুক্তি, বিগ ও লিটল ডায়োমিড দ্বীপের মাঝ দিয়ে)',
    routeStatus: 'none',
  },
};

/*
|--------------------------------------------------------------------------
| FAMOUS NAMED BORDER / DEMARCATION LINES
|--------------------------------------------------------------------------
|
| NOT DRAWN on the straits map (removed 2026-09-18). Kept, with
| straits/famous-lines.geojson and its build step, for a future map of
| boundary lines of its own — move both there when that map is built.
|
| No line geometry is drawn by hand. tools/build-straits-overlay.mjs
| traces each line from Natural Earth 1:10m boundary lines and writes
| straits/famous-lines.geojson — re-run it after editing this list.
|
| match  — which real boundary lines carry the name: the two countries
|          either side (Natural Earth ADM0_LEFT/ADM0_RIGHT) and, where
|          needed, the line class (e.g. 'Line of control').
| region — [minLon, minLat, maxLon, maxLat]; only the part of the matched
|          lines inside this box is traced (e.g. just the Punjab stretch
|          of the India–Pakistan boundary).
| coords — label position used when nothing is traced (historical lines).
|
| status: 'active'     — still a functioning international boundary today
|         'historical' — no longer in force / no longer a live border
|
*/

export const FAMOUS_LINES = [
  {
    nameEn: 'McMahon Line',
    nameBn: 'ম্যাকমাহন লাইন',
    coords: [91.8, 27.6],
    status: 'active',
    note: 'ভারত–চীন (তিব্বত) সীমান্ত রেখা, ১৯১৪ সিমলা কনভেনশন — চীন স্বীকৃতি দেয় না',
    region: [91.0, 27.0, 97.6, 29.6],
    match: { between: ['China', 'India'] },
  },
  {
    nameEn: 'Radcliffe Line (Punjab)',
    nameBn: 'র‍্যাডক্লিফ লাইন (পাঞ্জাব)',
    coords: [74.5, 31.0],
    status: 'active',
    note: 'ভারত–পাকিস্তান বিভাজন রেখা, ১৯৪৭',
    region: [73.3, 29.5, 75.6, 32.8],
    match: { between: ['India', 'Pakistan'], featurecla: 'International boundary' },
  },
  {
    nameEn: 'Radcliffe Line (Bengal)',
    nameBn: 'র‍্যাডক্লিফ লাইন (বঙ্গ)',
    coords: [89.0, 23.5],
    status: 'active',
    note: 'ভারত–পাকিস্তান (পূর্ব বঙ্গ) বিভাজন রেখা, ১৯৪৭ — সম্পূর্ণ ভারত–বাংলাদেশ সীমান্তের ভিত্তি',
    region: [88.0, 20.5, 92.3, 26.8],
    match: { between: ['Bangladesh', 'India'] },
  },
  {
    nameEn: 'Durand Line',
    nameBn: 'ডুরান্ড লাইন',
    coords: [70.1, 33.9],
    status: 'active',
    note: 'আফগানিস্তান–পাকিস্তান সীমান্ত, ১৮৯৩ চুক্তি',
    region: [60.4, 29.0, 74.6, 37.6],
    match: { between: ['Afghanistan', 'Pakistan'] },
  },
  {
    nameEn: 'Line of Control (LoC)',
    nameBn: 'নিয়ন্ত্রণ রেখা (LoC)',
    coords: [74.3, 34.4],
    status: 'active',
    note: 'ভারত–পাকিস্তান, কাশ্মীর — জাতিসংঘ-স্বীকৃত সীমান্ত নয়, বাস্তব নিয়ন্ত্রণ রেখা',
    region: [73.0, 32.0, 75.8, 35.1],
    match: { between: ['India', 'Pakistan'], featurecla: 'Line of control' },
  },
  {
    nameEn: 'Korean DMZ (38th Parallel)',
    nameBn: 'কোরীয় DMZ (৩৮তম প্যারালাল)',
    coords: [127.2, 38.0],
    status: 'active',
    note: 'উত্তর–দক্ষিণ কোরিয়া, ১৯৫৩ যুদ্ধবিরতি রেখা',
    region: [125.9, 37.7, 128.6, 38.7],
    match: { between: ['North Korea', 'South Korea'] },
  },
  {
    nameEn: 'Green Line',
    nameBn: 'গ্রিন লাইন',
    coords: [35.1, 31.9],
    status: 'active',
    note: 'ইসরায়েল–ওয়েস্ট ব্যাংক, ১৯৪৯ যুদ্ধবিরতি রেখা',
    region: [34.15, 31.1, 35.65, 32.7],
    match: { between: ['Israel', 'Palestine'] },
  },
  {
    nameEn: 'Berlin Wall',
    nameBn: 'বার্লিন ওয়াল',
    coords: [13.38, 52.52],
    status: 'historical',
    note:
      '১৯৬১–১৯৮৯, পূর্ব ও পশ্চিম বার্লিনের বিভাজন — বর্তমানে অস্তিত্ব নেই। এই ' +
      'দেয়ালের প্রকৃত পথ কোনো বর্তমান দেশের সীমান্তের সাথে মেলে না, তাই এখানে ' +
      'শুধু একটা রেফারেন্স পয়েন্ট — সম্পূর্ণ রেখা আঁকার জন্য পৃথক হিস্টোরিক্যাল ' +
      'জিআইএস ডেটা লাগবে, যা এই অফলাইন সেটআপে নেই।',
    region: null,
  },
  {
    nameEn: '17th Parallel',
    nameBn: '১৭তম প্যারালাল',
    coords: [106.6, 17.0],
    status: 'historical',
    note:
      'উত্তর–দক্ষিণ ভিয়েতনাম বিভাজন রেখা, ১৯৫৪–১৯৭৫ — বর্তমানে অস্তিত্ব নেই। ' +
      'বর্তমান কোনো সীমান্তের সাথে মেলে না, তাই পূর্ণ রেখা আঁকা হয়নি — রেফারেন্স ' +
      'পয়েন্ট মাত্র।',
    region: null,
  },
  {
    nameEn: 'Sykes–Picot Line',
    nameBn: 'সাইকস–পিকো লাইন',
    coords: [40.0, 35.0],
    status: 'historical',
    note:
      '১৯১৬ ব্রিটিশ–ফরাসি গোপন চুক্তি — আজকের সিরিয়া–ইরাক সীমান্তের ওপর প্রভাব ' +
      'রেখেছে কিন্তু হুবহু এক নয়, তাই পূর্ণ রেখা আঁকা হয়নি — রেফারেন্স পয়েন্ট মাত্র।',
    region: null,
  },
];
