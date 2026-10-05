import * as THREE from 'three';

const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _d = new THREE.Vector3(), _pd = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// Orient a bone (whose rest direction is -Y) so that it points from `from` to `to`,
// twisting so its local +Z faces roughly toward `hint`. Sets local quaternion.
export function aimBone(bone, from, to, hint) {
  _y.subVectors(from, to).normalize();          // +Y points back toward the parent joint
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_q));
}

// Two-bone IK in world space. upper/lower are bone Groups; lengths a,b.
// target & pole are world-space Vector3. Returns elbow world position (reused vector).
export function solveTwoBone(upper, lower, a, b, target, pole, twistHint) {
  upper.updateWorldMatrix(true, false);
  upper.getWorldPosition(_S);
  _d.subVectors(target, _S);
  let dist = _d.length();
  const maxR = (a + b) * 0.999;
  dist = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), maxR);
  _d.normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _pd.subVectors(pole, _S);
  _pd.addScaledVector(_d, -_pd.dot(_d));
  if (_pd.lengthSq() < 1e-8) _pd.set(0, 0, 1);
  _pd.normalize();
  _E.copy(_S).addScaledVector(_d, a * cosA).addScaledVector(_pd, a * sinA);
  const T = _tmpT.copy(_S).addScaledVector(_d, dist);
  aimBone(upper, _S, _E, twistHint || _pd);
  upper.updateWorldMatrix(false, false);
  lower.updateWorldMatrix(false, false);
  aimBone(lower, _E, T, twistHint || _pd);
  return _E;
}
const _tmpT = new THREE.Vector3();
