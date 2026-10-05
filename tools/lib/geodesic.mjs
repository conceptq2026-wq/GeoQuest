/*
| Geodesics on the ellipsoid, for build tools only: Vincenty's direct and
| inverse formulae (T. Vincenty, Survey Review 23(176), 1975), which are
| accurate to well under a millimetre for the distances drawn here. No
| dependency and no network.
|
| The ellipsoid defaults to GRS 80, the one the PCA's hydrographer computed on
| (award, appendix ¶1); WGS 84's flattening differs from it in the eleventh
| significant figure, below anything this module is asked to resolve.
*/

export const GRS80 = { a: 6378137, f: 1 / 298.257222101 };
export const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
export const NM = 1852; // metres in an international nautical mile

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Degrees, minutes, seconds (and a hemisphere letter) to signed decimal degrees. */
export function dms(d, m, s, hemi) {
  const v = d + m / 60 + s / 3600;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

/** Decimal degrees to [d, m, s] with s in seconds (unsigned). */
export function toDms(v) {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = (a - d - m / 60) * 3600;
  return [d, m, s];
}

/**
 * From [lon, lat] along initial azimuth az (degrees clockwise from north) for
 * s metres: returns { point: [lon, lat], azimuth } (final azimuth).
 */
export function direct([lon1, lat1], az, s, { a, f } = GRS80) {
  const b = a * (1 - f);
  const alpha1 = rad(az);
  const sinA1 = Math.sin(alpha1), cosA1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(rad(lat1));
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1), sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosA1);
  const sinAlpha = cosU1 * sinA1;
  const cos2Alpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = s / (b * A), sigmaP, cos2SigmaM, sinSigma, cosSigma;
  for (let i = 0; i < 200; i++) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const dSigma = B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaP = sigma;
    sigma = s / (b * A) + dSigma;
    if (Math.abs(sigma - sigmaP) < 1e-14) break;
  }
  cos2SigmaM = Math.cos(2 * sigma1 + sigma);
  sinSigma = Math.sin(sigma);
  cosSigma = Math.cos(sigma);
  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosA1;
  const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosA1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
  const lambda = Math.atan2(sinSigma * sinA1, cosU1 * cosSigma - sinU1 * sinSigma * cosA1);
  const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
  const L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  const alpha2 = Math.atan2(sinAlpha, -tmp);
  return { point: [lon1 + deg(L), deg(lat2)], azimuth: (deg(alpha2) + 360) % 360 };
}

/** Between two [lon, lat] points: { distance (m), azimuth1, azimuth2 } (degrees). */
export function inverse([lon1, lat1], [lon2, lat2], { a, f } = GRS80) {
  const b = a * (1 - f);
  const L = rad(lon2 - lon1);
  const U1 = Math.atan((1 - f) * Math.tan(rad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(rad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, lambdaP, sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM;
  for (let i = 0; i < 200; i++) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return { distance: 0, azimuth1: 0, azimuth2: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - lambdaP) < 1e-14) break;
  }
  const uSq = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const dSigma = B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
    - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
  const az1 = Math.atan2(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL);
  const az2 = Math.atan2(cosU1 * sinL, -sinU1 * cosU2 + cosU1 * sinU2 * cosL);
  return { distance: b * A * (sigma - dSigma), azimuth1: (deg(az1) + 360) % 360, azimuth2: (deg(az2) + 360) % 360 };
}

/** Points along the geodesic from p1 to p2, about every `step` metres, ends included. */
export function densify(p1, p2, step = 2000, ell = GRS80) {
  const { distance, azimuth1 } = inverse(p1, p2, ell);
  const n = Math.max(1, Math.ceil(distance / step));
  const out = [p1];
  for (let i = 1; i < n; i++) out.push(direct(p1, azimuth1, (distance * i) / n, ell).point);
  out.push(p2);
  return out;
}

/** Points along the geodesic leaving p at azimuth az for s metres, about every `step` metres. */
export function densifyAlong(p, az, s, step = 2000, ell = GRS80) {
  const n = Math.max(1, Math.ceil(s / step));
  const out = [p];
  for (let i = 1; i <= n; i++) out.push(direct(p, az, (s * i) / n, ell).point);
  return out;
}

/**
 * Where the geodesic leaving `from` at azimuth `az` meets the geodesic leaving
 * `pivot` at azimuth `pivotAz`: the distance s along the first at which the
 * azimuth from `pivot` to the point equals `pivotAz` — the PCA hydrographer's
 * own method (award, appendix ¶20). Bisection between s0 and s1 metres.
 */
export function meet(from, az, pivot, pivotAz, s0, s1, ell = GRS80) {
  const g = (s) => {
    let d = inverse(pivot, direct(from, az, s, ell).point, ell).azimuth1 - pivotAz;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  let lo = s0, hi = s1, glo = g(lo);
  if (Math.sign(glo) === Math.sign(g(hi))) throw new Error('meet(): the two geodesics do not cross between the given distances');
  for (let i = 0; i < 200 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2, gm = g(mid);
    if (Math.sign(gm) === Math.sign(glo)) { lo = mid; glo = gm; } else hi = mid;
  }
  const s = (lo + hi) / 2;
  return { point: direct(from, az, s, ell).point, distance: s };
}
