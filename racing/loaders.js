/* ===== טוען glTF משותף (עם פענוח Draco) — נוצר פעם אחת ומשמש את המכוניות והנוף ===== */

let loader = null;

export async function gltfLoader() {
  if (!loader) {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js")
    ]);
    const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
    loader = new GLTFLoader().setDRACOLoader(draco);
  }
  return loader;
}
