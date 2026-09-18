/*
|--------------------------------------------------------------------------
| STRAIT DATA
|--------------------------------------------------------------------------
|
| center = [longitude, latitude]
| route  = deliberately simplified shipping-lane visualisation (NOT a
|          survey-grade path). Coastlines and borders come from the
|          shared world tiles, not from here.
| boundaryNote = short human-readable note on the actual political /
|          maritime line near the strait, shown in the info card.
|
*/

export const STRAITS = {
  hormuz: {
    nameEn: 'Strait of Hormuz',
    nameBn: 'হরমুজ প্রণালি',
    center: [56.35, 26.55],
    zoom: 6.8,
    countries: 'Iran — Oman',
    connects: 'Persian Gulf → Gulf of Oman',
    boundaryNote: 'ইরান–ওমান সামুদ্রিক সীমানা (মাসকট অঞ্চল, ১৯৭৪ চুক্তি)',
    route: [
      [52.4, 26.8], [53.3, 26.5], [54.2, 26.3], [55.0, 26.25],
      [55.7, 26.35], [56.25, 26.55], [56.75, 26.35], [57.5, 25.95],
      [58.5, 25.45], [59.6, 24.9],
    ],
  },

  malacca: {
    nameEn: 'Strait of Malacca',
    nameBn: 'মালাক্কা প্রণালি',
    center: [101.2, 3.2],
    zoom: 5.8,
    countries: 'Malaysia — Indonesia',
    connects: 'Andaman Sea → South China Sea',
    boundaryNote: 'মালয়েশিয়া–ইন্দোনেশিয়া সামুদ্রিক সীমানা (১৯৭০ চুক্তি)',
    route: [
      [94.6, 6.4], [96.2, 5.7], [98.0, 4.9], [99.5, 4.0],
      [100.8, 3.2], [102.0, 2.5], [103.1, 1.7], [104.2, 1.2], [105.5, 1.3],
    ],
  },

  babMandeb: {
    nameEn: 'Bab el-Mandeb',
    nameBn: 'বাব-এল-মান্দেব প্রণালি',
    center: [43.35, 12.65],
    zoom: 7,
    countries: 'Yemen — Djibouti / Eritrea',
    connects: 'Red Sea → Gulf of Aden',
    boundaryNote: 'ইয়েমেন ও জিবুতি/ইরিত্রিয়ার আঞ্চলিক জলসীমা',
    route: [
      [42.0, 15.5], [42.3, 14.4], [42.6, 13.5], [43.1, 12.7],
      [43.7, 12.1], [44.5, 11.8], [45.5, 11.6],
    ],
  },

  gibraltar: {
    nameEn: 'Strait of Gibraltar',
    nameBn: 'জিব্রাল্টার প্রণালি',
    center: [-5.55, 35.95],
    zoom: 7.3,
    countries: 'Spain — Morocco',
    connects: 'Atlantic Ocean → Mediterranean Sea',
    boundaryNote: 'স্পেন–মোরক্কো জলসীমা (ইউরোপ–আফ্রিকা বিভাজন)',
    route: [
      [-9.0, 35.7], [-7.7, 35.8], [-6.5, 35.9], [-5.6, 35.95],
      [-4.8, 36.0], [-3.7, 36.1],
    ],
  },

  bosporus: {
    nameEn: 'Bosporus Strait',
    nameBn: 'বসফরাস প্রণালি',
    center: [29.05, 41.12],
    zoom: 8.6,
    countries: 'Türkiye (উভয় তীর)',
    connects: 'Black Sea → Sea of Marmara',
    boundaryNote: 'সম্পূর্ণ তুর্কি জলসীমা — ইউরোপ ও এশিয়ার মহাদেশীয় বিভাজন রেখা',
    route: [
      [29.14, 41.3], [29.1, 41.24], [29.07, 41.18], [29.05, 41.12],
      [29.02, 41.06], [28.98, 41.0],
    ],
  },

  dardanelles: {
    nameEn: 'Dardanelles',
    nameBn: 'দার্দানেলিস প্রণালি',
    center: [26.5, 40.2],
    zoom: 8,
    countries: 'Türkiye (উভয় তীর)',
    connects: 'Sea of Marmara → Aegean Sea',
    boundaryNote: 'সম্পূর্ণ তুর্কি জলসীমা — ইউরোপ ও এশিয়ার মহাদেশীয় বিভাজন রেখা',
    route: [
      [26.75, 40.48], [26.65, 40.38], [26.55, 40.28], [26.45, 40.18],
      [26.3, 40.07], [26.18, 39.98],
    ],
  },

  bering: {
    nameEn: 'Bering Strait',
    nameBn: 'বেরিং প্রণালি',
    center: [-169.0, 65.9],
    zoom: 4.7,
    countries: 'Russia — United States',
    connects: 'Arctic Ocean → Pacific Ocean',
    boundaryNote: 'রাশিয়া–যুক্তরাষ্ট্র সামুদ্রিক সীমানা (১৯৯০ চুক্তি, বিগ ও লিটল ডায়োমিড দ্বীপের মাঝ দিয়ে)',
    route: [
      [-171.5, 68.0], [-170.5, 67.0], [-169.5, 66.2], [-168.8, 65.8],
      [-168.0, 64.8], [-167.0, 63.8],
    ],
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
