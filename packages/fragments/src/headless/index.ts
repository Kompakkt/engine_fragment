/**
 * Headless, engine-neutral entry point for `@kompakkt/fragments`.
 *
 * Parses `.frag` buffers and decodes geometry + IFC metadata without pulling in
 * `three`, the DOM, or the worker runtime. The package root maps `"."` here.
 */

export * as Schema from "../Schema";

export { decodeFragments } from "./document";
export type {
  FragmentsDocument,
  FragmentsMetadata,
  SpatialTreeNode,
  ItemSample,
} from "./document";

export {
  decodeShell,
  decodeCircleExtrusion,
  decodeRepresentation,
  resolveSampleTransform,
  readMaterial,
  getRepresentationBox,
} from "./geometry";
export type { DecodedChunk, DecodedGeometry, MaterialInfo } from "./geometry";

export {
  Vec3,
  Quat,
  Mat4,
  Vector3,
  Quaternion,
  Matrix4,
  Box3,
  Line3,
  Ray,
} from "./math";
export type {
  TileData,
  TileBasicData,
  AnyTileData,
  AnyTileBasicData,
  DataBuffer,
} from "./primitives";
