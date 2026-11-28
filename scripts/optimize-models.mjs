/**
 * Asset pipeline: bakes the raw AI-generated GLB exports in 3d_model/ into
 * lean web assets in public/models/. Run `npm run models` after dropping a
 * new export in. One recipe per asset:
 *
 *   weld → simplify (meshopt, 10% ratio under a 0.1% error cap)
 *        → 1024px WebP textures (near-lossless for normal maps)
 *        → EXT_meshopt_compression + KHR_mesh_quantization
 *
 * Everything decodes locally in the browser: three-stdlib bundles the
 * meshopt decoder and WebP is a native codec — no CDN wasm, matching the
 * project's no-network-asset rule (which is why Draco is NOT used here).
 *
 * The logo export ships its emissive map as a loose PNG (the generator
 * doesn't wire it) — this script attaches it before compressing, so the
 * brand elements can glow under the dark theme's bloom.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const MODELS = [
  {
    input: "3d_model/product/base_basic_pbr.glb",
    output: "public/models/tracker.glb",
  },
  {
    input: "3d_model/logo/base_basic_pbr.glb",
    output: "public/models/logo.glb",
    emissive: "3d_model/logo/texture_emissive.png",
  },
  // The FMC teardown pair: each ships 4 separate part nodes (housings /
  // harness / connectors) — the recipe below preserves the node split the
  // products page's scroll-driven exploded view depends on.
  {
    input: "3d_model/FMC130/base_basic_pbr.glb",
    output: "public/models/fmc130.glb",
  },
  {
    input: "3d_model/FMC920/base_basic_pbr.glb",
    output: "public/models/fmc920.glb",
  },
  // Galileosky: six real mesh nodes (one housing, four end fittings, one
  // front connector) — the default recipe preserves the split the exploded
  // view needs and still lands near 1 MB, so no -lite variant is needed.
  {
    input: "3d_model/galileosky/base_basic_pbr.glb",
    output: "public/models/galileosky.glb",
  },
  // Galileosky 10: a single merged mesh (no part split — presented static
  // with a gentle turn, never exploded). Its generator left the emissive
  // map loose like the logo's, so it gets wired here for the dark theme's
  // bloom to pick up.
  {
    input: "3d_model/galileosky10/base_basic_pbr.glb",
    output: "public/models/galileosky10.glb",
    emissive: "3d_model/galileosky10/texture_emissive.png",
  },
  // Aggressive FMC130 variant: the label shell's dense relief holds ~286k
  // verts under the default 0.1% error cap (→3MB file) — a 1% cap plus
  // 512px textures trades micro-relief for a much smaller download.
  //
  // NOT emitted into public/: nothing loads it (FmcDevice's CONFIGS points
  // at fmc130.glb), so shipping it meant deploying ~2.7MB of dead weight.
  // It now lands in the gitignored build/model-variants/ as an evaluation
  // artifact. To actually use it, copy it into public/models/ and point
  // CONFIGS.fmc130.url at it.
  {
    input: "3d_model/FMC130/base_basic_pbr.glb",
    output: "build/model-variants/fmc130-lite.glb",
    simplifyError: 0.01,
    textureSize: 512,
  },
];

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

for (const model of MODELS) {
  const document = await io.read(model.input);

  if (model.emissive !== undefined) {
    const image = await readFile(model.emissive);
    const texture = document.createTexture("emissive").setImage(image).setMimeType("image/png");
    for (const material of document.getRoot().listMaterials()) {
      material.setEmissiveTexture(texture).setEmissiveFactor([1, 1, 1]);
    }
  }

  // Per-model overrides: a looser error cap lets dense relief actually
  // reach the 10% ratio; smaller textures shrink the atlas share.
  const error = model.simplifyError ?? 0.001;
  const texSize = model.textureSize ?? 1024;

  await document.transform(
    dedup(),
    prune(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error }),
    // Color/MR/emissive: lossy WebP. Normal maps separately, near-lossless —
    // lossy chroma artifacts there read as shading noise.
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [texSize, texSize],
      quality: 85,
      slots: /^(?!normal)/,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [texSize, texSize],
      nearLossless: true,
      slots: /^normal/,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  // The evaluation variants land outside public/, in a directory that may
  // not exist yet.
  await mkdir(dirname(model.output), { recursive: true });
  await io.write(model.output, document);
  const { size } = await import("node:fs").then((fs) => fs.promises.stat(model.output));
  console.log(`${model.input} → ${model.output} (${(size / 1048576).toFixed(2)} MB)`);
}
