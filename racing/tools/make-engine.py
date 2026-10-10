"""קול המנוע: שלוש הקלטות מדומות של מנוע 4 צילינדרים בסל"ד קבוע, ל-engine.wav.

  python3 racing/tools/make-engine.py

הצליל בנוי מההרמוניות של תדר ההצתה, עם צבע חם ותהודת אגזוז עדינה,
ועוד הרמוניות חלשות של מחזור המנוע המלא (הצילינדרים לא זהים) — זה הגרגור.
כל לולאה נחתכת על מספר שלם של מחזורי מנוע, כך שאין קליק כשהיא חוזרת. בדפדפן משנים את מהירות הניגון
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
    t = np.arange(n) / SR
    hi = (rpm - RPMS[0]) / (RPMS[-1] - RPMS[0])  # 0 בסל"ד נמוך, 1 בגבוה

    # צבע הצליל: חם ועגול. הרבה גוף בבסים, תהודת אגזוז עדינה, והגבוהים יורדים מהר
    def colour(f):
        warm = 1 / (1 + (f / (420 + 260 * hi)) ** 2.2)
        exhaust = 1 + 0.9 * np.exp(-((np.log(f) - np.log(125)) ** 2) / 0.08) \
                    + 0.5 * np.exp(-((np.log(f) - np.log(360)) ** 2) / 0.06)
        return warm * exhaust

    out = np.zeros(n)
    base = fire / 4  # תדר מחזור המנוע — הצילינדרים לא זהים, אז יש גם הרמוניות שלו
    k = 1
    while k * base < 3200:
        f = k * base
        main = k % 4 == 0          # הרמוניות של תדר ההצתה עצמו — הצליל העיקרי
        amp = colour(f) * (1.0 if main else (0.12 if k % 2 == 0 else 0.06))
        out += amp * np.sin(2 * np.pi * f * t + rng.random() * 2 * np.pi)
        k += 1

    # פעימה עדינה בכל הצתה — זה מה שנשמע כמו "גרגור" ולא כמו צפצוף
    out *= 1 + 0.18 * np.cos(2 * np.pi * fire * t)
    # נשימה: קצת אוויר רך, רק בשביל טבעיות
    out += band_noise(n, 300, 1100 + 700 * hi) * 0.025 * np.abs(out).max()
    # רוויה קלה מאוד — מעגלת את הקצוות בלי לצרום
    out = np.tanh(out / (np.abs(out).max() + 1e-9) * 1.1)
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
