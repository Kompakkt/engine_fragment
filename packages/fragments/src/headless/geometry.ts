/**
 * Engine-neutral geometry decoding.
 *
 * Wraps the upstream shell / circle-extrusion constructors (which are pure
 * algorithms over `Float32Array`/`Int16Array`/`Uint16Array` buffers) and copies
 * their output into plain typed arrays the consumer owns. The constructors are
 * reentrant because `resetConstructData` zeroes their state, so a single
 * instance per process is safe for synchronous use.
 */

import {
  BoundingBox,
  CircleExtrusion,
  DoubleVector,
  FloatVector,
  Material,
  Meshes,
  Representation,
  Sample,
  Shell,
  Transform,
} from "../Schema";
import { Matrix4, Vector3 } from "./math";
import { AnyTileData, DataBuffer, TileBasicData, TileData } from "./primitives";
import { ShellConstructor } from "../FragmentsModels/src/virtual-model/virtual-meshes/shell/shell-constructor";
import { ShellTemplateConstructor } from "../FragmentsModels/src/virtual-model/virtual-meshes/shell/shell-template-constructor";
import { VceConstructor } from "../FragmentsModels/src/virtual-model/virtual-meshes/circle-extrusion/vce-constructor";

export interface DecodedChunk {
  /** Positions local to the sample, `xyz` triples. */
  positions: Float32Array;
  /** Quantised normals; divide by `normalizationValue` (32767) to de-quantise. */
  normals: Int16Array;
  /** Triangle indices into `positions`. `Uint32Array` only for oversized shells. */
  indices: Uint16Array | Uint32Array;
  /** One face id per triangle vertex, or `null` for line geometry. */
  faceIds: Uint32Array | null;
  positionCount: number;
  indexCount: number;
  normalCount: number;
  /** {@link ObjectClass} value (`LINE = 0`, `SHELL = 1`). */
  objectClass: number;
}

export interface MaterialInfo {
  r: number;
  g: number;
  b: number;
  a: number;
  /** {@link RenderedFaces} value: `0` one-sided, `1` two-sided. */
  renderedFaces: number;
  /** {@link Stroke} value. */
  stroke: number;
}

export interface DecodedGeometry {
  /** One entry per buffer upstream needed; >1 when it split an oversized shell. */
  chunks: DecodedChunk[];
  material: MaterialInfo;
  /** World transform: `globalTransforms[item] × localTransforms[sample]`. */
  transform: Matrix4;
  representationIndex: number;
  /** {@link RepresentationClass} value. */
  representationClass: number;
  localId: number;
  itemId: number;
}

const shellTemplates = new ShellTemplateConstructor();
const shellConstructor = new ShellConstructor();
const vceConstructor = new VceConstructor();

function fixNumber(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function toDecodedChunk(tile: TileData): DecodedChunk {
  const positionBuffer = tile.positionBuffer as Float32Array;
  const normalBuffer = tile.normalBuffer as Int16Array;
  const indexBuffer = tile.indexBuffer as DataBuffer;
  const faceIdBuffer = tile.faceIdBuffer as Uint32Array | undefined;

  return {
    positions: new Float32Array(positionBuffer),
    normals: new Int16Array(normalBuffer),
    indices:
      indexBuffer instanceof Uint32Array
        ? new Uint32Array(indexBuffer)
        : new Uint16Array(indexBuffer as Uint16Array),
    faceIds: faceIdBuffer ? new Uint32Array(faceIdBuffer) : null,
    positionCount: tile.positionCount ?? 0,
    indexCount: tile.indexCount ?? 0,
    normalCount: tile.normalCount ?? 0,
    objectClass: tile.objectClass,
  };
}

/**
 * Decode a shell into one or more chunks. Upstream splits a shell's buffer when
 * it would overflow a 16-bit index, so a single shell can yield several chunks.
 */
export function decodeShell(shell: Shell): DecodedChunk[] {
  const template = shellTemplates.newMeshTemplate(shell);
  const positionCount = Array.isArray(template)
    ? template[0]?.positionCount
    : template.positionCount;
  if (!positionCount) {
    return [];
  }
  const chunks = (
    Array.isArray(template) ? template.slice() : [template]
  ) as TileData[];
  shellConstructor.construct(shell, chunks as AnyTileData);
  return chunks.map(toDecodedChunk);
}

/** Decode a circle extrusion (rebar) into chunks of line geometry. */
export function decodeCircleExtrusion(ce: CircleExtrusion): DecodedChunk[] {
  const templates: TileBasicData[] = [];
  for (let i = 0; i < ce.axesLength(); i++) {
    vceConstructor.newTemplate(ce, i, templates);
  }
  if (!templates.length || !templates[0].positionCount) {
    return [];
  }
  vceConstructor.construct(ce, templates as TileData[]);
  return (templates as TileData[]).map(toDecodedChunk);
}

/**
 * Decode the geometry a representation points at. `representation.id()` is an
 * index into `meshes.shells()` or `meshes.circleExtrusions()` depending on
 * `representation.representationClass()`.
 */
export function decodeRepresentation(
  meshes: Meshes,
  representation: Representation,
): DecodedChunk[] {
  const classValue = representation.representationClass();
  const geometryIndex = representation.id();

  if (classValue === RepresentationClassValue.SHELL) {
    const shell = meshes.shells(geometryIndex, new Shell());
    return shell ? decodeShell(shell) : [];
  }
  if (classValue === RepresentationClassValue.CIRCLE_EXTRUSION) {
    const ce = meshes.circleExtrusions(geometryIndex, new CircleExtrusion());
    return ce ? decodeCircleExtrusion(ce) : [];
  }
  return [];
}

/** Local enum mirror so this module does not depend on viewer types. */
const RepresentationClassValue = {
  NONE: 0,
  SHELL: 1,
  CIRCLE_EXTRUSION: 2,
} as const;

function parseTransform(transform: Transform, result: Matrix4): Matrix4 {
  const position = transform.position(new DoubleVector())!;
  const xDirection = transform.xDirection(new FloatVector())!;
  const yDirection = transform.yDirection(new FloatVector())!;

  const ox = fixNumber(position.x());
  const oy = fixNumber(position.y());
  const oz = fixNumber(position.z());

  const xx = fixNumber(xDirection.x());
  const xy = fixNumber(xDirection.y());
  const xz = fixNumber(xDirection.z());

  const yx = fixNumber(yDirection.x());
  const yy = fixNumber(yDirection.y());
  const yz = fixNumber(yDirection.z());

  // z = x × y
  const zx = xy * yz - xz * yy;
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;

  // prettier-ignore
  result.set(
    xx, yx, zx, ox,
    xy, yy, zy, oy,
    xz, yz, zz, oz,
    0, 0, 0, 1,
  );
  return result;
}

/**
 * World transform for a sample: `globalTransforms[item] × localTransforms[sample]`.
 */
export function resolveSampleTransform(
  sample: Sample,
  meshes: Meshes,
): Matrix4 {
  const global = meshes.globalTransforms(sample.item(), new Transform());
  const local = meshes.localTransforms(
    sample.localTransform(),
    new Transform(),
  );
  const item = new Matrix4();
  const sampleTransform = new Matrix4();
  parseTransform(global!, item);
  parseTransform(local!, sampleTransform);
  return new Matrix4().multiplyMatrices(item, sampleTransform);
}

/** Raw material bytes plus render flags; colour-space conversion is the caller's job. */
export function readMaterial(
  meshes: Meshes,
  materialIndex: number,
): MaterialInfo {
  const material = meshes.materials(materialIndex, new Material())!;
  return {
    r: material.r(),
    g: material.g(),
    b: material.b(),
    a: material.a(),
    renderedFaces: material.renderedFaces(),
    stroke: material.stroke(),
  };
}

/** The flat representation bounding box, without decoding any geometry. */
export function getRepresentationBox(representation: Representation): {
  min: Vector3;
  max: Vector3;
} {
  const bbox = representation.bbox(new BoundingBox())!;
  const minVector = bbox.min(new FloatVector())!;
  const maxVector = bbox.max(new FloatVector())!;
  return {
    min: new Vector3(
      fixNumber(minVector.x()),
      fixNumber(minVector.y()),
      fixNumber(minVector.z()),
    ),
    max: new Vector3(
      fixNumber(maxVector.x()),
      fixNumber(maxVector.y()),
      fixNumber(maxVector.z()),
    ),
  };
}
