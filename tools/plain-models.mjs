// Writes copies of the models with meshopt compression undone, for hosts that won't run WebAssembly.
// Usage: node tools/plain-models.mjs <in-dir> <out-dir>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readdirSync } from "fs";
import { join } from "path";

const [inDir, outDir] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of readdirSync(inDir).filter((f) => f.endsWith(".glb"))) {
  const doc = await io.read(join(inDir, f));
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === "EXT_meshopt_compression") ext.dispose();
  await io.write(join(outDir, f), doc);
  console.log(f);
}
