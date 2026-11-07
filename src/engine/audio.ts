// Sound without files: every effect and the music are synthesized with WebAudio, so the game ships no audio assets
// and the first load stays small. Sounds are throttled per kind, so a horde dying at once stays pleasant.

type Sfx =
  | "shoot" | "hit" | "kill" | "pickup" | "levelup" | "dash" | "hurt" | "boom" | "zap" | "freeze" | "ult" | "ignite"
  | "portal" | "click" | "graze" | "heal" | "chest" | "reaction" | "enemyShot" | "roar" | "deny" | "break" | "coin" | "curse" | "achieve" | "secret"
  | "hover" | "burn" | "venom" | "holy" | "void";

const LIMITS: Partial<Record<Sfx, number>> = { break: 0.04, coin: 0.03, hover: 0.04, burn: 0.08, venom: 0.08, holy: 0.08, void: 0.08, hit: 0.035, kill: 0.03, pickup: 0.025, shoot: 0.03, enemyShot: 0.05, zap: 0.05, graze: 0.06, boom: 0.06, freeze: 0.05, reaction: 0.05 };

/** The music's moods: the three biomes and a boss fight. Chords as MIDI notes, one per bar. */
const THEMES: { bpm: number; prog: number[][]; arp: OscillatorType; bass: OscillatorType; bright: number }[] = [
  // the crypt: A minor, a dark groove
  { bpm: 100, prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], arp: "square", bass: "sawtooth", bright: 1 },
  // the garden: D dorian, slower and warmer, soft arpeggios
  { bpm: 92, prog: [[50, 53, 57], [55, 59, 62], [48, 52, 55], [50, 53, 57]], arp: "triangle", bass: "triangle", bright: 1.2 },
  // the frozen halls: E phrygian, slow, ringing like bells
  { bpm: 84, prog: [[52, 55, 59], [53, 57, 60], [50, 53, 57], [52, 55, 59]], arp: "sine", bass: "triangle", bright: 1.6 },
  // a boss: C minor, fast and driving
  { bpm: 118, prog: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]], arp: "square", bass: "sawtooth", bright: 1.1 },
];

export class Audio {
  /** Which mood the music plays in (THEMES): 0 crypt, 1 garden, 2 frozen halls, 3 a boss. */
  theme = 0;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<Sfx, number>();
  private pickupStreak = 0;
  private lastPickup = 0;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  private musicOn = false;
  /** 0 calm .. 1 frantic: more layers of the music play. */
  intensity = 0;
  enabled = true;
  sfxVolume = 0.8;
  musicVolume = 0.5;
  private suspendedByGame = false;

  /** Create the audio context. Browsers allow it only inside a user gesture, so call this from one. */
  /** When the browser was last asked to let the sound play (s, performance.now() / 1000). */
  private askedAt = 0;
  /** The page has been touched, yet the browser keeps the sound off (some embedding pages forbid it). */
  get blocked(): boolean {
    return !!this.ctx && this.ctx.state !== "running" && !this.suspendedByGame && performance.now() / 1000 - this.askedAt > 1;
  }
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !this.suspendedByGame) {
        this.askedAt = performance.now() / 1000;
        void this.ctx.resume().then(() => this.prime());
      }
      return;
    }
    this.askedAt = performance.now() / 1000;
    // on an iPhone the ringer switch mutes web sound unless the page asks to be played like music (Safari 16.4+)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      /* not offered */
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume * 0.5;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.4;
    this.musicBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 7;
    for (let i = 0; i < d.length; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = (s / 2147483647) * 2 - 1;
    }
    if (this.musicOn) this.startMusic();
    if (ctx.state !== "running") void ctx.resume().then(() => this.prime());
    else this.prime();
  }
  /** A silent sample, played inside the gesture: some browsers (Safari) open the sound only for a real play. */
  private prime(): void {
    const c = this.ctx;
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfxBus.gain.value = sfx * 0.5;
    this.musicBus.gain.value = music * 0.4;
  }

  /** The platform paused the game (an ad, a hidden tab): stop all sound until resume(). */
  suspend(): void {
    this.suspendedByGame = true;
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }
  resume(): void {
    this.suspendedByGame = false;
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  // ---- building blocks
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0, attack = 0.004): void {
    const c = this.ctx!, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private hiss(dur: number, f0: number, f1: number, vol: number, q = 1, type: BiquadFilterType = "bandpass", at = 0): void {
    const c = this.ctx!, t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: Sfx, pitch = 1): void {
    const c = this.ctx;
    if (!c || !this.enabled || c.state !== "running") return;
    const now = c.currentTime, lim = LIMITS[name] ?? 0;
    if (lim && now - (this.last.get(name) ?? -1) < lim) return;
    this.last.set(name, now);
    const p = pitch * (0.96 + Math.random() * 0.08);
    switch (name) {
      case "shoot":
        this.tone("square", 900 * p, 260 * p, 0.07, 0.07);
        this.hiss(0.05, 4000, 1500, 0.08, 1.5);
        break;
      case "enemyShot":
        this.tone("sine", 520 * p, 760 * p, 0.09, 0.05);
        break;
      case "hit":
        this.hiss(0.05, 2600 * p, 900, 0.12, 2);
        this.tone("triangle", 220 * p, 120, 0.05, 0.06);
        break;
      case "kill":
        this.tone("sine", 420 * p, 70, 0.14, 0.14);
        this.hiss(0.12, 1800, 300, 0.1, 0.8);
        break;
      case "pickup": {
        // a run of pickups climbs a pentatonic scale
        this.pickupStreak = now - this.lastPickup < 0.4 ? Math.min(this.pickupStreak + 1, 14) : 0;
        this.lastPickup = now;
        const step = [0, 2, 4, 7, 9][this.pickupStreak % 5] + 12 * Math.floor(this.pickupStreak / 5);
        this.tone("sine", 880 * 2 ** (step / 12), 880 * 2 ** (step / 12) * 1.01, 0.08, 0.06);
        break;
      }
      case "levelup":
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone("triangle", 440 * 2 ** (s / 12), 440 * 2 ** (s / 12), 0.22, 0.09, i * 0.06));
        break;
      case "dash":
        this.hiss(0.18, 600, 3200, 0.12, 0.9);
        break;
      case "graze":
        this.tone("sine", 1800 * p, 2400 * p, 0.06, 0.04);
        break;
      case "hurt":
        this.tone("sawtooth", 260, 60, 0.25, 0.14);
        this.hiss(0.2, 800, 200, 0.12, 0.7, "lowpass");
        break;
      case "boom":
        this.hiss(0.55, 900 * p, 60, 0.3, 0.7, "lowpass");
        this.tone("sine", 120 * p, 35, 0.4, 0.25);
        break;
      case "reaction":
        this.tone("square", 300 * p, 900 * p, 0.12, 0.06);
        this.hiss(0.3, 2000, 200, 0.15, 0.8, "lowpass");
        break;
      case "zap":
        this.tone("square", 1400 * p, 300 * p, 0.09, 0.05);
        this.hiss(0.08, 5000, 2000, 0.06, 3, "highpass");
        break;
      case "freeze":
        this.tone("sine", 2200 * p, 3000 * p, 0.2, 0.04);
        this.tone("sine", 1650 * p, 2400 * p, 0.25, 0.03, 0.03);
        break;
      case "ult":
        this.hiss(0.9, 300, 60, 0.35, 0.6, "lowpass");
        this.tone("sawtooth", 80, 30, 0.8, 0.2);
        [0, 7, 12].forEach((s, i) => this.tone("triangle", 330 * 2 ** (s / 12), 330 * 2 ** (s / 12), 0.5, 0.08, 0.05 + i * 0.05));
        break;
      case "ignite":
        this.hiss(0.6, 300, 2000, 0.2, 0.5);
        this.tone("triangle", 220, 440, 0.4, 0.08, 0.1);
        break;
      case "portal":
        [0, 3, 7, 10].forEach((s) => this.tone("sine", 220 * 2 ** (s / 12), 220 * 2 ** (s / 12), 1.2, 0.05, 0, 0.3));
        break;
      case "click":
        this.tone("square", 1200, 1100, 0.03, 0.04);
        break;
      case "deny":
        this.tone("square", 180, 140, 0.12, 0.06);
        break;
      case "heal":
        [0, 5, 9].forEach((s, i) => this.tone("sine", 660 * 2 ** (s / 12), 660 * 2 ** (s / 12), 0.25, 0.06, i * 0.05));
        break;
      case "chest":
        [0, 4, 7, 11, 14].forEach((s, i) => this.tone("triangle", 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), 0.3, 0.07, i * 0.07));
        break;
      case "break":
        // a clay pot: a sharp crack, then the clatter of shards
        this.hiss(0.08, 3200 * p, 1200, 0.16, 1.4);
        this.tone("triangle", 520 * p, 180, 0.06, 0.06);
        [0.05, 0.09, 0.14].forEach((d, i) => this.tone("square", (1400 - i * 260) * p, (900 - i * 120) * p, 0.03, 0.025, d));
        break;
      case "coin":
        this.tone("square", 1320 * p, 1320 * p, 0.04, 0.03);
        this.tone("square", 1760 * p, 1760 * p, 0.08, 0.03, 0.04);
        break;
      case "curse":
        [0, 1, 6].forEach((s, i) => this.tone("sawtooth", 110 * 2 ** (s / 12), 100 * 2 ** (s / 12), 1.1, 0.06, i * 0.04, 0.08));
        this.hiss(1, 600, 80, 0.12, 0.6, "lowpass");
        break;
      case "achieve":
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone("triangle", 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), 0.35, 0.07, i * 0.06));
        this.tone("sine", 1568, 1568, 0.6, 0.03, 0.36);
        break;
      case "secret":
        // a hollow knock answered by a soft, rising shimmer: something is behind this wall
        this.tone("sine", 140, 90, 0.12, 0.08);
        [0, 3, 7, 10, 15].forEach((s, i) => this.tone("triangle", 330 * 2 ** (s / 12), 330 * 2 ** (s / 12), 0.28, 0.045, 0.1 + i * 0.07));
        this.tone("sine", 1320, 1320, 0.5, 0.02, 0.45);
        break;
      case "hover":
        this.tone("square", 1800, 1700, 0.015, 0.02);
        break;
      case "burn":
        this.hiss(0.18, 900 * p, 2400, 0.08, 0.8);
        break;
      case "venom":
        this.tone("sine", 300 * p, 520 * p, 0.07, 0.05);
        this.tone("sine", 380 * p, 620 * p, 0.06, 0.04, 0.05);
        break;
      case "holy":
        this.tone("sine", 1320 * p, 1320 * p, 0.25, 0.04);
        this.tone("sine", 1980 * p, 1980 * p, 0.3, 0.025, 0.02);
        break;
      case "void":
        this.tone("sine", 160 * p, 60, 0.25, 0.08);
        this.hiss(0.2, 400, 120, 0.06, 0.8, "lowpass");
        break;
      case "roar":
        this.tone("sawtooth", 90, 45, 1.1, 0.2, 0, 0.1);
        this.hiss(1.1, 400, 80, 0.2, 0.5, "lowpass");
        break;
    }
  }

  // ---- music: a dark looping groove, layers added as the fight heats up
  playMusic(): void {
    this.musicOn = true;
    if (this.ctx && !this.musicTimer) this.startMusic();
  }
  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }
  private startMusic(): void {
    const c = this.ctx!;
    this.nextBeat = c.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 90);
  }
  private schedule(): void {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const T = THEMES[this.theme] ?? THEMES[0], spb = 60 / T.bpm / 2; // eighth notes
    // the bass walks the theme's four-bar progression, the arpeggio picks from its chord
    const prog = T.prog;
    while (this.nextBeat < c.currentTime + 0.35) {
      const t = this.nextBeat, b = this.beat, bar = Math.floor(b / 8) % 4, chord = prog[bar], k = this.intensity;
      const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);
      if (b % 8 === 0) this.voice(T.bass, midi(chord[0] - 24), t, spb * 8, 0.05, 400, 0.6);
      if (b % 2 === 0) this.voice("triangle", midi(chord[0] - 12), t, spb * 0.9, 0.06 + 0.04 * k, 900, 0.005);
      if (k > 0.15 || b % 4 === 2) {
        const n = chord[(b * 7 + bar) % 3] + (b % 4 === 3 ? 12 : 0), bell = T.arp === "sine";
        this.voice(T.arp, midi(n + (bell ? 12 : 0)), t, spb * (bell ? 1.8 : 0.6), (0.018 + 0.02 * k) * (bell ? 1.6 : 1), (1400 + 1600 * k) * T.bright, 0.003);
      }
      if (b % 4 === 0) this.kick(t, 0.18 + 0.12 * k);
      if (k > 0.35 && b % 2 === 1) this.hat(t, 0.03 + 0.03 * k);
      if (k > 0.65 && b % 8 === 4) this.hat(t, 0.08, 0.12);
      this.nextBeat += spb;
      this.beat++;
    }
  }
  private voice(type: OscillatorType, f: number, t: number, dur: number, vol: number, cutoff: number, attack: number): void {
    const c = this.ctx!, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    fl.type = "lowpass";
    fl.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private kick(t: number, vol: number): void {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.22);
  }
  private hat(t: number, vol: number, dur = 0.04): void {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = "highpass";
    f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.01);
  }
}

export type { Sfx };
