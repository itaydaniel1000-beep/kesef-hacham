/* ===== קול: המנוע מהקלטות (engine.wav), המוזיקה מקובץ (music.mp3), וכל השאר נוצר בדפדפן ===== */

/* הילוכים: ספי מהירות יחסית. בכל הילוך הסיבובים עולים, ובהחלפה צונחים */
const GEARS = [0, 0.2, 0.38, 0.56, 0.74, 0.9];

/* הסל"ד של שלוש ההקלטות ב-engine.wav — חייב להתאים ל-RPMS ב-tools/make-engine.py */
const ENGINE_RPMS = [1600, 3600, 6400];
const ENGINE_SR = 22050;
const IDLE_RPM = 950;
const REDLINE = 6200;

const MUSIC_VOLUME = 0.35;
/* אורך הלולאה במוזיקה: 32 תיבות ב-128 BPM */
const MUSIC_LOOP = (32 * 4 * 60) / 128;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.musicVolume = 1; // מסך ההגדרות: עוצמת מוזיקה ועוצמת אפקטים, 0 עד 1
    this.sfxVolume = 1;
    this.gear = 1;
    this.rpm = IDLE_RPM;
    this.throttle = 0;
    this.throttleHeld = 0;
    this.loops = [];
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
      this.musicBus.gain.value = this.musicOn ? MUSIC_VOLUME * this.musicVolume : 0;
      this.musicBus.connect(this.master);
      /* כל מה שאינו מוזיקה (מנוע, אפקטים) עובר דרך ערוץ אחד — כך יש לו עוצמה משלו */
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxVolume;
      this.sfx.connect(this.master);

      /* מנוע: שלוש הקלטות מתנגנות יחד, ובכל רגע שומעים בעיקר את הקרובה לסל"ד הנוכחי */
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 1200;
      this.engineFilter.Q.value = 0.7;
      this.engineFilter.connect(this.engineGain).connect(this.sfx);
      this.loadEngine();

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
      band.frequency.value = 1300;
      band.Q.value = 3;
      this.screechGain = ctx.createGain();
      this.screechGain.gain.value = 0;
      screech.connect(band).connect(this.screechGain).connect(this.sfx);
      screech.start();

      /* רחש כביש, רוח, וחצץ כשיוצאים מהכביש — כל אחד רעש בלולאה עם מסנן משלו */
      this.road = this.noiseLayer("lowpass", 120, 0.5);
      this.wind = this.noiseLayer("bandpass", 700, 0.6);
      this.gravel = this.noiseLayer("bandpass", 420, 1.4);

      this.startMusic();
    } catch {
      this.ctx = null; /* אין תמיכה בקול — המשחק ממשיך בשקט */
    }
  }

  /* השהיה: עוצרים את כל הקול (מנוע, מוזיקה, אפקטים) בלי לאבד את המצב */
  suspend() {
    this.ctx?.suspend?.();
  }

  resume() {
    this.ctx?.resume?.();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME * this.musicVolume : 0, this.ctx.currentTime, 0.1);
  }

  setVolumes(music, sfx) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.musicOn ? MUSIC_VOLUME * music : 0, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  /* מטבע: שני צלצולים קצרים ועולים */
  coin() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1318, t, 0.07, { type: "square", gain: 0.05 });
    this.tone(1976, t + 0.06, 0.16, { type: "square", gain: 0.05 });
  }

  /* רעם: רעש נמוך ומתגלגל */
  thunder() {
    if (!this.ctx) return;
    this.burst(1.4, { type: "lowpass", from: 900, to: 120, gain: 0.5 });
    this.burst(0.15, { type: "bandpass", freq: 2400, gain: 0.12 });
  }

  /* "טיק" של גלגל מזל — קצר וחד; גבוה יותר כשהגלגל נעצר */
  tick(last = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(last ? 1320 : 1760, t, last ? 0.18 : 0.035, { type: "triangle", gain: last ? 0.12 : 0.07 });
  }

  noiseLayer(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.2; // כל שכבה מתחילה במקום אחר ברעש
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(0, Math.random());
    return { gain: g, filter: f };
  }

  async loadEngine() {
    const ctx = this.ctx;
    try {
      const res = await fetch("engine.wav");
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      /* שלוש ההקלטות יושבות בקובץ זו אחרי זו */
      const bounds = this.engineBounds();
      this.loops = ENGINE_RPMS.map((rpm, i) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.loopStart = bounds[i].start;
        src.loopEnd = bounds[i].end;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.engineFilter);
        src.start(0, bounds[i].start);
        return { rpm, src, gain: g };
      });
    } catch {
      this.loops = []; /* בלי קובץ המנוע פשוט שקט — שאר הצלילים ממשיכים */
    }
  }

  /* גבולות הלולאות בשניות. אורך כל אחת = מספר שלם של מחזורי מנוע (ראו tools/make-engine.py).
     מחושב בקצב הדגימה של הקובץ, לא של הדפדפן, כי הדפדפן ממיר את הקובץ לקצב שלו */
  engineBounds() {
    const sr = ENGINE_SR;
    const lengths = ENGINE_RPMS.map((rpm) => {
      const cycle = 4 / ((rpm / 60) * 2);
      return Math.round(Math.max(1, Math.round(1.6 / cycle)) * cycle * sr);
    });
    let at = 0;
    return lengths.map((len) => {
      const b = { start: at / sr, end: (at + len) / sr };
      at += len;
      return b;
    });
  }

  /* מעדכנים פרמטר קול רק כשהיעד באמת זז — אחרת מצטברים מאות אירועים בשנייה בציר הזמן של הקול */
  ramp(param, value, t, tc) {
    if (param._target !== undefined && Math.abs(param._target - value) <= Math.abs(value) * 0.005 + 1e-4) return;
    param._target = value;
    param.setTargetAtTime(value, t, tc);
  }

  /* נקרא בכל פריים עם מצב המכונית של השחקן */
  engine(car, active, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1.3, Math.abs(car.speed) / car.maxSpeed);
    const boosted = car.nitroOn || car.padBoost > 0;
    const onGas = active && (car.input.gas > 0 || boosted);

    /* הילוך וסל"ד: בתוך כל הילוך הסל"ד עולה, ובהעברה למעלה צונח */
    /* העלאת הילוך בסף, הורדה רק קצת מתחתיו — כדי שלא יקפוץ הלוך ושוב סביב הסף */
    let gear = this.gear;
    while (gear < GEARS.length - 1 && ratio > GEARS[gear]) gear++;
    while (gear > 1 && ratio < GEARS[gear - 1] - 0.03) gear--;
    if (gear > this.gear && active) this.shift();
    this.gear = gear;
    const lo = GEARS[gear - 1], hi = GEARS[gear];
    const within = Math.min(1.15, (ratio - lo) / (hi - lo));
    let target = 2200 + within * 3500;
    if (ratio < 0.05) target = onGas ? 3200 : IDLE_RPM;       // עומדים במקום: סרק, או מרעישים בגז
    if (!car.grounded && onGas) target = Math.min(REDLINE, this.rpm + 900); // באוויר הגלגלים חופשיים — הסל"ד קופץ קצת
    if (!active) target = IDLE_RPM;
    target = Math.min(REDLINE, target * (boosted ? 1.06 : 1));
    /* הסל"ד רודף אחרי היעד: מהר למעלה, קצת יותר לאט למטה */
    const rate = target > this.rpm ? 6 : 4;
    this.rpm += (target - this.rpm) * Math.min(1, rate * dt);

    /* עומס: בגז המנוע חזק ובהיר; בשחרור הוא שקט, עמום, ולפעמים יורה מהאגזוז */
    this.throttle += ((onGas ? 1 : 0) - this.throttle) * Math.min(1, 12 * dt);
    if (onGas) this.throttleHeld += dt;
    else {
      if (this.throttleHeld > 1.2 && this.rpm > 4300 && Math.random() < 0.6) this.liftOff();
      this.throttleHeld = 0;
    }

    /* מעבר הדרגתי בין שלוש ההקלטות, וכל אחת מנוגנת במהירות שמתאימה לסל"ד */
    const rpms = ENGINE_RPMS;
    for (let i = 0; i < this.loops.length; i++) {
      const L = this.loops[i];
      let w = 0;
      const r = this.rpm;
      if (i > 0 && r >= rpms[i - 1] && r <= rpms[i]) w = (r - rpms[i - 1]) / (rpms[i] - rpms[i - 1]);
      else if (i < rpms.length - 1 && r >= rpms[i] && r <= rpms[i + 1]) w = 1 - (r - rpms[i]) / (rpms[i + 1] - rpms[i]);
      else if ((i === 0 && r < rpms[0]) || (i === rpms.length - 1 && r > rpms[i])) w = 1;
      this.ramp(L.gain.gain, Math.sin((w * Math.PI) / 2), t, 0.03); // שמירה על עוצמה קבועה במעבר
      this.ramp(L.src.playbackRate, r / L.rpm, t, 0.02);
    }
    const bright = 600 + (this.rpm / REDLINE) * 1500 * (0.55 + 0.45 * this.throttle) + (car.nitroOn ? 500 : 0);
    this.ramp(this.engineFilter.frequency, bright, t, 0.05);
    const vol = active ? (0.13 + 0.07 * this.throttle) * (0.8 + 0.25 * (this.rpm / REDLINE)) : 0.06;
    this.ramp(this.engineGain.gain, vol, t, 0.05);

    /* צמיגים, כביש, רוח וחצץ */
    const sp = Math.min(1.3, Math.abs(car.speed) / car.maxSpeed);
    const offRoad = car.offRoad;
    const ground = active && car.grounded ? 1 : 0;
    const skid = ground * Math.min(1, Math.abs(car.slip) * 2.5) * Math.min(1, Math.abs(car.speed) / 20);
    this.ramp(this.screechGain.gain, skid * 0.045, t, 0.08);
    this.ramp(this.road.gain.gain, ground * (offRoad ? 0.02 : 0.05) * sp, t, 0.15);
    this.ramp(this.wind.gain.gain, active ? 0.025 * sp * sp + (car.nitroOn ? 0.015 : 0) : 0, t, 0.2);
    this.ramp(this.wind.filter.frequency, 500 + 900 * sp, t, 0.2);
    this.ramp(this.gravel.gain.gain, ground * (offRoad ? 0.07 * Math.min(1, sp * 2) : 0), t, 0.08);
  }

  /* העברת הילוך: נקישה רכה */
  shift() {
    this.burst(0.05, { type: "bandpass", freq: 900, gain: 0.04 });
  }

  /* שחרור גז בסל"ד גבוה: פססס רך של טורבו ו"פופ" עמום מהאגזוז */
  liftOff() {
    if (!this.ctx) return;
    this.burst(0.3, { type: "bandpass", from: 2400, to: 1200, gain: 0.025 });
    setTimeout(() => this.burst(0.09, { freq: 420, gain: 0.12 }), 80 + Math.random() * 120);
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
    src.connect(f).connect(g).connect(this.sfx);
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
    o.connect(g).connect(bus || this.sfx);
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
    o.connect(g).connect(this.sfx);
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
