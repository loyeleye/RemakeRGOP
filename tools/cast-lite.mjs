// Light copies of the story characters' models. The image-to-3D scans come in at ~700k triangles
// with UV seams everywhere, which the ordinary simplifier can't get past (it stalls near 90k).
// At the size they're drawn that's waste, so: drop the maps a flat-lit model doesn't use (normal,
// occlusion, roughness) and the tangents, then a "sloppy" simplify that ignores seams, down to
// TRIS triangles. Output is quantized only (no meshopt), so it also loads on the demo page.
//
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer@1.3 sharp
//   node tools/cast-lite.mjs SRC.glb OUT.glb [TRIS=15000]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, prune, quantize, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [, , src, out, tris = "15000"] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const m of doc.getRoot().listMaterials()) m.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) p.setAttribute("TANGENT", null);
await MeshoptSimplifier.ready;
await doc.transform(prune(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.05, error: 0.01 }));
for (const mesh of doc.getRoot().listMeshes())
  for (const p of mesh.listPrimitives()) {
    const pos = new Float32Array(p.getAttribute("POSITION").getArray());
    const idx = new Uint32Array(p.getIndices().getArray());
    const [ni] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, +tris * 3, 1);
    p.getIndices().setArray(new Uint32Array(ni));
    compactPrimitive(p);
  }
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512] }), quantize({ quantizeNormal: 8, quantizeTexcoord: 12 }));
await io.write(out, doc);
const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
console.log(out, "verts", p.getAttribute("POSITION").getCount(), "tris", p.getIndices().getCount() / 3);
