/**
 * Engine-neutral `.frag` document: inflate + parse the FlatBuffer and expose
 * plain lookups over its IFC metadata. No `three`, no DOM beyond the web
 * streams used to inflate, and no workers.
 */

import * as flatbuffers from "flatbuffers";
import {
  Attribute,
  Meshes,
  Model,
  Relation,
  Sample,
  SpatialStructure,
} from "../Schema";
import {
  DecodedChunk,
  DecodedGeometry,
  MaterialInfo,
  decodeRepresentation,
  readMaterial,
  resolveSampleTransform,
} from "./geometry";
import { Matrix4, Vector3 } from "./math";

export interface FragmentsMetadata {
  schema?: string;
  names?: string[];
  descriptions?: string[];
  crs?: string | null;
  generator?: string;
  version?: string;
  [key: string]: unknown;
}

export interface SpatialTreeNode {
  localId: number | null;
  category: string | null;
  children: SpatialTreeNode[];
}

export interface ItemSample {
  itemId: number;
  materialIndex: number;
  representationIndex: number;
  localTransformIndex: number;
  /** {@link RepresentationClass} value. */
  representationClass: number;
  /** `Representation.id()`: index into `shells[]` / `circleExtrusions[]`. */
  geometryIndex: number;
}

export interface FragmentsDocument {
  /** Model GUID stamped by the importer. */
  readonly guid: string;
  readonly metadata: FragmentsMetadata | null;
  /** Number of items (length of `local_ids`). */
  readonly itemCount: number;
  /** Categories parallel to {@link getLocalIds}. */
  readonly categories: readonly string[];
  readonly maxLocalId: number;

  /** Copy of the (sparse, unsorted) `local_ids` vector. */
  getLocalIds(): Uint32Array;
  getCategory(localId: number): string | null;
  getGuid(localId: number): string | null;
  getLocalId(guid: string): number | null;
  getAttributes(
    localId: number,
  ): Record<string, { value: unknown; type?: string }>;
  getRelations(localId: number): Record<string, number[]> | null;
  getSpatialStructure(): SpatialTreeNode | null;
  /** localIds that own geometry, in `meshes_items` order. */
  getItemsWithGeometry(): number[];
  getSamples(localId: number): ItemSample[];
  /** Decode every sample of an item into geometry. */
  decodeItem(localId: number): DecodedGeometry[];
}

/** Return whether `bytes` is a raw FlatBuffer rather than a zlib stream. */
function isRawBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return true;
  // eslint-disable-next-line no-bitwise
  const isDeflateMethod = (bytes[0] & 0x0f) === 8;
  // eslint-disable-next-line no-bitwise
  const headerIsMultipleOf31 = ((bytes[0] << 8) | bytes[1]) % 31 === 0;
  return !(isDeflateMethod && headerIsMultipleOf31);
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

class HeadlessFragmentsDocument implements FragmentsDocument {
  readonly guid: string;
  readonly metadata: FragmentsMetadata | null;
  readonly itemCount: number;
  readonly categories: readonly string[];
  readonly maxLocalId: number;

  private readonly _model: Model;
  private readonly _meshes: Meshes | null;
  private readonly _localIds: Uint32Array;
  private readonly _localIdToIndex = new Map<number, number>();
  private readonly _relationsIndex = new Map<number, number>();
  private readonly _guidToLocalId = new Map<string, number>();
  private readonly _localIdToGuid = new Map<number, string>();
  private readonly _localIdToItemId = new Map<number, number>();
  private readonly _itemToSamples = new Map<number, number[]>();

  constructor(bytes: Uint8Array) {
    const bb = new flatbuffers.ByteBuffer(bytes);
    const model = Model.getRootAsModel(bb);
    this._model = model;
    this._meshes = model.meshes(new Meshes());

    this.guid = model.guid() ?? "";
    this.maxLocalId = model.maxLocalId();
    this._localIds = model.localIdsArray() ?? new Uint32Array(0);
    this.itemCount = this._localIds.length;

    this.metadata = this.parseMetadata();

    const categories: string[] = new Array(this.itemCount);
    for (let i = 0; i < this.itemCount; i++) {
      categories[i] = model.categories(i) ?? "";
      this._localIdToIndex.set(this._localIds[i], i);
    }
    this.categories = categories;

    this.buildGuidMaps();
    this.buildRelationsIndex();
    this.buildGeometryMaps();
  }

  getLocalIds(): Uint32Array {
    return new Uint32Array(this._localIds);
  }

  getCategory(localId: number): string | null {
    const index = this._localIdToIndex.get(localId);
    if (index === undefined) return null;
    return this._model.categories(index) ?? null;
  }

  getGuid(localId: number): string | null {
    return this._localIdToGuid.get(localId) ?? null;
  }

  getLocalId(guid: string): number | null {
    return this._guidToLocalId.get(guid) ?? null;
  }

  getAttributes(
    localId: number,
  ): Record<string, { value: unknown; type?: string }> {
    const result: Record<string, { value: unknown; type?: string }> = {};
    const index = this._localIdToIndex.get(localId);
    if (index === undefined) return result;
    const buffer = this._model.attributes(index, new Attribute());
    if (!buffer) return result;
    for (let i = 0; i < buffer.dataLength(); i++) {
      const data = buffer.data(i);
      if (!data) continue;
      const [name, value, type] = JSON.parse(data) as [
        string,
        unknown,
        string?,
      ];
      result[name] = { value, type };
    }
    return result;
  }

  getRelations(localId: number): Record<string, number[]> | null {
    const index = this._relationsIndex.get(localId);
    if (index === undefined) return null;
    const buffer = this._model.relations(index, new Relation());
    if (!buffer) return null;
    const result: Record<string, number[]> = {};
    for (let i = 0; i < buffer.dataLength(); i++) {
      const data = buffer.data(i);
      if (!data) continue;
      const [name, ...localIds] = JSON.parse(data) as [string, ...number[]];
      result[name] = localIds;
    }
    return result;
  }

  getSpatialStructure(): SpatialTreeNode | null {
    const root = this._model.spatialStructure(new SpatialStructure());
    if (!root) return null;
    return this.toSpatialNode(root);
  }

  getItemsWithGeometry(): number[] {
    const localIds: number[] = [];
    const items = this._meshes?.meshesItemsArray();
    if (!items) return localIds;
    for (const localIdIndex of items) {
      const localId = this._localIds[localIdIndex];
      if (localId === undefined) continue;
      localIds.push(localId);
    }
    return localIds;
  }

  getSamples(localId: number): ItemSample[] {
    const itemId = this._localIdToItemId.get(localId);
    if (itemId === undefined) return [];
    const sampleIndices = this._itemToSamples.get(itemId);
    if (!sampleIndices) return [];
    const result: ItemSample[] = [];
    for (const sampleIndex of sampleIndices) {
      const sample = this.sample(sampleIndex);
      if (!sample) continue;
      const representationIndex = sample.representation();
      const representation = this._meshes?.representations(representationIndex);
      result.push({
        itemId,
        materialIndex: sample.material(),
        representationIndex,
        localTransformIndex: sample.localTransform(),
        representationClass: representation
          ? representation.representationClass()
          : 0,
        geometryIndex: representation ? representation.id() : 0,
      });
    }
    return result;
  }

  decodeItem(localId: number): DecodedGeometry[] {
    const itemId = this._localIdToItemId.get(localId);
    if (itemId === undefined || !this._meshes) return [];
    const sampleIndices = this._itemToSamples.get(itemId);
    if (!sampleIndices) return [];

    const result: DecodedGeometry[] = [];
    for (const sampleIndex of sampleIndices) {
      const sample = this.sample(sampleIndex);
      if (!sample) continue;
      const representationIndex = sample.representation();
      const representation = this._meshes.representations(representationIndex);
      if (!representation) continue;

      const representationClass = representation.representationClass();
      const chunks: DecodedChunk[] = decodeRepresentation(
        this._meshes,
        representation,
      );
      if (chunks.length === 0) continue;

      result.push({
        chunks,
        material: readMaterial(this._meshes, sample.material()),
        transform: resolveSampleTransform(sample, this._meshes),
        representationIndex,
        representationClass,
        localId,
        itemId,
      });
    }
    return result;
  }

  private sample(sampleIndex: number): Sample | null {
    return this._meshes?.samples(sampleIndex, new Sample()) ?? null;
  }

  private toSpatialNode(node: SpatialStructure): SpatialTreeNode {
    const children: SpatialTreeNode[] = [];
    for (let i = 0; i < node.childrenLength(); i++) {
      const child = node.children(i, new SpatialStructure());
      if (child) children.push(this.toSpatialNode(child));
    }
    return {
      localId: node.localId() ?? null,
      category: node.category() ?? null,
      children,
    };
  }

  private parseMetadata(): FragmentsMetadata | null {
    const raw = this._model.metadata();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private buildGuidMaps() {
    for (let i = 0; i < this._model.guidsItemsLength(); i++) {
      const localId = this._model.guidsItems(i);
      if (localId === null) continue;
      const guid = this._model.guids(i);
      if (!guid) continue;
      this._guidToLocalId.set(guid, localId);
      this._localIdToGuid.set(localId, guid);
    }
  }

  private buildRelationsIndex() {
    const items = this._model.relationsItemsArray();
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      this._relationsIndex.set(items[i], i);
    }
  }

  private buildGeometryMaps() {
    const meshes = this._meshes;
    if (!meshes) return;

    // itemId -> localId, via `meshes_items[itemId]` -> index into local_ids.
    const items = meshes.meshesItemsArray();
    if (items) {
      for (let itemId = 0; itemId < items.length; itemId++) {
        const localId = this._localIds[items[itemId]];
        if (localId !== undefined) {
          this._localIdToItemId.set(localId, itemId);
        }
      }
    }

    // itemId -> sample indices, from `samples[i].item()`.
    const sampleCount = meshes.samplesLength();
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
      const sample = this.sample(sampleIndex);
      if (!sample) continue;
      const itemId = sample.item();
      let list = this._itemToSamples.get(itemId);
      if (!list) {
        list = [];
        this._itemToSamples.set(itemId, list);
      }
      list.push(sampleIndex);
    }
  }
}

/**
 * Parse a `.frag` buffer (zlib-deflated by default, or raw with `raw: true`).
 * The only async call in the headless API.
 */
export async function decodeFragments(
  data: Uint8Array | ArrayBuffer,
  options: { raw?: boolean } = {},
): Promise<FragmentsDocument> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const raw = options.raw ?? isRawBuffer(bytes);
  const decoded = raw ? bytes : await inflateZlib(bytes);
  return new HeadlessFragmentsDocument(decoded);
}

// Re-exported here so consumers get the decoded types from the document entry.
export type { DecodedChunk, DecodedGeometry, MaterialInfo } from "./geometry";
export { Matrix4, Vector3 };
