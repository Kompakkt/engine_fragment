# Provenance and notices

This repository is a fork of [ThatOpen/engine_fragment](https://github.com/ThatOpen/engine_fragment)
(the "Fragments" project), licensed under the MIT License. The upstream license text is
preserved unmodified in [`LICENSE.md`](./LICENSE.md).

The fork as a whole remains **MIT**. Kompakkt-authored additions
(`packages/fragments/src/headless/**`, `packages/fragments/scripts/**`, `docs/**`, and the
package-plumbing changes described in `docs/FORK.md`) are contributed under the same MIT
terms.

## Third-party components

- **`packages/fragments/src/FragmentsModels/src/utils/geometry/earcut.ts`** is derived from
  Mapbox's [earcut](https://github.com/mapbox/earcut) polygon triangulation library, which
  is distributed under the ISC License. Upstream ships it without a license header; this
  notice records the attribution. It is used unmodified by the fork.

- The `flatbuffers` runtime, `pako`, `earcut` (the npm package), and other dependencies
  retain their own licenses as declared by their respective npm packages.
