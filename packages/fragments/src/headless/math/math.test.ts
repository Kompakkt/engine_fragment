import { expect, test } from "vitest";
import { Line3, Matrix4, Quaternion, Vector3 } from "./index";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const closeVec = (v: Vector3, x: number, y: number, z: number) => {
  close(v.x, x);
  close(v.y, y);
  close(v.z, z);
};

test("crossVectors follows the right-hand rule", () => {
  const x = new Vector3(1, 0, 0);
  const y = new Vector3(0, 1, 0);
  const cross = new Vector3().crossVectors(x, y);
  closeVec(cross, 0, 0, 1);
});

test("applyAxisAngle rotates a point around the axis", () => {
  const v = new Vector3(1, 0, 0);
  v.applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  closeVec(v, 0, 1, 0);
});

test("applyQuaternion matches setFromAxisAngle", () => {
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    Math.PI / 2,
  );
  const v = new Vector3(1, 0, 0).applyQuaternion(q);
  closeVec(v, 0, 1, 0);
});

test("setFromUnitVectors maps from onto to", () => {
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
  );
  const v = new Vector3(1, 0, 0).applyQuaternion(q);
  closeVec(v, 0, 1, 0);
});

test("makeBasis stores the axes as columns", () => {
  const m = new Matrix4().makeBasis(
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
  );
  expect(Array.from(m.elements)).toEqual([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
});

test("multiplyMatrices applies translation then maps a point", () => {
  const translation = new Matrix4().set(
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    2,
    0,
    0,
    1,
    3,
    0,
    0,
    0,
    1,
  );
  const identity = new Matrix4().identity();
  const result = new Matrix4().multiplyMatrices(translation, identity);
  const point = new Vector3(1, 1, 1).applyMatrix4(result);
  closeVec(point, 2, 3, 4);
});

test("invert undoes a translation", () => {
  const translation = new Matrix4().set(
    1,
    0,
    0,
    5,
    0,
    1,
    0,
    -3,
    0,
    0,
    1,
    2,
    0,
    0,
    0,
    1,
  );
  const point = new Vector3(1, 1, 1).applyMatrix4(translation);
  point.applyMatrix4(translation.clone().invert());
  closeVec(point, 1, 1, 1);
});

test("Line3.closestPointToPoint clamps to the segment", () => {
  const line = new Line3(new Vector3(0, 0, 0), new Vector3(10, 0, 0));
  const result = new Vector3();
  line.closestPointToPoint(new Vector3(5, 5, 0), true, result);
  closeVec(result, 5, 0, 0);
  line.closestPointToPoint(new Vector3(-4, 0, 0), true, result);
  closeVec(result, 0, 0, 0);
});
