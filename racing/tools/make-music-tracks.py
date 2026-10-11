"""מוזיקה לשני המסלולים הנוספים (ליער יש את music.mp3 מ-make-music.py):

  python3 racing/tools/make-music-tracks.py desert   -> racing/music-desert.mp3
  python3 racing/tools/make-music-tracks.py snow     -> racing/music-snow.mp3

מדבר: 110 BPM, סולם חיג'אז (מזרחי), דרבוקה ומלודיה "נשופה".
שלג: 96 BPM, פד רך עם הד גדול, ארפג'יו פעמוני, תופים קלים.
אותו מבנה כמו המוזיקה של היער: לולאה של 32 תיבות ועוד שתי תיבות שחוזרות על ההתחלה,
כדי שהמעבר בלולאה יהיה חלק. צריך numpy ו-ffmpeg.
"""

import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

STYLE = sys.argv[1] if len(sys.argv) > 1 else "desert"
if STYLE not in ("desert", "snow"):
    sys.exit("סגנון: desert או snow")

SR = 44100
BPM = 110 if STYLE == "desert" else 96
BEAT = 60 / BPM
BAR = BEAT * 4
SIX = BEAT / 4
LOOP_BARS = 32
TOTAL_BARS = LOOP_BARS + 2
N = int(round(TOTAL_BARS * BAR * SR))
rng = np.random.default_rng(11 if STYLE == "desert" else 23)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", f"music-{STYLE}.mp3")


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def at(t):
    return int(round(t * SR))


def env(n, a, d, s, r, sustain_len):
    e = np.zeros(n)
    A, D, R = max(1, at(a)), max(1, at(d)), max(1, at(r))
    S = max(0, min(n, at(sustain_len)) - A - D)
    i = 0
    seg = np.linspace(0, 1, A, endpoint=False); e[i:i + len(seg)] = seg[: n - i]; i += A
    if i < n:
        seg = np.linspace(1, s, D, endpoint=False); e[i:i + len(seg)] = seg[: n - i]; i += D
    if i < n:
        e[i:i + S] = s; i += S
    if i < n:
        seg = np.linspace(s, 0, R); e[i:i + len(seg)] = seg[: n - i]
    return e


def saw(f, n, cutoff, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, max(1, int(cutoff / f)) + 1):
        roll = 1.0 if k * f < cutoff * 0.6 else 0.5
        out += roll * np.sin(2 * np.pi * k * f * t + phase * k) / k
    return out * 0.55


def sine(f, n, vib=0.0, rate=5.0):
    """סינוס עם ויברטו שנכנס בהדרגה — צליל "נשוף" (חליל/ניי)"""
    t = np.arange(n) / SR
    wob = vib * np.sin(2 * np.pi * rate * t) * np.clip(t / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * 2 ** (wob / 12)) / SR
    breath = rng.standard_normal(n) * 0.02
    return np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph) + breath


def bell(f, n):
    """פעמון: סינוסים לא-הרמוניים עם דעיכה מהירה"""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, decay in ((1, 1, 3.5), (2.76, 0.45, 6), (5.4, 0.25, 9), (8.9, 0.12, 14)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * decay)
    return out * 0.5


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = at(start)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(sig)] += sig * gain * l * 1.414
    buf[1, i:i + len(sig)] += sig * gain * r * 1.414


def stem():
    return np.zeros((2, N))


def noise_hi(n, smooth=3):
    x = rng.standard_normal(n)
    return x - np.convolve(x, np.ones(smooth) / smooth, "same")


# ---------- כלי הקשה ----------

def kick(soft=False):
    n = at(0.45)
    t = np.arange(n) / SR
    f = 48 + (80 if soft else 110) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (9 if soft else 7.5))
    return np.tanh(body * (1.0 if soft else 1.6)) * (0.6 if soft else 1)


def doum():
    """דום: המכה הנמוכה של הדרבוקה — טון שיורד מהר"""
    n = at(0.35)
    t = np.arange(n) / SR
    f = 95 + 60 * np.exp(-t * 35)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * 0.95


def tek():
    """טק: המכה החדה בשוליים"""
    n = at(0.12)
    t = np.arange(n) / SR
    ring = np.sin(2 * np.pi * 620 * t) * np.exp(-t * 45) * 0.5
    return (noise_hi(n, 4) * np.exp(-t * 70) * 0.7 + ring) * 0.8


def hat(open_=False, soft=False):
    n = at(0.3 if open_ else 0.06)
    t = np.arange(n) / SR
    return noise_hi(n) * np.exp(-t * (14 if open_ else 70)) * (0.2 if soft else 0.35)


def shaker():
    n = at(0.09)
    t = np.arange(n) / SR
    return noise_hi(n, 2) * np.minimum(t / 0.02, 1) * np.exp(-t * 40) * 0.22


drums, bass, pad, arp, lead, fx = stem(), stem(), stem(), stem(), stem(), stem()
kicks = []

# ---------- מבנה: פתיחה, קטע A, קטע B עם מלודיה, שבירה, שיא ----------

def section(bar):
    b = bar % LOOP_BARS
    if b < 4:
        return dict(beat=b >= 2, bass=False, arp=True, lead=None, riser=False)
    if b < 12:
        return dict(beat=True, bass=True, arp=b >= 8, lead=None, riser=False)
    if b < 20:
        return dict(beat=True, bass=True, arp=True, lead="A", riser=False)
    if b < 24:
        return dict(beat=False, bass=False, arp=True, lead=None, riser=True)
    return dict(beat=True, bass=True, arp=True, lead="B", riser=False)


if STYLE == "desert":
    # חיג'אז על E: E F G# A B C D — אקורדים: E (מז'ור) – Dm – E – Am
    CHORDS = [
        {"root": 40, "pad": [52, 56, 59, 64], "arp": [64, 65, 68, 71]},
        {"root": 38, "pad": [50, 53, 57, 62], "arp": [62, 65, 69, 74]},
        {"root": 40, "pad": [52, 56, 59, 64], "arp": [64, 68, 71, 76]},
        {"root": 45, "pad": [57, 60, 64, 69], "arp": [69, 72, 76, 77]},
    ]
    LEAD_A = [
        (0, 4, 76), (4, 2, 77), (6, 2, 76), (8, 4, 80), (12, 4, 77),
        (16, 3, 76), (19, 1, 74), (20, 4, 72), (24, 8, 71),
        (32, 4, 76), (36, 2, 77), (38, 2, 80), (40, 4, 81), (44, 4, 80),
        (48, 2, 77), (50, 2, 76), (52, 4, 74), (56, 8, 76),
    ]
    LEAD_B = [
        (0, 2, 81), (2, 2, 80), (4, 4, 81), (8, 2, 83), (10, 2, 81), (12, 4, 80),
        (16, 4, 77), (20, 2, 80), (22, 2, 77), (24, 8, 76),
        (32, 2, 84), (34, 2, 83), (36, 4, 81), (40, 2, 80), (42, 2, 81), (44, 4, 80),
        (48, 2, 77), (50, 2, 76), (52, 2, 77), (54, 2, 80), (56, 8, 76),
    ]
else:
    # שלג: Dm – Bb – F – C, רך ופתוח
    CHORDS = [
        {"root": 38, "pad": [50, 57, 62, 65], "arp": [74, 77, 81, 86]},
        {"root": 34, "pad": [50, 53, 58, 62], "arp": [70, 74, 77, 82]},
        {"root": 41, "pad": [53, 57, 60, 65], "arp": [72, 77, 81, 84]},
        {"root": 36, "pad": [52, 55, 60, 64], "arp": [72, 76, 79, 84]},
    ]
    LEAD_A = [
        (0, 8, 74), (8, 4, 76), (12, 4, 77), (16, 12, 74), (28, 4, 72),
        (32, 8, 77), (40, 4, 76), (44, 4, 74), (48, 16, 72),
    ]
    LEAD_B = [
        (0, 6, 81), (6, 2, 79), (8, 8, 77), (16, 8, 74), (24, 8, 77),
        (32, 6, 79), (38, 2, 77), (40, 8, 76), (48, 8, 74), (56, 8, 72),
    ]

DOUM, TEK, KICK, SKICK = doum(), tek(), kick(), kick(True)
HAT, SHAT, OHAT, SHAKE = hat(), hat(soft=True), hat(True, True), shaker()

for bar in range(TOTAL_BARS):
    s = section(bar)
    t0 = bar * BAR
    chord = CHORDS[bar % 4]

    # ---- תופים ----
    if s["beat"]:
        if STYLE == "desert":
            # מקסום (Maqsum): דום-טק-טק-דום-טק, בשש-עשריות
            pattern = {0: "D", 2: "T", 3: "T", 6: "D", 8: "D", 10: "T", 12: "D", 14: "T"}
            for k, hit in pattern.items():
                add(drums, t0 + k * SIX, DOUM if hit == "D" else TEK, 1.0 if hit == "D" else 0.7, pan=0 if hit == "D" else 0.15)
                if hit == "D":
                    kicks.append(t0 + k * SIX)
            for k in range(16):
                add(drums, t0 + k * SIX, SHAKE, 0.8 if k % 2 == 0 else 0.5, pan=-0.3)
        else:
            for beat in (0, 2):
                add(drums, t0 + beat * BEAT, SKICK, 0.9)
                kicks.append(t0 + beat * BEAT)
            for k in range(8):
                add(drums, t0 + k * BEAT / 2, SHAT, 0.8 if k % 2 else 0.5, pan=0.3)
            add(drums, t0 + 3.5 * BEAT, OHAT, 0.7, pan=-0.2)
    elif STYLE == "snow" and bar % LOOP_BARS >= 22:
        for k in range(8):
            add(drums, t0 + k * BEAT / 2, SHAT, 0.5, pan=0.3)

    # ---- בס ----
    if s["bass"]:
        r = chord["root"]
        if STYLE == "desert":
            for k, (pos, step) in enumerate(((0, 0), (3, 0), (6, 7), (8, 0), (11, 1), (14, 0))):
                n = at(SIX * 2.2)
                f = hz(r + step)
                sig = saw(f, n, 700) + np.sin(2 * np.pi * f * np.arange(n) / SR) * 0.7
                add(bass, t0 + pos * SIX, sig * env(n, 0.004, 0.1, 0.5, 0.05, SIX * 2), 0.8)
        else:
            n = at(BAR)
            f = hz(r)
            sig = np.sin(2 * np.pi * f * np.arange(n) / SR) + 0.25 * np.sin(4 * np.pi * f * np.arange(n) / SR)
            add(bass, t0, sig * env(n, 0.08, 0.6, 0.6, 0.4, BAR * 0.95), 0.75)

    # ---- פד ----
    n = at(BAR + 0.5)
    sig = np.zeros(n)
    for m in chord["pad"]:
        for det, ph in ((-0.1, 0.3), (0.1, 1.7)):
            sig += saw(hz(m + det), n, 1800 if STYLE == "snow" else 2600, ph)
    e = env(n, 0.5 if STYLE == "snow" else 0.08, 0.6, 0.8, 0.5, BAR)
    add(pad, t0, sig * e * 0.08, pan=-0.4)
    add(pad, t0 + 0.015, sig * e * 0.08, pan=0.4)

    # ---- ארפג'יו ----
    if s["arp"]:
        order = [0, 1, 2, 3, 2, 1, 3, 2]
        step = SIX if STYLE == "desert" else SIX * 2
        count = 16 if STYLE == "desert" else 8
        for k in range(count):
            m = chord["arp"][order[k % 8]]
            if STYLE == "desert":
                n = at(SIX * 1.4)
                # עוד (קטרוס): צליל מרוט קצר
                t = np.arange(n) / SR
                pl = np.sin(2 * np.pi * hz(m - 12) * t) + 0.5 * np.sin(4 * np.pi * hz(m - 12) * t) + 0.2 * np.sin(6 * np.pi * hz(m - 12) * t)
                add(arp, t0 + k * step, pl * np.exp(-t * 16) * 0.5, pan=0.45 if k % 2 else -0.45)
            else:
                n = at(1.2)
                add(arp, t0 + k * step, bell(hz(m), n), 0.42, pan=0.5 if k % 2 else -0.5)

    # ---- מלודיה ----
    if s["lead"]:
        notes = LEAD_A if s["lead"] == "A" else LEAD_B
        base = (bar % 4) * 16
        for start, length, m in notes:
            if base <= start < base + 16:
                n = at(length * SIX + 0.15)
                if STYLE == "desert":
                    sig = sine(hz(m), n, vib=0.35, rate=5.5)
                else:
                    sig = sine(hz(m), n, vib=0.12, rate=4) * 0.8 + bell(hz(m + 12), n) * 0.25
                add(lead, t0 + (start - base) * SIX, sig * env(n, 0.04, 0.15, 0.75, 0.12, length * SIX), 0.5)

    # ---- רעש שעולה בשבירה ----
    if s["riser"]:
        n = at(BAR)
        b = bar % LOOP_BARS - 20
        t = (np.arange(n) / SR + b * BAR) / (4 * BAR)
        add(fx, t0, noise_hi(n, 4) * t ** 2 * (0.12 if STYLE == "snow" else 0.22))

# שאיבה עדינה מהבעיטות
pump = np.ones(N)
for tk in kicks:
    i = at(tk)
    length = at(BEAT * 0.8)
    curve = 1 - (0.3 if STYLE == "snow" else 0.45) * np.exp(-np.arange(length) / (SR * 0.09))
    pump[i:i + length] = np.minimum(pump[i:i + length], curve[: N - i])
for s_ in (bass, pad, arp):
    s_ *= pump


def write_wav(path, data):
    data = data / max(1e-9, np.abs(data).max()) * 0.9
    pcm = (data.T * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


with tempfile.TemporaryDirectory() as tmp:
    paths = {}
    for name, data in dict(drums=drums, bass=bass, pad=pad, arp=arp, lead=lead, fx=fx).items():
        paths[name] = os.path.join(tmp, f"{name}.wav")
        write_wav(paths[name], data + 1e-9)
    delay = int(round(SIX * 3 * 1000))
    big = "aecho=0.8:0.75:{d}|{d2}|{d3}:0.45|0.3|0.2".format(d=delay, d2=delay * 2, d3=delay * 3)
    small = "aecho=0.8:0.6:{d}|{d2}:0.3|0.15".format(d=delay, d2=delay * 2)
    echo = big if STYLE == "snow" else small
    graph = (
        f"[0:a]volume={0.85 if STYLE == 'snow' else 1.0}[d];"
        f"[1:a]volume=0.7[b];"
        f"[2:a]{echo},volume={0.5 if STYLE == 'snow' else 0.38}[p];"
        f"[3:a]{echo},volume={0.42 if STYLE == 'snow' else 0.34}[a];"
        f"[4:a]{echo},volume=0.5[l];"
        f"[5:a]volume=0.3[f];"
        f"[d][b][p][a][l][f]amix=inputs=6:normalize=0,"
        f"acompressor=threshold=0.25:ratio=3:attack=10:release=120:makeup=1.6,"
        f"alimiter=limit=0.89:level=false[out]"
    )
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for name in ("drums", "bass", "pad", "arp", "lead", "fx"):
        cmd += ["-i", paths[name]]
    cmd += ["-filter_complex", graph, "-map", "[out]", "-ar", str(SR), "-ac", "2",
            "-c:a", "libmp3lame", "-b:a", "128k", OUT]
    subprocess.run(cmd, check=True)

print(f"נוצר {os.path.normpath(OUT)} — לולאה של {LOOP_BARS * BAR:.2f} שניות ב-{BPM} BPM")
