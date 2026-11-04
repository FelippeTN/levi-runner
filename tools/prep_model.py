"""Converte levi.glb para algo que o loader glTF do Bevy aceita sem extensões:
dequantiza atributos normalizados (KHR_mesh_quantization) e troca WebP por PNG.
Uso: python3 tools/prep_model.py levi.glb assets/levi.glb
"""
import io, json, struct, sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
jlen = struct.unpack("<I", data[12:16])[0]
gltf = json.loads(data[20:20 + jlen])
bin_in = data[20 + jlen + 8:]

DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
MAX_TEX = 2048  # 4096 deixa o carregamento no wasm lento
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

out = bytearray()
def append(b):
    while len(out) % 4:
        out.append(0)
    off = len(out)
    out.extend(b)
    return off

def read_accessor(a):
    bv = gltf["bufferViews"][a["bufferView"]]
    dt = np.dtype(DT[a["componentType"]])
    n = NCOMP[a["type"]]
    stride = bv.get("byteStride", dt.itemsize * n)
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    rows = [np.frombuffer(bin_in, dt, n, base + i * stride) for i in range(a["count"])]
    arr = np.array(rows, dtype=np.float32)
    if a.get("normalized"):
        arr = np.maximum(arr / np.iinfo(dt).max, -1.0) if dt.kind == "i" else arr / np.iinfo(dt).max
    return arr

# copia bufferViews originais; imagens viram PNG
img_views = {img["bufferView"]: img for img in gltf["images"]}
for i, bv in enumerate(gltf["bufferViews"]):
    raw = bin_in[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
    if i in img_views:
        buf = io.BytesIO()
        im = Image.open(io.BytesIO(raw))
        im.thumbnail((MAX_TEX, MAX_TEX))
        im.save(buf, "PNG")
        raw = buf.getvalue()
        img_views[i]["mimeType"] = "image/png"
    bv["byteOffset"] = append(raw)
    bv["byteLength"] = len(raw)

# atributos normalizados -> float32; accessor sem bufferView (= zeros pela spec) ganha um buffer zerado,
# porque o loader do Bevy recusa
for a in gltf["accessors"]:
    if "bufferView" not in a:
        raw = bytes(a["count"] * NCOMP[a["type"]] * np.dtype(DT[a["componentType"]]).itemsize)
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": append(raw), "byteLength": len(raw)})
        a["bufferView"] = len(gltf["bufferViews"]) - 1
    elif a.get("normalized") and a["componentType"] != 5126:
        arr = read_accessor(a)
        if a["componentType"] == 5120 and a["type"] == "VEC3":  # normais: renormaliza
            arr /= np.maximum(np.linalg.norm(arr, axis=1, keepdims=True), 1e-8)
        raw = arr.astype("<f4").tobytes()
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": append(raw), "byteLength": len(raw)})
        a["bufferView"] = len(gltf["bufferViews"]) - 1
        a.pop("byteOffset", None)
        a.pop("normalized", None)
        a["componentType"] = 5126
        a.pop("min", None); a.pop("max", None)

from make_anims import add_clips  # Run, Jump, Roll, Land, StumbleL/R, Crash
add_clips(gltf, append)

for t in gltf["textures"]:
    ext = t.pop("extensions", {}).get("EXT_texture_webp")
    if ext:
        t["source"] = ext["source"]
gltf["extensionsRequired"] = [e for e in gltf.get("extensionsRequired", []) if e not in ("KHR_mesh_quantization", "EXT_texture_webp")]
gltf["extensionsUsed"] = [e for e in gltf.get("extensionsUsed", []) if e not in ("KHR_mesh_quantization", "EXT_texture_webp")]
if not gltf["extensionsRequired"]:
    del gltf["extensionsRequired"]

while len(out) % 4:
    out.append(0)
gltf["buffers"] = [{"byteLength": len(out)}]
js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
open(dst, "wb").write(glb)

# o loader do Bevy recusa o arquivo inteiro se algo disso falhar
assert all("bufferView" in a for a in gltf["accessors"]), "accessor sem bufferView"
assert all(c["target"]["node"] < len(gltf["nodes"]) for an in gltf["animations"] for c in an["channels"])
assert all(bv["byteOffset"] + bv["byteLength"] <= len(out) for bv in gltf["bufferViews"])
print(f"ok: {dst} ({len(glb)} bytes) anims={[a['name'] for a in gltf['animations']]}")
