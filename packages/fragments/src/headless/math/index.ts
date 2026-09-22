/**
 * Minimal, dependency-free 3D maths, API-compatible with the subset of
 * three.js that the Fragments geometry construction code relies on.
 *
 * The classes are named after their three.js counterparts (`Vector3`,
 * `Quaternion`, `Matrix4`, `Ray`, `Line3`, `Box3`) so the upstream algorithm
 * files can keep using `THREE.Vector3` and friends with only their import
 * line re-pointed here. `Vec3`/`Quat`/`Mat4` are exported as aliases for the
 * public headless API.
 *
 * `Vector3` deliberately mirrors three.js' full instance surface (with `any`
 * parameters where a three.js type would otherwise be required) so it stays
 * structurally assignable to `THREE.Vector3` in code that has not been
 * re-pointed. Everything operates on the same conventions as three.js:
 * `Matrix4` stores its 16 elements column-major and `set()` takes row-major
 * arguments.
 */

const EPSILON = 0.000001;

class Quaternion {
  readonly isQuaternion = true;
  x: number;
  y: number;
  z: number;
  w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  copy(q: Quaternion): this {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  clone(): this {
    return new Quaternion(this.x, this.y, this.z, this.w) as this;
  }

  identity(): this {
    return this.set(0, 0, 0, 1);
  }

  lengthSq(): number {
    return (
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    let l = this.length();
    if (l === 0) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
    } else {
      l = 1 / l;
      this.x *= l;
      this.y *= l;
      this.z *= l;
      this.w *= l;
    }
    return this;
  }

  multiply(q: Quaternion): this {
    return this.multiplyQuaternions(this, q);
  }

  premultiply(q: Quaternion): this {
    return this.multiplyQuaternions(q, this);
  }

  multiplyQuaternions(a: Quaternion, b: Quaternion): this {
    const qax = a.x;
    const qay = a.y;
    const qaz = a.z;
    const qaw = a.w;
    const qbx = b.x;
    const qby = b.y;
    const qbz = b.z;
    const qbw = b.w;
    this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return this;
  }

  dot(q: Quaternion): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }

  invert(): this {
    return this.conjugate();
  }

  conjugate(): this {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    return this;
  }

  setFromAxisAngle(axis: any, angle: number): this {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }

  setFromUnitVectors(from: any, to: any): this {
    let r = from.x * to.x + from.y * to.y + from.z * to.z + 1;
    if (r < EPSILON) {
      r = 0;
      if (Math.abs(from.x) > Math.abs(from.z)) {
        this.x = -from.y;
        this.y = from.x;
        this.z = 0;
        this.w = r;
      } else {
        this.x = 0;
        this.y = -from.z;
        this.z = from.y;
        this.w = r;
      }
    } else {
      this.x = from.y * to.z - from.z * to.y;
      this.y = from.z * to.x - from.x * to.z;
      this.z = from.x * to.y - from.y * to.x;
      this.w = r;
    }
    return this.normalize();
  }

  angleTo(q: Quaternion): number {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }

  slerp(qb: Quaternion, t: number): this {
    return this.slerpQuaternions(this, qb, t);
  }

  slerpQuaternions(qa: Quaternion, qb: Quaternion, t: number): this {
    return this.copy(qa).slerpInternal(qb, t);
  }

  private slerpInternal(qb: Quaternion, t: number): this {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;
    let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    if (cosHalfTheta < 0) {
      this.w = -qb.w;
      this.x = -qb.x;
      this.y = -qb.y;
      this.z = -qb.z;
      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }
    if (cosHalfTheta >= 1) {
      this.w = w;
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    const sqrSinHalfTheta = 1 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t;
      this.w = s * w + t * this.w;
      this.x = s * x + t * this.x;
      this.y = s * y + t * this.y;
      this.z = s * z + t * this.z;
      return this.normalize();
    }
    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    this.w = w * ratioA + this.w * ratioB;
    this.x = x * ratioA + this.x * ratioB;
    this.y = y * ratioA + this.y * ratioB;
    this.z = z * ratioA + this.z * ratioB;
    return this;
  }

  equals(q: Quaternion): boolean {
    return q.x === this.x && q.y === this.y && q.z === this.z && q.w === this.w;
  }

  toArray(array: any = [], offset = 0): any {
    if (Array.isArray(array)) {
      array[offset] = this.x;
      array[offset + 1] = this.y;
      array[offset + 2] = this.z;
      array[offset + 3] = this.w;
    } else {
      array[offset] = this.x;
      array[offset + 1] = this.y;
      array[offset + 2] = this.z;
      array[offset + 3] = this.w;
    }
    return array;
  }

  fromArray(array: number[] | ArrayLike<number>, offset = 0): this {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];
    return this;
  }

  fromBufferAttribute(attribute: any, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    this.w = attribute.getW(index);
    return this;
  }

  random(): this {
    this.set(Math.random(), Math.random(), Math.random(), Math.random());
    return this.normalize();
  }
}

class Vector3 {
  readonly isVector3 = true;
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setScalar(scalar: number): this {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }

  setX(x: number): this {
    this.x = x;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  setZ(z: number): this {
    this.z = z;
    return this;
  }

  setComponent(index: number, value: number): this {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      default:
        throw new Error(`index is out of range: ${index}`);
    }
    return this;
  }

  getComponent(index: number): number {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw new Error(`index is out of range: ${index}`);
    }
  }

  clone(): this {
    return new Vector3(this.x, this.y, this.z) as this;
  }

  copy(v: any): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v: any): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addScalar(s: number): this {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }

  addVectors(a: any, b: any): this {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  addScaledVector(v: any, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  sub(v: any): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subScalar(s: number): this {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }

  subVectors(a: any, b: any): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  multiply(v: any): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  multiplyScalar(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  multiplyVectors(a: any, b: any): this {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }

  applyEuler(_euler: any): this {
    return this;
  }

  applyAxisAngle(axis: any, angle: number): this {
    const q = new Quaternion().setFromAxisAngle(axis, angle);
    return this.applyQuaternion(q);
  }

  applyNormalMatrix(m: any): this {
    return this.applyMatrix3(m).normalize();
  }

  applyQuaternion(q: any): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);

    // v + q.w * t + cross(q.xyz, t)
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }

  project(_camera: any): this {
    return this;
  }

  unproject(_camera: any): this {
    return this;
  }

  transformDirection(m: any): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }

  divide(v: any): this {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }

  divideScalar(scalar: number): this {
    return this.multiplyScalar(1 / scalar);
  }

  min(v: any): this {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }

  max(v: any): this {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }

  clamp(min: any, max: any): this {
    this.x = Math.max(min.x, Math.min(max.x, this.x));
    this.y = Math.max(min.y, Math.min(max.y, this.y));
    this.z = Math.max(min.z, Math.min(max.z, this.z));
    return this;
  }

  clampScalar(minVal: number, maxVal: number): this {
    this.x = Math.max(minVal, Math.min(maxVal, this.x));
    this.y = Math.max(minVal, Math.min(maxVal, this.y));
    this.z = Math.max(minVal, Math.min(maxVal, this.z));
    return this;
  }

  clampLength(min: number, max: number): this {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(
      Math.max(min, Math.min(max, length)),
    );
  }

  floor(): this {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }

  ceil(): this {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }

  round(): this {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }

  roundToZero(): this {
    this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
    this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
    this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  dot(v: any): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  manhattanLength(): number {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }

  normalize(): this {
    return this.divideScalar(this.length() || 1);
  }

  setLength(length: number): this {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: any, alpha: number): this {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }

  lerpVectors(v1: any, v2: any, alpha: number): this {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }

  cross(v: any): this {
    return this.crossVectors(this, v);
  }

  crossVectors(a: any, b: any): this {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  projectOnVector(v: any): this {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }

  projectOnPlane(planeNormal: any): this {
    _v1.copy(this).projectOnVector(planeNormal);
    return this.sub(_v1);
  }

  reflect(normal: any): this {
    return this.sub(_v1.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  angleTo(v: any): number {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }

  distanceTo(v: any): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v: any): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  manhattanDistanceTo(v: any): number {
    return (
      Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z)
    );
  }

  setFromSpherical(_s: any): this {
    return this;
  }

  setFromSphericalCoords(_r: number, _phi: number, _theta: number): this {
    return this;
  }

  setFromCylindrical(_s: any): this {
    return this;
  }

  setFromCylindricalCoords(_radius: number, _theta: number, _y: number): this {
    return this;
  }

  setFromMatrixPosition(m: any): this {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }

  setFromMatrixScale(m: any): this {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }

  setFromMatrixColumn(matrix: any, index: number): this {
    return this.fromArray(matrix.elements, index * 4);
  }

  setFromMatrix3Column(matrix: any, index: number): this {
    return this.fromArray(matrix.elements, index * 3);
  }

  *[Symbol.iterator](): Iterator<number> {
    yield this.x;
    yield this.y;
    yield this.z;
  }

  setFromEuler(_e: any): this {
    return this;
  }

  setFromColor(_c: any): this {
    return this;
  }

  applyMatrix3(m: any): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }

  applyMatrix4(m: any): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }

  equals(v: any): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }

  fromArray(array: number[] | ArrayLike<number>, offset = 0): this {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }

  toArray(array?: any, offset = 0): any {
    const out = array === undefined ? [] : array;
    out[offset] = this.x;
    out[offset + 1] = this.y;
    out[offset + 2] = this.z;
    return out;
  }

  fromBufferAttribute(attribute: any, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }

  random(): this {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }

  randomDirection(): this {
    return this;
  }
}

class Matrix3 {
  elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  set(
    n11: number,
    n12: number,
    n13: number,
    n21: number,
    n22: number,
    n23: number,
    n31: number,
    n32: number,
    n33: number,
  ): this {
    const te = this.elements;
    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;
    return this;
  }

  identity(): this {
    return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }

  copy(m: any): this {
    const te = this.elements;
    const me = m.elements;
    for (let i = 0; i < 9; i++) te[i] = me[i];
    return this;
  }
}

class Matrix4 {
  readonly isMatrix4 = true;
  elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  set(
    n11: number,
    n12: number,
    n13: number,
    n14: number,
    n21: number,
    n22: number,
    n23: number,
    n24: number,
    n31: number,
    n32: number,
    n33: number,
    n34: number,
    n41: number,
    n42: number,
    n43: number,
    n44: number,
  ): this {
    const te = this.elements;
    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;
    return this;
  }

  identity(): this {
    return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  copy(m: any): this {
    const te = this.elements;
    const me = m.elements;
    for (let i = 0; i < 16; i++) te[i] = me[i];
    return this;
  }

  clone(): this {
    return new Matrix4().copy(this) as this;
  }

  multiply(m: any): this {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: any): this {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: any, b: any): this {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0];
    const a12 = ae[4];
    const a13 = ae[8];
    const a14 = ae[12];
    const a21 = ae[1];
    const a22 = ae[5];
    const a23 = ae[9];
    const a24 = ae[13];
    const a31 = ae[2];
    const a32 = ae[6];
    const a33 = ae[10];
    const a34 = ae[14];
    const a41 = ae[3];
    const a42 = ae[7];
    const a43 = ae[11];
    const a44 = ae[15];

    const b11 = be[0];
    const b12 = be[4];
    const b13 = be[8];
    const b14 = be[12];
    const b21 = be[1];
    const b22 = be[5];
    const b23 = be[9];
    const b24 = be[13];
    const b31 = be[2];
    const b32 = be[6];
    const b33 = be[10];
    const b34 = be[14];
    const b41 = be[3];
    const b42 = be[7];
    const b43 = be[11];
    const b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  makeBasis(xAxis: any, yAxis: any, zAxis: any): this {
    return this.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      0,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      0,
      xAxis.z,
      yAxis.z,
      zAxis.z,
      0,
      0,
      0,
      0,
      1,
    );
  }

  setPosition(v: any): this {
    const te = this.elements;
    te[12] = v.x;
    te[13] = v.y;
    te[14] = v.z;
    return this;
  }

  scale(v: any): this {
    const te = this.elements;
    const x = v.x;
    const y = v.y;
    const z = v.z;
    te[0] *= x;
    te[4] *= y;
    te[8] *= z;
    te[1] *= x;
    te[5] *= y;
    te[9] *= z;
    te[2] *= x;
    te[6] *= y;
    te[10] *= z;
    te[3] *= x;
    te[7] *= y;
    te[11] *= z;
    return this;
  }

  transpose(): this {
    const te = this.elements;
    let tmp: number;
    tmp = te[1];
    te[1] = te[4];
    te[4] = tmp;
    tmp = te[2];
    te[2] = te[8];
    te[8] = tmp;
    tmp = te[6];
    te[6] = te[9];
    te[9] = tmp;
    tmp = te[3];
    te[3] = te[12];
    te[12] = tmp;
    tmp = te[7];
    te[7] = te[13];
    te[13] = tmp;
    tmp = te[11];
    te[11] = te[14];
    te[14] = tmp;
    return this;
  }

  invert(): this {
    const te = this.elements;
    const n11 = te[0];
    const n21 = te[1];
    const n31 = te[2];
    const n41 = te[3];
    const n12 = te[4];
    const n22 = te[5];
    const n32 = te[6];
    const n42 = te[7];
    const n13 = te[8];
    const n23 = te[9];
    const n33 = te[10];
    const n43 = te[11];
    const n14 = te[12];
    const n24 = te[13];
    const n34 = te[14];
    const n44 = te[15];

    const t11 =
      n23 * n34 * n42 -
      n24 * n33 * n42 +
      n24 * n32 * n43 -
      n22 * n34 * n43 -
      n23 * n32 * n44 +
      n22 * n33 * n44;
    const t12 =
      n14 * n33 * n42 -
      n13 * n34 * n42 -
      n14 * n32 * n43 +
      n12 * n34 * n43 +
      n13 * n32 * n44 -
      n12 * n33 * n44;
    const t13 =
      n13 * n24 * n42 -
      n14 * n23 * n42 +
      n14 * n22 * n43 -
      n12 * n24 * n43 -
      n13 * n22 * n44 +
      n12 * n23 * n44;
    const t14 =
      n14 * n23 * n32 -
      n13 * n24 * n32 -
      n14 * n22 * n33 +
      n12 * n24 * n33 +
      n13 * n22 * n34 -
      n12 * n23 * n34;

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) {
      return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] =
      (n24 * n33 * n41 -
        n23 * n34 * n41 -
        n24 * n31 * n43 +
        n21 * n34 * n43 +
        n23 * n31 * n44 -
        n21 * n33 * n44) *
      detInv;
    te[2] =
      (n22 * n34 * n41 -
        n24 * n32 * n41 +
        n24 * n31 * n42 -
        n21 * n34 * n42 -
        n22 * n31 * n44 +
        n21 * n32 * n44) *
      detInv;
    te[3] =
      (n23 * n32 * n41 -
        n22 * n33 * n41 -
        n23 * n31 * n42 +
        n21 * n33 * n42 +
        n22 * n31 * n43 -
        n21 * n32 * n43) *
      detInv;

    te[4] = t12 * detInv;
    te[5] =
      (n13 * n34 * n41 -
        n14 * n33 * n41 +
        n14 * n31 * n43 -
        n11 * n34 * n43 -
        n13 * n31 * n44 +
        n11 * n33 * n44) *
      detInv;
    te[6] =
      (n14 * n32 * n41 -
        n12 * n34 * n41 -
        n14 * n31 * n42 +
        n11 * n34 * n42 +
        n12 * n31 * n44 -
        n11 * n32 * n44) *
      detInv;
    te[7] =
      (n12 * n33 * n41 -
        n13 * n32 * n41 +
        n13 * n31 * n42 -
        n11 * n33 * n42 -
        n12 * n31 * n43 +
        n11 * n32 * n43) *
      detInv;

    te[8] = t13 * detInv;
    te[9] =
      (n14 * n23 * n41 -
        n13 * n24 * n41 -
        n14 * n21 * n43 +
        n11 * n24 * n43 +
        n13 * n21 * n44 -
        n11 * n23 * n44) *
      detInv;
    te[10] =
      (n12 * n24 * n41 -
        n14 * n22 * n41 +
        n14 * n21 * n42 -
        n11 * n24 * n42 -
        n12 * n21 * n44 +
        n11 * n22 * n44) *
      detInv;
    te[11] =
      (n13 * n22 * n41 -
        n12 * n23 * n41 -
        n13 * n21 * n42 +
        n11 * n23 * n42 +
        n12 * n21 * n43 -
        n11 * n22 * n43) *
      detInv;

    te[12] = t14 * detInv;
    te[13] =
      (n13 * n24 * n31 -
        n14 * n23 * n31 +
        n14 * n21 * n33 -
        n11 * n24 * n33 -
        n13 * n21 * n34 +
        n11 * n23 * n34) *
      detInv;
    te[14] =
      (n14 * n22 * n31 -
        n12 * n24 * n31 -
        n14 * n21 * n32 +
        n11 * n24 * n32 +
        n12 * n21 * n34 -
        n11 * n22 * n34) *
      detInv;
    te[15] =
      (n12 * n23 * n31 -
        n13 * n22 * n31 +
        n13 * n21 * n32 -
        n11 * n23 * n32 -
        n12 * n21 * n33 +
        n11 * n22 * n33) *
      detInv;

    return this;
  }

  determinant(): number {
    const te = this.elements;
    const n11 = te[0];
    const n21 = te[1];
    const n31 = te[2];
    const n41 = te[3];
    const n12 = te[4];
    const n22 = te[5];
    const n32 = te[6];
    const n42 = te[7];
    const n13 = te[8];
    const n23 = te[9];
    const n33 = te[10];
    const n43 = te[11];
    const n14 = te[12];
    const n24 = te[13];
    const n34 = te[14];
    const n44 = te[15];
    return (
      n41 *
        (+n14 * n23 * n32 -
          n13 * n24 * n32 -
          n14 * n22 * n33 +
          n12 * n24 * n33 +
          n13 * n22 * n34 -
          n12 * n23 * n34) +
      n42 *
        (+n11 * n23 * n34 -
          n11 * n24 * n33 +
          n14 * n21 * n33 -
          n13 * n21 * n34 +
          n13 * n24 * n31 -
          n14 * n23 * n31) +
      n43 *
        (+n11 * n24 * n32 -
          n11 * n22 * n34 -
          n14 * n21 * n32 +
          n12 * n21 * n34 +
          n14 * n22 * n31 -
          n12 * n24 * n31) +
      n44 *
        (-n13 * n22 * n31 -
          n11 * n23 * n32 +
          n11 * n22 * n33 +
          n13 * n21 * n32 -
          n12 * n21 * n33 +
          n12 * n23 * n31)
    );
  }
}

class Ray {
  origin: Vector3;
  direction: Vector3;

  constructor(origin = new Vector3(), direction = new Vector3()) {
    this.origin = origin;
    this.direction = direction;
  }

  set(origin: any, direction: any): this {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }

  copy(ray: any): this {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }

  clone(): this {
    return new Ray().copy(this) as this;
  }

  at(t: number, target: Vector3): Vector3 {
    return target.copy(this.direction).multiplyScalar(t).add(this.origin);
  }

  applyMatrix4(matrix4: any): this {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);
    return this;
  }

  distanceSqToPoint(point: any): number {
    const directionDistance = _v1
      .subVectors(point, this.origin)
      .dot(this.direction);
    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point);
    }
    _v1.copy(this.direction).multiplyScalar(directionDistance).add(this.origin);
    return _v1.distanceToSquared(point);
  }

  distanceToPoint(point: any): number {
    return Math.sqrt(this.distanceSqToPoint(point));
  }

  equals(ray: Ray): boolean {
    return (
      ray.origin.equals(this.origin) && ray.direction.equals(this.direction)
    );
  }
}

class Line3 {
  start: Vector3;
  end: Vector3;

  constructor(start = new Vector3(), end = new Vector3()) {
    this.start = start;
    this.end = end;
  }

  set(start: any, end: any): this {
    this.start.copy(start);
    this.end.copy(end);
    return this;
  }

  copy(line: any): this {
    this.start.copy(line.start);
    this.end.copy(line.end);
    return this;
  }

  clone(): this {
    return new Line3().copy(this) as this;
  }

  getCenter(target: Vector3): Vector3 {
    return target.addVectors(this.start, this.end).multiplyScalar(0.5);
  }

  delta(target: Vector3): Vector3 {
    return target.subVectors(this.end, this.start);
  }

  distanceSq(): number {
    return this.start.distanceToSquared(this.end);
  }

  distance(): number {
    return this.start.distanceTo(this.end);
  }

  at(t: number, target: Vector3): Vector3 {
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  closestPointToPointParameter(point: any, clampToLine: boolean): number {
    _startP.subVectors(point, this.start);
    _startEnd.subVectors(this.end, this.start);
    const startEnd2 = _startEnd.dot(_startEnd);
    const startEndStartP = _startEnd.dot(_startP);
    let t = startEndStartP / startEnd2;
    if (clampToLine) {
      t = Math.max(0, Math.min(1, t));
    }
    return t;
  }

  closestPointToPoint(
    point: any,
    clampToLine: boolean,
    target: Vector3,
  ): Vector3 {
    const t = this.closestPointToPointParameter(point, clampToLine);
    return this.delta(target).multiplyScalar(t).add(this.start);
  }
}

class Box3 {
  min: Vector3;
  max: Vector3;

  constructor(
    min = new Vector3(+Infinity, +Infinity, +Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity),
  ) {
    this.min = min;
    this.max = max;
  }

  set(min: any, max: any): this {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  copy(box: any): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  clone(): this {
    return new Box3().copy(this) as this;
  }

  makeEmpty(): this {
    this.min.x = this.min.y = this.min.z = +Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }

  isEmpty(): boolean {
    return (
      this.max.x < this.min.x ||
      this.max.y < this.min.y ||
      this.max.z < this.min.z
    );
  }

  expandByPoint(point: any): this {
    this.min.min(point);
    this.max.max(point);
    return this;
  }

  union(box: any): this {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }

  containsPoint(point: any): boolean {
    return !(
      point.x < this.min.x ||
      point.x > this.max.x ||
      point.y < this.min.y ||
      point.y > this.max.y ||
      point.z < this.min.z ||
      point.z > this.max.z
    );
  }

  getCenter(target: Vector3): Vector3 {
    return this.isEmpty()
      ? target.set(0, 0, 0)
      : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  getSize(target: Vector3): Vector3 {
    return this.isEmpty()
      ? target.set(0, 0, 0)
      : target.subVectors(this.max, this.min);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Internal temporaries, declared after the classes they reference.
const _v1 = new Vector3();
const _startP = new Vector3();
const _startEnd = new Vector3();

export { Vector3, Quaternion, Matrix3, Matrix4, Ray, Line3, Box3 };
export { Vector3 as Vec3, Quaternion as Quat, Matrix4 as Mat4 };
