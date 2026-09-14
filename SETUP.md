# সেটআপ নির্দেশনা / Setup

এই সংস্করণে কোনো CDN বা রানটাইম API কল নেই — সবকিছু লোকালি সার্ভ করা হয়।
তবে ৩টি লাইব্রেরি ফাইল ও ২টি জিওডেটা ফাইল একবার ডাউনলোড করে এই ফোল্ডারে
রাখতে হবে (আমার এই sandbox-এর ইন্টারনেট অ্যাক্সেস বন্ধ, তাই আমি নিজে এখান
থেকে ডাউনলোড করে দিতে পারিনি — আপনার নিজের কম্পিউটার/সার্ভার থেকে একবার
চালান)।

## ১. MapLibre GL JS (মানচিত্র লাইব্রেরি)

```bash
cd vendor
curl -LO https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.mjs
curl -LO https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl-worker.mjs
curl -LO https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.css
cd ..
```

## ২. প্রকৃত উপকূলরেখা ও সীমান্ত ডেটা (Natural Earth, পাবলিক ডোমেইন)

এটা Natural Earth-এর অফিসিয়াল, সার্ভে-ভিত্তিক ১:৫০মি ডেটাসেট — অনুমান করে
আঁকা নয়, তাই "accurate" দাবি করা যায়।

```bash
cd data
curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
mv ne_50m_land.geojson land.geojson

curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_boundary_lines_land.geojson
mv ne_50m_admin_0_boundary_lines_land.geojson borders.geojson
cd ..
```

## ৩. চালানো

কোনো বিল্ড স্টেপ নেই। যেকোনো লোকাল স্ট্যাটিক সার্ভার দিয়ে চালান (সরাসরি
`file://` দিয়ে খুললে ব্রাউজার `fetch()` ব্লক করতে পারে, তাই সার্ভার ব্যবহার
করুন):

```bash
python3 -m http.server 8000
# তারপর ব্রাউজারে খুলুন: http://localhost:8000/index.html
```

## ফাইল না থাকলে কী হবে?

`vendor/` বা `data/` ফাইল অনুপস্থিত থাকলে পেজটি ভেঙে পড়বে না — মানচিত্রের
উপরে একটা নোটিশ দেখাবে কোন ফাইল লাগবে, এবং শিপিং-রুট ও মার্কার তখনও কাজ
করবে (এটা আগের সংস্করণের একটা বাগ ফিক্স — আগে ইন্টারনেট না থাকলে পুরো
মানচিত্র নিঃশব্দে ফাঁকা থেকে যেত, কোনো কারণ না দেখিয়ে)।

## লাইসেন্স নোট

Natural Earth ডেটা CC0 (পাবলিক ডোমেইন)। MapLibre GL JS একটি BSD-3-Clause
লাইসেন্সের ওপেন-সোর্স লাইব্রেরি।
