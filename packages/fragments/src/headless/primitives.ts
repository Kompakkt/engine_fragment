/**
 * Engine-neutral primitives for the headless entry point.
 *
 * These mirror the pieces of `FragmentsModels/src/model/model-types.ts` and
 * `FragmentsModels/src/virtual-model/virtual-meshes/types.ts` that the geometry
 * construction code needs, without dragging in `three` or the viewer types.
 * Enum-ish fields are intentionally widened to `number` so values can flow
 * between this subtree and the untouched Three.js viewer.
 */

/** The maximum value representable by a 2-byte unsigned integer. */
export const limitOf2Bytes = 0x10000;

/** Divisor used to de-quantise the `Int16Array` normals (`2 ** 15 - 1`). */
export const normalizationValue = 2 ** 15 - 1;

/**
 * The class of a virtual mesh. Mirrors upstream `ObjectClass` but as a plain
 * object so nothing depends on the viewer enums.
 */
export const ObjectClass = {
  LINE: 0,
  SHELL: 1,
} as const;

/** Level of detail for a virtual mesh. Mirrors upstream `CurrentLod`. */
export const CurrentLod = {
  GEOMETRY: 0,
  WIRES: 1,
  INVISIBLE: 2,
} as const;

/** LOD strategy for a virtual mesh. Mirrors upstream `LodClass`. */
export const LodClass = {
  NONE: 0,
  AABB: 1,
  CUSTOM: 2,
} as const;

/** Union of every typed array the format can expose as a buffer. */
export type DataBuffer =
  | Float32Array
  | Uint8ClampedArray
  | Int32Array
  | Uint8Array
  | Uint32Array
  | Float64Array
  | Int8Array
  | Uint16Array
  | Int16Array;

export interface TileBasicData {
  objectClass: number;
  indexCount?: number;
  positionCount?: number;
  normalCount?: number;
  lodThickness?: number;
  lod?: number;
}

export type AnyTileBasicData = TileBasicData | TileBasicData[];

export interface TileData extends TileBasicData {
  indexBuffer?: DataBuffer;
  positionBuffer?: DataBuffer;
  faceIdBuffer?: DataBuffer;
  normalBuffer?: DataBuffer;
}

export type AnyTileData = TileData | TileData[];
