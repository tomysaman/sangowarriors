import * as THREE from 'three';

// Closest distance between segments p1-q1 and p2-q2 (Ericson). Writes closest point on seg1 into outC1.
const d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), r = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
export function segSegDist(p1, q1, p2, q2, outC1) {
  d1.subVectors(q1, p1); d2.subVectors(q2, p2); r.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) { s = t = 0; }
  else if (a <= 1e-8) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  if (outC1) outC1.copy(c1);
  return c1.distanceTo(c2);
}

const A = new THREE.Vector3(), B = new THREE.Vector3(), contact = new THREE.Vector3();

// Test a target capsule against a list of weapon segments [[butt,tip],...].
// target: {x,y,z,radius,height}. Returns contact point or null.
export function sweepHits(segments, tx, ty, tz, radius, height) {
  A.set(tx, ty + 0.25, tz); B.set(tx, ty + height, tz);
  let best = 1e9, bestP = null;
  for (const [b, t] of segments) {
    const d = segSegDist(b, t, A, B, contact);
    if (d < radius && d < best) { best = d; bestP = contact.clone(); }
  }
  return bestP;
}
