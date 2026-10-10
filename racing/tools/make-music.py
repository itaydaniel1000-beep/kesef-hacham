"""מוזיקת הרקע של המשחק: מסלול אלקטרו של 128 BPM, נבנה מאפס ונשמר ל-music.mp3.

  python3 racing/tools/make-music.py

צריך numpy ו-ffmpeg. הכלים מייצרים ערוצים נפרדים (תופים, בס, פד, ארפג'יו, מלודיה),
ו-ffmpeg מוסיף הד, מחבר, דוחס ומקודד. הלולאה היא 32 תיבות (60 שניות בדיוק),
ועוד שתי תיבות בסוף שחוזרות על ההתחלה כדי שהמעבר בלולאה יהיה חלק.
"""

import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
SIX = BEAT / 4  # שש-עשרית
LOOP_BARS = 32
TOTAL_BARS = LOOP_BARS + 2
N = int(round(TOTAL_BARS * BAR * SR))
rng = np.random.default_rng(7)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "music.mp3")


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def at(t):
    return int(round(t * SR))


def env(n, a, d, s, r, sustain_len):
    """מעטפת ADSR באורך n דגימות"""
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
    """מסור מוגבל-פס: סכום הרמוניות עד התדר החוסם — נשמע כמו מסנן נמוך"""
    t = np.arange(n) / SR
    out = np.zeros(n)
    k_max = max(1, int(cutoff / f))
    for k in range(1, k_max + 1):
        roll = 1.0 if k * f < cutoff * 0.6 else 0.5
        out += roll * np.sin(2 * np.pi * k * f * t + phase * k) / k
    return out * 0.55


def square(f, n, cutoff, vib=0.0):
    t = np.arange(n) / SR
    wobble = vib * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.25, 0, 1)
    out = np.zeros(n)
    for k in range(1, max(2, int(cutoff / f)) + 1, 2):
        out += np.sin(2 * np.pi * k * f * (t + wobble / (2 * np.pi * 5.5 * f + 1e-9))) / k
    return out * 0.7


def add(buf, start, sig, gain=1.0, pan=0.0):
    """מוסיף צליל לערוץ סטריאו במיקום start (שניות), עם פאנינג"""
    i = at(start)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(sig)] += sig * gain * l * 1.414
    buf[1, i:i + len(sig)] += sig * gain * r * 1.414


def stem():
    return np.zeros((2, N))


# ---------- הרמוניה: Am – F – C – G ----------

CHORDS = [
    {"root": 33, "pad": [57, 60, 64, 69], "arp": [69, 72, 76, 81]},  # Am
    {"root": 29, "pad": [53, 57, 60, 65], "arp": [65, 69, 72, 77]},  # F
    {"root": 36, "pad": [55, 60, 64, 67], "arp": [67, 72, 76, 79]},  # C
    {"root": 31, "pad": [55, 59, 62, 67], "arp": [67, 71, 74, 79]},  # G
]

# מלודיה: (שש-עשרית התחלה, אורך בשש-עשריות, תו) על פני 4 תיבות
LEAD_A = [
    (0, 3, 76), (3, 1, 76), (4, 2, 74), (6, 2, 72), (8, 4, 74), (12, 4, 76),
    (16, 3, 77), (19, 1, 76), (20, 2, 74), (22, 2, 72), (24, 6, 69), (30, 2, 72),
    (32, 3, 76), (35, 1, 76), (36, 2, 79), (38, 2, 76), (40, 4, 74), (44, 4, 72),
    (48, 2, 74), (50, 2, 76), (52, 2, 74), (54, 2, 71), (56, 8, 67),
]
LEAD_B = [
    (0, 3, 81), (3, 1, 81), (4, 2, 79), (6, 2, 76), (8, 4, 79), (12, 4, 81),
    (16, 3, 84), (19, 1, 81), (20, 2, 79), (22, 2, 77), (24, 6, 77), (30, 2, 76),
    (32, 3, 79), (35, 1, 79), (36, 2, 84), (38, 2, 79), (40, 4, 76), (44, 4, 72),
    (48, 2, 74), (50, 2, 76), (52, 2, 79), (54, 2, 83), (56, 4, 81), (60, 4, 83),
]

# מבנה: לכל תיבה אילו כלים מנגנים
#   0-3 פתיחה | 4-11 קטע A | 12-19 קטע B עם מלודיה | 20-23 שבירה | 24-31 שיא
def section(bar):
    b = bar % LOOP_BARS
    if b < 4:
        return dict(kick=b >= 2, clap=False, hat=True, bass=False, pad=True, arp=True, lead=None, fill=b == 3)
    if b < 12:
        return dict(kick=True, clap=True, hat=True, bass=True, pad=True, arp=b >= 8, lead=None, fill=b == 11)
    if b < 20:
        return dict(kick=True, clap=True, hat=True, bass=True, pad=True, arp=True, lead="A", fill=b == 19)
    if b < 24:
        return dict(kick=False, clap=False, hat=b >= 22, bass=False, pad=True, arp=True, lead=None, fill=b == 23, riser=True)
    return dict(kick=True, clap=True, hat=True, bass=True, pad=True, arp=True, lead="B", fill=b == 31)


# ---------- כלים ----------

def kick():
    n = at(0.45)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.6)


def clap():
    n = at(0.35)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # מסנן פס גס: הפרש של שני ממוצעים נעים
    hi = noise - np.convolve(noise, np.ones(6) / 6, "same")
    bursts = sum(np.exp(-np.maximum(t - d, 0) * 60) * (t >= d) for d in (0, 0.011, 0.023))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return (hi * bursts * 0.5 + tone) * np.exp(-t * 9)


def hat(open_=False):
    n = at(0.3 if open_ else 0.06)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hi = noise - np.convolve(noise, np.ones(3) / 3, "same")
    return hi * np.exp(-t * (14 if open_ else 70)) * 0.35


KICK, CLAP, HAT, OHAT = kick(), clap(), hat(), hat(True)

drums, bass, pad, arp, lead, fx = stem(), stem(), stem(), stem(), stem(), stem()
kicks = []  # זמני הבעיטות — לשאיבה (sidechain)

for bar in range(TOTAL_BARS):
    s = section(bar)
    t0 = bar * BAR
    chord = CHORDS[bar % 4]

    for beat in range(4):
        tb = t0 + beat * BEAT
        if s["kick"]:
            add(drums, tb, KICK, 1.0)
            kicks.append(tb)
        if s["clap"] and beat in (1, 3):
            add(drums, tb, CLAP, 0.55, pan=0.05)
    if s["hat"]:
        for k in range(16):
            if s["fill"] and k >= 12 and s["kick"]:
                continue
            accent = 0.9 if k % 4 == 2 else 0.5 if k % 2 == 0 else 0.35
            add(drums, t0 + k * SIX, OHAT if k % 4 == 2 else HAT, accent, pan=0.25 if k % 2 else -0.15)
    if s["fill"]:
        # תופי מעבר: מחיאות בשש-עשריות שמתגברות לסוף התיבה
        for k in range(12, 16):
            add(drums, t0 + k * SIX, CLAP, 0.25 + 0.1 * (k - 12), pan=(k - 13.5) * 0.2)

    if s["bass"]:
        r = chord["root"]
        pattern = [0, 0, 12, 0, 0, 12, 0, 7]
        for k, step in enumerate(pattern):
            n = at(BEAT / 2 * 0.9)
            f = hz(r + step)
            sig = saw(f, n, 900 + 500 * (k % 2)) + np.sin(2 * np.pi * f * np.arange(n) / SR) * 0.6
            add(bass, t0 + k * BEAT / 2, sig * env(n, 0.003, 0.08, 0.6, 0.03, BEAT / 2 * 0.8), 0.8)

    if s["pad"]:
        n = at(BAR + 0.4)
        sig = np.zeros(n)
        for m in chord["pad"]:
            for det, ph in ((-0.12, 0.3), (0.0, 1.1), (0.12, 2.0)):
                sig += saw(hz(m + det), n, 3200, ph)
        e = env(n, 0.06, 0.4, 0.75, 0.4, BAR)
        add(pad, t0, sig * e * 0.09, pan=-0.35)
        add(pad, t0 + 0.012, sig * e * 0.09, pan=0.35)  # הפרש קטן בין הצדדים = רוחב

    if s["arp"]:
        order = [0, 1, 2, 3, 2, 1, 2, 3]
        for k in range(16):
            m = chord["arp"][order[k % 8]] - 12
            n = at(SIX * 1.6)
            sig = square(hz(m), n, 3500) * env(n, 0.002, 0.09, 0.15, 0.05, SIX)
            add(arp, t0 + k * SIX, sig, 0.35, pan=0.5 if k % 2 else -0.5)

    if s["lead"]:
        notes = LEAD_A if s["lead"] == "A" else LEAD_B
        base = (bar % 4) * 16
        for start, length, m in notes:
            if base <= start < base + 16:
                n = at(length * SIX + 0.05)
                sig = (square(hz(m), n, 5000, vib=0.25) * 0.7 + saw(hz(m + 0.08), n, 4000) * 0.5)
                add(lead, t0 + (start - base) * SIX, sig * env(n, 0.01, 0.1, 0.7, 0.06, length * SIX), 0.5)

    if s.get("riser"):
        # רעש שעולה לאורך השבירה ונשבר בתחילת השיא
        n = at(BAR)
        b = bar % LOOP_BARS - 20
        t = (np.arange(n) / SR + b * BAR) / (4 * BAR)
        noise = rng.standard_normal(n)
        hi = noise - np.convolve(noise, np.ones(4) / 4, "same")
        add(fx, t0, hi * t ** 2 * 0.25)

# שאיבה: הבס, הפד והארפג'יו נחלשים לרגע בכל בעיטה — הסאונד הקלאסי של מוזיקת ריקודים
pump = np.ones(N)
for tk in kicks:
    i = at(tk)
    length = at(BEAT * 0.9)
    curve = 1 - 0.65 * np.exp(-np.arange(length) / (SR * 0.09))
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
    delay = int(round(SIX * 3 * 1000))  # הד בשמינית מנוקדת
    graph = (
        f"[0:a]volume=1.0[d];"
        f"[1:a]volume=0.75[b];"
        f"[2:a]aecho=0.8:0.6:{delay}|{delay * 2}|90:0.3|0.18|0.25,volume=0.42[p];"
        f"[3:a]aecho=0.8:0.7:{delay}|{delay * 2}:0.35|0.2,volume=0.30[a];"
        f"[4:a]aecho=0.8:0.7:{delay}|{delay * 2}:0.3|0.15,volume=0.50[l];"
        f"[5:a]volume=0.35[f];"
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

print(f"נוצר {os.path.normpath(OUT)} — לולאה של {LOOP_BARS * BAR:.2f} שניות")
