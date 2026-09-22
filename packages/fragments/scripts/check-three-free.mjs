// Fails if the headless entry's module graph reaches `three` (directly or
// through `node_modules/.bun/three@...`). Run from packages/fragments:
//   bun scripts/check-three-free.mjs
import { readFileSync } from "node:fs";
import { $ } from "bun";

const out = "/tmp/fragments-headless-check";
await $`bun build src/headless/index.ts --target=browser --metafile=${out}.json --outfile=${out}.js`.quiet();
const { inputs } = JSON.parse(readFileSync(`${out}.json`, "utf8"));
const found = Object.keys(inputs).filter((p) =>
  /node_modules\/(?:\.bun\/)?three(?:@|\/)/.test(p),
);
if (found.length) {
  console.error(`headless entry is not three-free:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`three-free: ${Object.keys(inputs).length} inputs`);
