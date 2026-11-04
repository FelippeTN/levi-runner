"""Sintetiza os efeitos sonoros e a música (groove de samba original) em assets/sfx/*.wav.
Uso: python3 tools/make_sfx.py assets/sfx
"""
import sys, wave
import numpy as np

SR = 22050
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env(dur, attack=0.005, decay=None):
    t = t_(dur)
    a = np.minimum(t / attack, 1.0)
    d = np.exp(-t / decay) if decay else np.clip(1 - t / dur, 0, 1)
    return a * d


def sweep(f0, f1, dur):
    t = t_(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(TAU * np.cumsum(f) / SR)


TAU = 2 * np.pi


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, k):
    """filtro de um polo; k em (0,1], menor = mais escuro"""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


def bandnoise(dur, k_lo, k_hi):
    n = noise(dur)
    return lowpass(n, k_hi) - lowpass(n, k_lo)


def tone(freq, dur, decay, harm=(1.0,)):
    t = t_(dur)
    return sum(a * np.sin(TAU * freq * (i + 1) * t) for i, a in enumerate(harm)) * env(dur, 0.003, decay)


def pluck(freq, dur, bright=0.5):
    """Karplus-Strong (cavaquinho/violão)"""
    n = int(SR / freq)
    buf = rng.uniform(-1, 1, n)
    out = np.empty(int(SR * dur))
    for i in range(len(out)):
        out[i] = buf[i % n]
        buf[i % n] = 0.5 * (buf[i % n] + buf[(i + 1) % n]) * (0.990 + 0.009 * bright)
    return out


def save(path, x, peak=0.8):
    x = np.asarray(x, float)
    assert np.isfinite(x).all() and len(x) > 0, path
    x = x / max(np.abs(x).max(), 1e-9) * peak
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def sfx(out):
    save(f"{out}/jump.wav", sweep(260, 720, 0.18) * env(0.18, 0.004) + 0.15 * bandnoise(0.18, 0.05, 0.4) * env(0.18))
    save(f"{out}/land.wav", sweep(140, 55, 0.14) * env(0.14, 0.002, 0.05) + 0.4 * lowpass(noise(0.14), 0.15) * env(0.14, 0.001, 0.03), 0.7)
    w = bandnoise(0.38, 0.02, 0.25)
    save(f"{out}/roll.wav", w * np.sin(np.pi * t_(0.38) / 0.38) ** 2, 0.6)
    w = bandnoise(0.14, 0.06, 0.5)
    save(f"{out}/swipe.wav", w * np.sin(np.pi * t_(0.14) / 0.14), 0.45)
    a = tone(987.8, 0.08, 0.05, (1, 0.3)), tone(1318.5, 0.25, 0.12, (1, 0.3, 0.1))
    save(f"{out}/coin.wav", np.concatenate([a[0], a[1]]), 0.5)
    save(f"{out}/stumble.wav", sweep(220, 70, 0.28) * env(0.28, 0.002, 0.1) + 0.5 * lowpass(noise(0.28), 0.3) * env(0.28, 0.001, 0.04), 0.8)
    boom = sweep(90, 30, 0.9) * env(0.9, 0.002, 0.25)
    crunch = lowpass(noise(0.9), 0.5) * env(0.9, 0.001, 0.12)
    ring = tone(523, 0.9, 0.35, (1, 0.5, 0.25, 0.2)) * 0.25
    save(f"{out}/crash.wav", boom + crunch + ring, 0.9)
    arp = [tone(f, 0.12, 0.1, (1, 0.4)) for f in (523.3, 659.3, 784.0, 1046.5)]
    save(f"{out}/powerup.wav", np.concatenate(arp + [tone(1318.5, 0.3, 0.15, (1, 0.4))]), 0.6)
    save(f"{out}/click.wav", tone(1800, 0.04, 0.01) + 0.3 * noise(0.04) * env(0.04, 0.0005, 0.005), 0.5)


# ---------- música: 8 compassos 4/4 a 104 BPM, em loop ----------
BPM = 104
STEP = 60 / BPM / 4  # semicolcheia
BARS = 8
N = int(SR * STEP * 16 * BARS)
# progressão I - VI7 - ii - V7 em Dó (2 compassos cada), notas em Hz
CHORDS = [
    (130.8, [261.6, 329.6, 392.0]),   # C
    (110.0, [220.0, 277.2, 329.6, 392.0]),  # A7
    (146.8, [293.7, 349.2, 440.0]),   # Dm
    (98.0, [196.0, 246.9, 293.7, 349.2]),  # G7
]
TAMBORIM = "x.xx.x.xx.xx.x.x"   # telecoteco próprio
CAVACO = "x..x..x...x..x.."
SURDO = {4: 0.5, 12: 1.0}       # marcação no 2 e resposta no 1
LEAD = [  # (passo absoluto, freq, duração em passos) — motivo simples sobre as notas dos acordes
    (2, 659.3, 2), (4, 784.0, 4), (10, 659.3, 2), (12, 587.3, 4),
    (34, 554.4, 2), (36, 659.3, 4), (42, 784.0, 2), (44, 659.3, 4),
    (66, 698.5, 2), (68, 587.3, 4), (74, 523.3, 2), (76, 587.3, 4),
    (98, 493.9, 2), (100, 587.3, 4), (106, 698.5, 2), (108, 659.3, 8),
]


def music(path):
    mix = np.zeros(N + SR * 2)

    def put(x, step, gain):
        i = int(step * STEP * SR)
        mix[i:i + len(x)] += gain * x

    surdo = sweep(85, 50, 0.5) * env(0.5, 0.003, 0.18)
    tamb = bandnoise(0.06, 0.3, 0.95) * env(0.06, 0.0005, 0.015) + tone(1250, 0.06, 0.02) * 0.6
    ganza = bandnoise(0.05, 0.5, 1.0) * env(0.05, 0.002, 0.012)
    caixa = bandnoise(0.12, 0.15, 0.8) * env(0.12, 0.001, 0.04)
    for bar in range(BARS):
        root, notes = CHORDS[bar // 2]
        for s in range(16):
            step = bar * 16 + s
            put(ganza, step, 0.10 if s % 4 in (0, 3) else 0.05)
            if TAMBORIM[s] == "x":
                put(tamb, step, 0.16)
            if s in SURDO:
                put(surdo, step, 0.9 * SURDO[s])
            if s in (6, 14) or (s == 11 and bar % 2):
                put(caixa, step, 0.10)
            if CAVACO[s] == "x":
                chord = sum(pluck(f, 0.35, 0.3) for f in notes) / len(notes)
                put(chord * env(0.35, 0.002, 0.15), step, 0.22)
            if s in (0, 6, 8, 14):
                f = root if s in (0, 8) else root * 1.5  # tônica e quinta
                put(tone(f / 2, 0.4, 0.16, (1, 0.5, 0.2)), step, 0.45)
    for step, f, length in LEAD:
        d = length * STEP
        vib = np.sin(TAU * f * t_(d) + 0.004 * f * np.sin(TAU * 5.5 * t_(d)) / 5.5)
        put(vib * env(d, 0.02, d * 0.8), step, 0.09)
    # rabo além do fim volta para o começo: loop sem emenda
    tail = mix[N:]
    mix = mix[:N]
    mix[:len(tail)] += tail
    save(path, np.tanh(mix * 1.4), 0.7)


if __name__ == "__main__":
    out = sys.argv[1]
    sfx(out)
    music(f"{out}/music.wav")
    print("ok:", out)
