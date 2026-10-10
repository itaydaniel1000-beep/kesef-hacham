/* ===== קול: מנוע, צמיגים, מכות וניטרו נוצרים בדפדפן; מוזיקת הרקע היא קובץ (music.mp3) ===== */

/* הילוכים: ספי מהירות יחסית. בכל הילוך הסיבובים עולים, ובהחלפה צונחים */
const GEARS = [0, 0.2, 0.38, 0.56, 0.74, 0.9];

const MUSIC_VOLUME = 0.35;
/* אורך הלולאה במוזיקה: 32 תיבות ב-128 BPM */
const MUSIC_LOOP = (32 * 4 * 60) / 128;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.gear = 1;
    this.shiftDip = 0;
  }

  /* דפדפנים מאפשרים קול רק אחרי לחיצה — לכן מתחילים מכפתור */
  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? MUSIC_VOLUME : 0;
      this.musicBus.connect(this.master);

      /* מנוע: מסור + ריבוע באוקטבה נמוכה, דרך מסנן */
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 600;
      this.engineFilter.connect(this.engineGain).connect(this.master);
      this.osc1 = ctx.createOscillator();
      this.osc1.type = "sawtooth";
      this.osc2 = ctx.createOscillator();
      this.osc2.type = "square";
      const sub = ctx.createGain();
      sub.gain.value = 0.5;
      this.osc1.connect(this.engineFilter);
      this.osc2.connect(sub).connect(this.engineFilter);
      this.osc1.start();
      this.osc2.start();

      /* רעש לבן משותף לחריקה, מכות ווש */
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      /* חריקת צמיגים: רעש בלולאה דרך מסנן צר */
      const screech = ctx.createBufferSource();
      screech.buffer = this.noise;
      screech.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1700;
      band.Q.value = 6;
      this.screechGain = ctx.createGain();
      this.screechGain.gain.value = 0;
      screech.connect(band).connect(this.screechGain).connect(this.master);
      screech.start();

      this.startMusic();
    } catch {
      this.ctx = null; /* אין תמיכה בקול — המשחק ממשיך בשקט */
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, this.ctx.currentTime, 0.1);
  }

  /* נקרא בכל פריים עם מצב המכונית של השחקן */
  engine(car, active, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1.3, Math.abs(car.speed) / car.maxSpeed);
    let gear = 1;
    while (gear < GEARS.length - 1 && ratio > GEARS[gear]) gear++;
    if (gear !== this.gear) {
      if (gear > this.gear) this.shiftDip = 0.18;
      this.gear = gear;
    }
    this.shiftDip = Math.max(0, this.shiftDip - dt);
    const lo = GEARS[gear - 1], hi = GEARS[gear];
    const rpm = Math.min(1.2, (ratio - lo) / (hi - lo));
    const dip = this.shiftDip > 0 ? 0.75 : 1;
    const base = (60 + rpm * 110 + gear * 10 + car.input.gas * 8) * dip * (car.nitroOn ? 1.12 : 1);
    this.osc1.frequency.setTargetAtTime(base, t, 0.05);
    this.osc2.frequency.setTargetAtTime(base / 2, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(500 + rpm * 900 + (car.nitroOn ? 600 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + ratio * 0.05 : 0, t, 0.1);
    const skid = active && car.grounded ? Math.min(1, Math.abs(car.slip) * 2.5) * Math.min(1, Math.abs(car.speed) / 20) : 0;
    this.screechGain.gain.setTargetAtTime(skid * 0.09, t, 0.06);
  }

  burst(duration, { freq = 800, type = "lowpass", from, to, gain = 0.3 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from ?? freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  tone(freq, start, duration, { type = "square", gain = 0.12, bus } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + duration);
    o.connect(g).connect(bus || this.master);
    o.start(start);
    o.stop(start + duration + 0.05);
  }

  /* מכה: רעש נמוך + צליל יורד */
  thump(strength = 1) {
    if (!this.ctx) return;
    this.burst(0.25, { freq: 380, gain: 0.35 * strength });
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  whoosh() {
    this.burst(0.7, { type: "bandpass", from: 300, to: 3000, gain: 0.25 });
  }

  pad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), t + i * 0.05, 0.15, { gain: 0.07 }));
  }

  beep(high) {
    if (!this.ctx) return;
    this.tone(high ? 880 : 440, this.ctx.currentTime, 0.35, { type: "square", gain: 0.1 });
  }

  fanfare(won) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const notes = won ? [72, 76, 79, 84, 79, 84] : [72, 76, 79, 76];
    notes.forEach((n, i) => this.tone(midi(n), t + i * 0.14, i === notes.length - 1 ? 0.7 : 0.16, { gain: 0.12 }));
  }

  /* מוזיקת הרקע: קובץ מוכן (tools/make-music.py), מתנגן בלולאה של 32 תיבות בדיוק */
  async startMusic() {
    const ctx = this.ctx;
    try {
      const res = await fetch("music.mp3");
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      /* מקודד ה-MP3 מוסיף שקט קצר בהתחלה; מתחילים את הלולאה מהצליל הראשון */
      const data = buffer.getChannelData(0);
      let first = 0;
      while (first < data.length && Math.abs(data[first]) < 0.002) first++;
      const start = first / buffer.sampleRate;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = start;
      src.loopEnd = Math.min(buffer.duration, start + MUSIC_LOOP);
      src.connect(this.musicBus);
      src.start(0, start);
    } catch {
      /* אין קובץ או שהדפדפן לא מפענח — המשחק ממשיך בלי מוזיקה */
    }
  }
}
