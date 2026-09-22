import { readFile } from "fs/promises";
import * as path from "path";
import * as flatbuffers from "flatbuffers";
import { expect, test } from "vitest";
import { decodeFragments } from "./index";
import { Vector3 } from "./math";
import { Meshes, Model, RepresentationClass, Sample } from "../Schema";
import { VceLodConstructor } from "../FragmentsModels/src/virtual-model/virtual-meshes/circle-extrusion/vce-lod-constructor";
import { VceUtils } from "../FragmentsModels/src/virtual-model/virtual-meshes/circle-extrusion/vce-utils";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..", "..");

const loadFixture = (name: string) =>
  readFile(path.join(repoRoot, "resources", "frags", `${name}.frag`));

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

interface Counts {
  itemCount: number;
  itemGeometries: number;
  shellSamples: number;
  circleExtrusionSamples: number;
  chunks: number;
  emptyChunks: number;
  badFaceIds: number;
  nanPositions: number;
  splitChunks: number;
}

const analyze = async (name: string): Promise<Counts> => {
  const document = await decodeFragments(await loadFixture(name));
  const counts: Counts = {
    itemCount: document.itemCount,
    itemGeometries: 0,
    shellSamples: 0,
    circleExtrusionSamples: 0,
    chunks: 0,
    emptyChunks: 0,
    badFaceIds: 0,
    nanPositions: 0,
    splitChunks: 0,
  };
  for (const localId of document.getItemsWithGeometry()) {
    for (const geometry of document.decodeItem(localId)) {
      counts.itemGeometries++;
      if (geometry.representationClass === RepresentationClass.SHELL) {
        counts.shellSamples++;
      }
      if (
        geometry.representationClass === RepresentationClass.CIRCLE_EXTRUSION
      ) {
        counts.circleExtrusionSamples++;
      }
      if (geometry.chunks.length === 0) counts.emptyChunks++;
      if (geometry.chunks.length > 1) counts.splitChunks++;
      for (const chunk of geometry.chunks) {
        counts.chunks++;
        if (
          chunk.faceIds !== null &&
          chunk.faceIds.length * 3 !== chunk.positionCount
        ) {
          counts.badFaceIds++;
        }
        for (const value of chunk.positions) {
          if (Number.isNaN(value)) {
            counts.nanPositions++;
            break;
          }
        }
      }
    }
  }
  return counts;
};

test("decodeFragments reads item counts and metadata", async () => {
  const small = await decodeFragments(await loadFixture("small_test"));
  expect(small.itemCount).toBe(492);
  expect(small.maxLocalId).toBe(25858);
  expect(small.metadata?.schema).toBe("IFC2X3");
  expect(small.getLocalIds().length).toBe(492);

  const str = await decodeFragments(await loadFixture("school_str"));
  expect(str.itemCount).toBe(12766);
  expect(str.metadata?.schema).toBe("IFC4");
});

test("shell geometry decodes with matching counts and face ids", async () => {
  const counts = await analyze("small_test");
  expect(counts.itemGeometries).toBe(308);
  expect(counts.shellSamples).toBe(308);
  expect(counts.circleExtrusionSamples).toBe(0);
  expect(counts.chunks).toBe(308);
  expect(counts.emptyChunks).toBe(0);
  expect(counts.badFaceIds).toBe(0);
  expect(counts.nanPositions).toBe(0);
});

test("circle extrusions decode as tubes, not lines", async () => {
  const counts = await analyze("school_str");
  expect(counts.itemGeometries).toBe(1529);
  expect(counts.shellSamples).toBe(910);
  expect(counts.circleExtrusionSamples).toBe(619);
  expect(counts.badFaceIds).toBe(0);
  expect(counts.nanPositions).toBe(0);

  const document = await decodeFragments(await loadFixture("school_str"));
  let checked = 0;
  for (const localId of document.getItemsWithGeometry()) {
    for (const geometry of document.decodeItem(localId)) {
      if (
        geometry.representationClass !== RepresentationClass.CIRCLE_EXTRUSION
      ) {
        continue;
      }
      for (const chunk of geometry.chunks) {
        // Circle extrusions are line geometry: no per-face ids.
        expect(chunk.faceIds).toBeNull();
        // A swept tube has more than 4 indices per vertex ring; a bare line
        // would have ~2.
        const ring = chunk.positionCount / 3;
        expect(chunk.indices.length / ring).toBeGreaterThan(4);
        checked++;
      }
    }
  }
  expect(checked).toBe(619);
}, 120000);

test("oversized shells split into multiple chunks", async () => {
  const counts = await analyze("school_arq");
  expect(counts.splitChunks).toBeGreaterThan(0);
  expect(counts.chunks).toBeGreaterThan(counts.itemGeometries);
}, 120000);

test("sample transforms are deterministic and finite", async () => {
  const document = await decodeFragments(await loadFixture("small_test"));
  const items = document.getItemsWithGeometry();
  let samples = 0;
  for (const localId of items) {
    const first = document.decodeItem(localId);
    const second = document.decodeItem(localId);
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(Array.from(second[i].transform.elements)).toEqual(
        Array.from(first[i].transform.elements),
      );
      for (const value of first[i].transform.elements) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThan(1e7);
      }
      samples++;
    }
  }
  expect(samples).toBe(308);
});

test("metadata lookups return coherent data", async () => {
  const document = await decodeFragments(await loadFixture("small_test"));

  const localIds = document.getLocalIds();
  expect(localIds).toBeInstanceOf(Uint32Array);
  expect(localIds.length).toBe(document.itemCount);
  expect(document.categories.length).toBe(document.itemCount);

  const geometryItems = document.getItemsWithGeometry();
  expect(geometryItems.length).toBe(93);
  const first = geometryItems[0];
  expect(typeof document.getCategory(first)).toBe("string");

  // GUID <-> localId round-trips.
  let guid: string | null = null;
  for (const localId of localIds) {
    const candidate = document.getGuid(localId);
    if (candidate) {
      expect(document.getLocalId(candidate)).toBe(localId);
      guid = candidate;
      break;
    }
  }
  expect(guid).not.toBeNull();
  expect(document.getLocalId("not-a-real-guid")).toBeNull();

  // At least one item exposes attributes and one exposes relations.
  let sawAttributes = false;
  let sawRelations = false;
  for (const localId of localIds) {
    if (Object.keys(document.getAttributes(localId)).length > 0) {
      sawAttributes = true;
    }
    if (document.getRelations(localId)) {
      sawRelations = true;
    }
    if (sawAttributes && sawRelations) break;
  }
  expect(sawAttributes).toBe(true);
  expect(sawRelations).toBe(true);

  const spatial = document.getSpatialStructure();
  expect(spatial).not.toBeNull();
  expect(Array.isArray(spatial!.children)).toBe(true);

  const samples = document.getSamples(first);
  expect(samples.length).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(Number.isInteger(sample.itemId)).toBe(true);
    expect(Number.isInteger(sample.representationIndex)).toBe(true);
    expect(Number.isInteger(sample.materialIndex)).toBe(true);
    expect(Number.isInteger(sample.geometryIndex)).toBe(true);
  }
});

test("raw and deflated buffers decode identically", async () => {
  const deflated = new Uint8Array(await loadFixture("small_test"));
  const raw = await inflate(deflated);

  const autoDeflated = await decodeFragments(deflated);
  const explicitRaw = await decodeFragments(raw, { raw: true });
  const autoRaw = await decodeFragments(raw);

  expect(explicitRaw.itemCount).toBe(autoDeflated.itemCount);
  expect(autoRaw.itemCount).toBe(autoDeflated.itemCount);
  expect(explicitRaw.metadata?.schema).toBe(autoDeflated.metadata?.schema);

  const localId = autoDeflated.getLocalIds()[0];
  expect(explicitRaw.getGuid(localId)).toBe(autoDeflated.getGuid(localId));
});

test("rebar LOD construction consumes headless vectors", async () => {
  const raw = await inflate(new Uint8Array(await loadFixture("school_str")));
  const model = Model.getRootAsModel(new flatbuffers.ByteBuffer(raw));
  const meshes = model.meshes(new Meshes())!;

  // `newPaths` must hand back headless `Vector3` instances, because
  // `vce-lod-constructor` picks the `.x` (vector) vs `.x()` (flatbuffer)
  // branch with `instanceof`.
  let checkedPaths = false;
  for (
    let ce = 0;
    ce < meshes.circleExtrusionsLength() && !checkedPaths;
    ce++
  ) {
    meshes.circleExtrusions(ce, VceUtils.temp.circleExtrusion);
    const axis = VceUtils.temp.axis;
    VceUtils.temp.circleExtrusion.axes(0, axis);
    for (let c = 0; c < axis.circleCurvesLength(); c++) {
      axis.circleCurves(c, VceUtils.temp.circleCurve);
      const paths = VceUtils.newPaths(VceUtils.temp.circleCurve, 4);
      if (paths.length > 0) {
        expect(paths[0]).toBeInstanceOf(Vector3);
        checkedPaths = true;
        break;
      }
    }
  }
  expect(checkedPaths).toBe(true);

  // Full LOD construction must not throw on the rebar path.
  let built = 0;
  for (let i = 0; i < meshes.circleExtrusionsLength(); i++) {
    meshes.circleExtrusions(i, VceUtils.temp.circleExtrusion);
    const circleExtrusion = VceUtils.temp.circleExtrusion;
    const constructor = new VceLodConstructor();
    const template = constructor.newTemplate();
    if (!template.positionCount) continue;
    const mesh = {
      objectClass: template.objectClass,
      positionCount: template.positionCount,
      lod: template.lod,
      lodThickness: template.lodThickness,
    } as any;
    constructor.construct(circleExtrusion, mesh);
    expect(mesh.positionBuffer.length).toBe(template.positionCount);
    built++;
  }
  expect(built).toBeGreaterThan(0);
}, 120000);
