"""Clipes de animação do Levi (Run, Jump, Roll, Land, StumbleL/R, Crash) gerados por keyframes.

Usado pelo prep_model.py (add_clips). Para conferir as poses sem o jogo:
    python3 tools/make_anims.py levi.glb /pasta/preview   -> PNGs de stick-figure + assert do joelho

Convenção do rig (Blender → glTF): coxa/canela/braço têm eixo X local ≈ -X do mundo,
então ângulo X positivo = membro para frente; joelho dobra com X negativo; spine/chest X positivo = inclina p/ frente.
"_hips_y" é a altura desejada do quadril; sample() ainda levanta o corpo se algo (cabeção incluso) entrar no chão.
"_lift" soma altura depois dessa correção (quique); "_spin" gira o corpo para frente em torno do próprio centro.
Jump e Roll são "scrubbed" pelo jogo (src/player.js): o tempo do clipe vem da física, não do relógio.
"""
import json, struct, sys
import numpy as np
from scipy.ndimage import maximum_filter1d, uniform_filter1d
from scipy.spatial.transform import Rotation as R

TAU = 2 * np.pi
HIPS_Y = 0.84
RUN_T = 0.6


def run(t):
    p = TAU * t / RUN_T
    s, c = np.sin(p), np.cos(p)
    # contato do pé L em p≈-0.26, do R meio ciclo depois: joelho de apoio amortece
    flex_l, flex_r = (0.45 * max(0.0, np.cos(p + 0.26 + k)) ** 3 for k in (0, np.pi))
    return {
        "thigh.L": (0.2 + 0.75 * s, 0, 0),
        "thigh.R": (0.2 - 0.75 * s, 0, 0),
        # chute do calcanhar na perna que volta
        "shin.L": (-(0.3 + flex_l + 1.4 * max(0.0, -np.sin(p + 0.9))), 0, 0),
        "shin.R": (-(0.3 + flex_r + 1.4 * max(0.0, np.sin(p + 0.9))), 0, 0),
        "foot.L": (0.3 * s, 0, 0),
        "foot.R": (-0.3 * s, 0, 0),
        "upper_arm.L": (-0.8 * s, 0, 0.18),
        "upper_arm.R": (0.8 * s, 0, -0.18),
        "forearm.L": (1.4 + 0.3 * s, 0, 0),
        "forearm.R": (1.4 - 0.3 * s, 0, 0),
        # quadril e peito torcem em sentidos opostos; quadril cai do lado da perna no ar
        "hips": (0, -0.14 * s, 0.05 * s),
        "spine": (0.2, 0.06 * s, -0.03 * s),
        "chest": (0.08, 0.16 * s, 0),
        "head": (-0.2 + 0.04 * c * c, -0.2 * s, 0.02 * s),
        # mais baixo no contato, mais alto no voo: quique de bola (bico no chão, arredondado no ar)
        "_hips_y": HIPS_Y - 0.1 + 0.14 * abs(np.sin(p + 0.26)),
    }


def lerp_pose(a, b, k):
    out = {}
    for key in set(a) | set(b):
        rest = HIPS_Y if key == "_hips_y" else 0.0 if key == "_lift" else (0, 0, 0)
        out[key] = np.array(a.get(key, rest)) * (1 - k) + np.array(b.get(key, rest)) * k
    return out


def keyed(keys):
    """keys: [(t, pose)] -> função de t com interpolação suave (smoothstep) entre poses."""
    def f(t):
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t <= t1:
                k = (t - t0) / (t1 - t0)
                return lerp_pose(a, b, k * k * (3 - 2 * k))
        return keys[-1][1]
    return f


def arms(x, z, fore):
    return {"upper_arm.L": (x, 0, z), "upper_arm.R": (x, 0, -z), "forearm.L": (fore, 0, 0), "forearm.R": (fore, 0, 0)}


# Jump: 0 = decolagem (vy máx), 0.35 = ápice, 0.7 = chegando no chão
JUMP = keyed([
    (0.0, {**run(0.15), "_hips_y": HIPS_Y}),
    (0.1, {"thigh.L": (1.3, 0, 0), "thigh.R": (-0.5, 0, 0), "shin.L": (-1.4, 0, 0), "shin.R": (-0.3, 0, 0),
           "foot.R": (-0.4, 0, 0), "upper_arm.L": (-0.6, 0, 0.3), "upper_arm.R": (1.9, 0, -0.3),
           "forearm.L": (0.9, 0, 0), "forearm.R": (0.6, 0, 0), "spine": (0.05, 0, 0), "chest": (0, -0.2, 0),
           "head": (-0.25, 0, 0), "_hips_y": HIPS_Y}),
    # ápice: passada de barreira, braços abertos
    (0.35, {"thigh.L": (1.5, 0, 0), "thigh.R": (-0.7, 0, 0), "shin.L": (-0.25, 0, 0), "shin.R": (-1.9, 0, 0),
            "foot.L": (-0.3, 0, 0), **arms(0.5, 1.2, 0.5), "spine": (0.3, 0, 0), "chest": (0.1, 0.25, 0),
            "head": (-0.35, -0.15, 0), "_hips_y": HIPS_Y}),
    (0.55, {"thigh.L": (0.8, 0, 0), "thigh.R": (0.1, 0, 0), "shin.L": (-0.9, 0, 0), "shin.R": (-1.0, 0, 0),
            **arms(1.3, 0.9, 0.4), "spine": (0.1, 0, 0), "head": (-0.15, 0, 0), "_hips_y": HIPS_Y}),
    # pernas esticadas buscando o chão
    (0.7, {"thigh.L": (0.45, 0, 0), "thigh.R": (0.25, 0, 0), "shin.L": (-0.45, 0, 0), "shin.R": (-0.35, 0, 0),
           "foot.L": (0.2, 0, 0), "foot.R": (0.2, 0, 0), **arms(0.8, 0.7, 0.6), "spine": (0.12, 0, 0), "_hips_y": HIPS_Y}),
])

CURL = {
    "thigh.L": (2.2, 0, 0), "thigh.R": (2.2, 0, 0), "shin.L": (-2.4, 0, 0), "shin.R": (-2.4, 0, 0),
    **arms(1.6, 0.1, 1.9), "spine": (0.7, 0, 0), "chest": (0.5, 0, 0), "head": (0.5, 0, 0), "_hips_y": 0.62,
}
# sai do rolamento com braços abertos (baixos: a hitbox ainda é a de rolamento)
TADA = {**run(0.0), **arms(1.0, 1.3, 0.2), "spine": (-0.05, 0, 0), "head": (-0.3, 0, 0), "_lift": 0.08}
ROLL_SPIN = (0.06, 0.48)


def roll(t):
    a, b = ROLL_SPIN
    if t < a:
        pose = lerp_pose(run(0.0), CURL, t / a)
    elif t < b:
        pose = dict(CURL)
    else:
        pose = keyed([(b, CURL), (0.6, TADA), (0.7, run(0.0))])(t)
    k = min(max((t - a) / (b - a), 0.0), 1.0)
    # cambalhota para frente; acelera e freia (smoothstep) para dar "punch"
    pose["_spin"] = TAU * k * k * (3 - 2 * k)
    return pose


SQUASH = {"thigh.L": (1.1, 0, 0), "thigh.R": (0.9, 0, 0), "shin.L": (-1.7, 0, 0), "shin.R": (-1.5, 0, 0),
          "foot.L": (0.5, 0, 0), "foot.R": (0.5, 0, 0), **arms(0.3, 0.7, 0.5), "spine": (0.45, 0, 0), "chest": (0.15, 0, 0),
          "head": (-0.35, 0, 0), "_hips_y": HIPS_Y - 0.28}
LAND = keyed([
    (0.0, JUMP(0.7)),
    (0.07, SQUASH),
    (0.25, run(0.0)),
])


def stumble(side):
    s = 1 if side == "L" else -1
    hit = {**run(0.15), "spine": (0.35, 0.3 * s, 0.45 * s), "chest": (0.2, 0.2 * s, 0.2 * s), "head": (0.2, 0.3 * s, 0.3 * s),
           "upper_arm.L": (0.8, 0, 1.2), "upper_arm.R": (0.8, 0, -1.2), "forearm.L": (0.4, 0, 0), "forearm.R": (0.4, 0, 0)}
    wobble = {**run(0.3), "spine": (0.25, -0.12 * s, -0.15 * s), "head": (-0.1, -0.15 * s, -0.1 * s), **arms(0.4, 0.8, 0.8)}
    return keyed([(0.0, run(0.0)), (0.1, hit), (0.28, wobble), (0.5, run(0.0))])


FLAT = {"hips": (-1.5, 0, 0), "spine": (-0.1, 0, 0), "head": (0.3, 0, 0), "_hips_y": 0.0}
CRASH = keyed([
    (0.0, run(0.0)),
    # pancada: chicote para trás, braços e uma perna voando
    (0.12, {"hips": (-0.5, 0, 0), "spine": (-0.35, 0, 0), "head": (-0.5, 0, 0), **arms(2.3, 1.0, 0.3),
            "thigh.L": (0.9, 0, 0), "thigh.R": (0.2, 0, 0), "shin.L": (-0.3, 0, 0), "shin.R": (-0.8, 0, 0), "_hips_y": HIPS_Y}),
    # de costas, pernas pro alto
    (0.45, {**FLAT, **arms(2.6, 1.3, 0.4), "thigh.L": (1.9, 0, 0), "thigh.R": (1.5, 0, 0), "shin.L": (-0.3, 0, 0), "shin.R": (-0.6, 0, 0)}),
    (0.6, {**FLAT, **arms(2.2, 1.0, 0.6), "thigh.L": (1.6, 0, 0), "thigh.R": (1.3, 0, 0), "shin.L": (-0.6, 0, 0), "shin.R": (-0.9, 0, 0),
           "_lift": 0.18}),
    # desaba, membros moles
    (0.8, {**FLAT, **arms(2.7, 1.4, 0.3), "thigh.L": (1.2, 0, 0), "thigh.R": (0.8, 0, 0), "shin.L": (-0.9, 0, 0), "shin.R": (-1.2, 0, 0)}),
    (1.0, {**FLAT, **arms(2.8, 1.45, 0.25), "thigh.L": (1.1, 0, 0), "thigh.R": (0.75, 0, 0), "shin.L": (-1.0, 0, 0), "shin.R": (-1.3, 0, 0),
           "head": (0.45, 0.4, 0)}),
])

# nome -> (função de pose, duração, fps)
CLIPS = {
    "Run": (run, RUN_T, 30),
    "Jump": (JUMP, 0.7, 30),
    "Roll": (roll, 0.7, 30),
    "Land": (LAND, 0.25, 30),
    "StumbleL": (stumble("L"), 0.5, 30),
    "StumbleR": (stumble("R"), 0.5, 30),
    "Crash": (CRASH, 1.0, 30),
}
BONES = ["hips", "spine", "chest", "head", "thigh.L", "thigh.R", "shin.L", "shin.R", "foot.L", "foot.R",
         "upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R"]
# cabeção do Levi (malha vai até y≈3.0 com o osso da cabeça em 1.62): esfera para não atravessar o chão
HEAD_CENTER, HEAD_R = np.array([0.0, 2.22, 0.0]), 0.62
LIMB_R = 0.06


def local_quat(rest_xyzw, euler):
    return (R.from_quat(rest_xyzw) * R.from_euler("XYZ", euler)).as_quat()


def body_points(gltf, rots_at, hips):
    """Juntas do esqueleto + centro do cabeção."""
    m = fk(gltf, rots_at, hips, mats=True)
    rest = fk(gltf, {}, HIPS_Y, mats=True)["head"]
    head_c = (m["head"] @ np.linalg.inv(rest) @ np.append(HEAD_CENTER, 1))[:3]
    return np.array([v[:3, 3] for k, v in m.items() if k not in ("Levi", "LeviRig", "root")]), head_c


def ground_lift(gltf, rots_at, hips):
    """Quanto subir o quadril para nada ficar abaixo do chão."""
    joints, head_c = body_points(gltf, rots_at, hips)
    return max(0.0, -min(joints[:, 1].min() - LIMB_R, head_c[1] - HEAD_R))


def center(gltf, rots_at, hips):
    """Centro da caixa que envolve o corpo (cabeção incluso): pivô mais redondo para a cambalhota."""
    joints, head_c = body_points(gltf, rots_at, hips)
    pts = np.vstack([joints, head_c - HEAD_R, head_c + HEAD_R])
    return (pts.min(0) + pts.max(0)) / 2


def sample(gltf, name):
    fn, dur, fps = CLIPS[name]
    nodes = {n["name"]: n for n in gltf["nodes"]}
    times = np.linspace(0, dur, int(dur * fps) + 1).astype(np.float32)
    rots = {b: [] for b in BONES}
    hips_t, lifts, extra, spun = [], [], [], False
    for t in times:
        pose = fn(float(t))
        frame = {b: local_quat(nodes[b].get("rotation", [0, 0, 0, 1]), pose.get(b, (0, 0, 0))) for b in BONES}
        hips = np.array([0.0, float(pose.get("_hips_y", HIPS_Y)), 0.0])
        spin = float(pose.get("_spin", 0.0))
        if spin:
            spun = True
            c0 = center(gltf, frame, hips)
            frame["hips"] = local_quat(nodes["hips"].get("rotation", [0, 0, 0, 1]), np.array(pose.get("hips", (0, 0, 0))) + (spin, 0, 0))
            hips += c0 - center(gltf, frame, hips)
            hips[0] = 0.0
        lifts.append(ground_lift(gltf, frame, hips))
        extra.append(float(pose.get("_lift", 0.0)))
        for b in BONES:
            rots[b].append(frame[b])
        hips_t.append(hips)
    lifts = np.array(lifts)
    if spun:
        # na cambalhota a parte mais baixa troca a cada quadro: max-filter + média na mesma janela suaviza
        # sem nunca ficar abaixo do necessário; pontas ficam cruas para casar com os outros clipes
        lifts[1:-1] = uniform_filter1d(maximum_filter1d(lifts, 3, mode="nearest"), 3, mode="nearest")[1:-1]
    for h, l, e in zip(hips_t, lifts, extra):
        h[1] += l + e
    # quaternions contínuos (sem trocar de hemisfério) para o slerp não dar a volta errada
    for b in BONES:
        q = np.array(rots[b])
        for i in range(1, len(q)):
            if np.dot(q[i], q[i - 1]) < 0:
                q[i] = -q[i]
        rots[b] = q.astype(np.float32)
    return times, rots, np.array(hips_t, np.float32)


def add_clips(gltf, append):
    idx = {n["name"]: i for i, n in enumerate(gltf["nodes"])}
    gltf["animations"] = [a for a in gltf["animations"] if a["name"] not in CLIPS]

    def accessor(arr, typ, minmax=False):
        raw = arr.astype("<f4").tobytes()
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": append(raw), "byteLength": len(raw)})
        a = {"bufferView": len(gltf["bufferViews"]) - 1, "componentType": 5126, "count": len(arr), "type": typ}
        if minmax:
            a["min"], a["max"] = [float(arr.min())], [float(arr.max())]
        gltf["accessors"].append(a)
        return len(gltf["accessors"]) - 1

    for name in CLIPS:
        times, rots, hips_t = sample(gltf, name)
        t_acc = accessor(times, "SCALAR", minmax=True)
        samplers, channels = [], []
        for b in BONES:
            samplers.append({"input": t_acc, "output": accessor(rots[b], "VEC4"), "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": idx[b], "path": "rotation"}})
        samplers.append({"input": t_acc, "output": accessor(hips_t, "VEC3"), "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": idx["hips"], "path": "translation"}})
        gltf["animations"].append({"name": name, "samplers": samplers, "channels": channels})


# ---------- preview / checagem ----------

def fk(gltf, rots_at, hips, mats=False):
    """hips: altura (y) ou translação xyz do quadril."""
    nodes = gltf["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    idx = {n["name"]: i for i, n in enumerate(nodes)}

    def local(i):
        n = nodes[i]
        m = np.eye(4)
        q = rots_at.get(n["name"], n.get("rotation", [0, 0, 0, 1]))
        m[:3, :3] = R.from_quat(q).as_matrix()
        m[:3, 3] = n.get("translation", [0, 0, 0])
        if n["name"] == "hips":
            m[:3, 3] = hips if np.ndim(hips) else (0, hips, 0)
        return m

    def world(i):
        m = local(i)
        while i in parent:
            i = parent[i]
            m = local(i) @ m
        return m if mats else m[:3, 3]

    return {k: world(i) for k, i in idx.items()}


LIMBS = [("hips", "spine"), ("spine", "chest"), ("chest", "neck"), ("neck", "head"),
         ("hips", "thigh.L"), ("thigh.L", "shin.L"), ("shin.L", "foot.L"), ("foot.L", "toe.L"),
         ("hips", "thigh.R"), ("thigh.R", "shin.R"), ("shin.R", "foot.R"), ("foot.R", "toe.R"),
         ("chest", "shoulder.L"), ("shoulder.L", "upper_arm.L"), ("upper_arm.L", "forearm.L"), ("forearm.L", "hand.L"),
         ("chest", "shoulder.R"), ("shoulder.R", "upper_arm.R"), ("upper_arm.R", "forearm.R"), ("forearm.R", "hand.R")]


def check_knees(gltf, name):
    times, rots, hips_t = sample(gltf, name)
    for i in range(len(times)):
        p = fk(gltf, {b: rots[b][i] for b in BONES}, hips_t[i])
        for s in "LR":
            hip, knee, foot = p[f"thigh.{s}"], p[f"shin.{s}"], p[f"foot.{s}"]
            # no referencial da coxa: canela dobrando para trás => cross.x >= 0
            d1, d2 = knee - hip, foot - knee
            cross_x = d1[1] * d2[2] - d1[2] * d2[1]
            assert cross_x > -0.02, f"{name}: joelho {s} dobrando para frente em t={times[i]:.2f} ({cross_x:.3f})"


def preview(gltf, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    for name in CLIPS:
        check_knees(gltf, name)
        times, rots, hips_t = sample(gltf, name)
        frames = np.linspace(0, len(times) - 1, 6).astype(int)
        fig, axs = plt.subplots(2, 6, figsize=(15, 6))
        for c, i in enumerate(frames):
            p = fk(gltf, {b: rots[b][i] for b in BONES}, hips_t[i])
            for r, (h, lab) in enumerate([(2, "lado (z→ frente)"), (0, "frente (x)")]):
                ax = axs[r, c]
                for a, b in LIMBS:
                    col = "tab:red" if a.endswith(".L") or b.endswith(".L") else "tab:blue" if a.endswith(".R") or b.endswith(".R") else "k"
                    ax.plot([p[a][h], p[b][h]], [p[a][1], p[b][1]], color=col, lw=2)
                ax.set_xlim(-1, 1); ax.set_ylim(-0.1, 1.9); ax.set_aspect("equal"); ax.grid(alpha=.3)
                ax.set_title(f"{name} t={times[i]:.2f} {lab}", fontsize=7)
        fig.tight_layout()
        fig.savefig(f"{out}/{name}.png", dpi=70)
        plt.close(fig)
    print("ok: poses salvas e joelhos conferidos")


if __name__ == "__main__":
    data = open(sys.argv[1], "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    preview(json.loads(data[20:20 + jlen]), sys.argv[2])
