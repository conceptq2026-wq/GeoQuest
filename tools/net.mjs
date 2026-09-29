// The one User-Agent every request from a tool sends (the user's rule,
// 2026-09-29). Wikimedia asks for contact details in it: the project page is
// that contact. No e-mail address ever goes in a request, a file or a note;
// tools/verify.mjs fails a tool that fetches without this constant.
export const UA = 'GeoQuest-research/1.0 (https://github.com/conceptq2026-wq/GeoQuest)';
