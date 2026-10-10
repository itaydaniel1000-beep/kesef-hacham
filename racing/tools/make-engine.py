"""קול המנוע: שלוש הקלטות מדומות של מנוע 4 צילינדרים בסל"ד קבוע, ל-engine.wav.

  python3 racing/tools/make-engine.py

כל הצתה היא פולס קצר שעובר דרך התהודות של האגזוז. הפולסים לא זהים —
כל צילינדר קצת שונה וכל פיצוץ קצת אחר — וזה מה שהופך את זה מצפצוף למנוע.
כל לולאה נחתכת על מספר שלם של מחזורי מנוע, והזנבות של הפולסים נעטפים
לתחילת הלולאה, כך שאין קליק כשהיא חוזרת. בדפדפן משנים את מהירות הניגון
לפי הסל"ד ועוברים בהדרגה בין שלוש ההקלטות.

הקובץ הוא WAV ולא MP3: MP3 מוסיף שקט קצר בקצוות, שהיה נשמע כקליק בכל סיבוב של הלולאה.
"""

import json
import os
import wave

import numpy as np

SR = 22050
LOOP_SECONDS = 1.6
RPMS = [1600, 3600, 6400]  # חייב להתאים ל-ENGINE_RPMS ב-audio.js
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine.wav")
rng = np.random.default_rng(11)


def band_noise(n, lo, hi):
    """רעש מסונן בתחום תדרים, מחושב בהתמרת פורייה — מעגלי, ולכן חוזר בלולאה בלי תפר"""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= np.exp(-0.5 * ((np.log(np.maximum(f, 1)) - np.log(np.sqrt(lo * hi))) / (np.log(hi / lo) / 2)) ** 2)
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def render(rpm):
    fire = rpm / 60 * 2                 # 4 צילינדרים, 4 פעימות: שתי הצתות לכל סיבוב
    cycle = 4 / fire                    # מחזור מנוע מלא: כל ארבעת הצילינדרים
    cycles = max(1, round(LOOP_SECONDS / cycle))
    n = int(round(cycles * cycle * SR))
    out = np.zeros(n)
    hi = (rpm - RPMS[0]) / (RPMS[-1] - RPMS[0])  # 0 בסל"ד נמוך, 1 בגבוה

    # צורת הפולס: תהודות האגזוז. בסל"ד גבוה הן קצרות ומחוספסות יותר
    plen = int(SR * 0.05)
    t = np.arange(plen) / SR
    body = (np.sin(2 * np.pi * 105 * t) * np.exp(-t / 0.018)
            + 0.7 * np.sin(2 * np.pi * 330 * t + 0.6) * np.exp(-t / (0.009 - 0.003 * hi))
            + 0.35 * np.sin(2 * np.pi * 760 * t + 1.1) * np.exp(-t / 0.004))
    # הפיצוץ עצמו: רעש קצר, מוחלק כדי שיישמע כמו חספוס ולא כמו רחש
    crack = np.convolve(rng.standard_normal(plen), np.ones(4) / 2, "same")
    crack *= np.exp(-t / (0.0025 + 0.002 * hi)) * (0.45 + 0.5 * hi)

    # כל צילינדר מעט שונה בעוצמה ובצבע — זה הגרגור של המנוע
    cylinders = [1.0, 0.82, 0.93, 0.77]
    times = np.arange(cycles * 4) / fire
    for k, start in enumerate(times):
        jitter = 1 + 0.07 * rng.standard_normal()
        drift = int((rng.standard_normal() * 0.0004) * SR)  # הזזה זעירה בזמן
        pulse = (body * cylinders[k % 4] + crack * (0.8 + 0.4 * rng.random())) * jitter
        idx = (int(round(start * SR)) + drift + np.arange(plen)) % n  # הזנב נעטף לתחילת הלולאה
        np.add.at(out, idx, pulse)

    # סיבוב גל הארכובה: צליל נמוך בחצי מתדר ההצתה
    tt = np.arange(n) / SR
    out += 0.25 * np.sin(2 * np.pi * fire / 2 * tt)
    # יניקה: רעש אוויר שפועם עם ההצתות
    pulse_env = 0.6 + 0.4 * np.cos(2 * np.pi * fire * tt) ** 2
    out += band_noise(n, 400 + 500 * hi, 1600 + 1600 * hi) * pulse_env * (0.15 + 0.25 * hi)
    # רוויה עדינה — מה שנותן לאגזוז את ה"נביחה"
    out = np.tanh(out * 1.4)
    out -= out.mean()
    return out / (np.abs(out).max() + 1e-9) * 0.9


loops = [render(r) for r in RPMS]
data = np.concatenate(loops)
with wave.open(OUT, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((data * 32767).astype("<i2").tobytes())

info = [{"rpm": r, "start": int(sum(len(l) for l in loops[:i])), "length": len(loops[i])} for i, r in enumerate(RPMS)]
print(os.path.normpath(OUT), json.dumps(info))
