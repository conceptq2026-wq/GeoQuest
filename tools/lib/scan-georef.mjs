// The NCTB sector map's scan to longitude and latitude, and back: lon and lat
// each affine in the scan's pixels, fitted by least squares over the control
// points of data-sources/liberation-war-1971/sector-trace.json — the
// equirectangular model tools/build-liberation-sectors.mjs reports.

function lsq(rows, ys) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  rows.forEach((r, k) => {
    for (let i = 0; i < 3; i++) {
      b[i] += r[i] * ys[k];
      for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j];
    }
  });
  for (let i = 0; i < 3; i++) {
    const p = A[i][i];
    for (let j = i + 1; j < 3; j++) {
      const f = A[j][i] / p;
      for (let k = i; k < 3; k++) A[j][k] -= f * A[i][k];
      b[j] -= f * b[i];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) x[i] = (b[i] - A[i].slice(i + 1).reduce((s, a, k) => s + a * x[i + 1 + k], 0)) / A[i][i];
  return x;
}

/** { toLonLat([x, y]), toPx([lon, lat]) } for the trace's control points. */
export function scanGeoref(controlPoints) {
  const rows = controlPoints.map((c) => [c.px[0], c.px[1], 1]);
  const X = lsq(rows, controlPoints.map((c) => c.ll[0]));
  const Y = lsq(rows, controlPoints.map((c) => c.ll[1]));
  const det = X[0] * Y[1] - X[1] * Y[0];
  return {
    toLonLat: ([x, y]) => [X[0] * x + X[1] * y + X[2], Y[0] * x + Y[1] * y + Y[2]],
    toPx: ([lon, lat]) => {
      const a = lon - X[2];
      const b = lat - Y[2];
      return [(Y[1] * a - X[1] * b) / det, (-Y[0] * a + X[0] * b) / det];
    },
  };
}
