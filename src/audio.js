// Every sound is synthesised with the Web Audio API: the fluorescent hum,
// carpet footsteps and the rare noise somewhere far away.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.nextDistant = 0;
  }

  // Browsers only allow audio after a click, so this runs from the start screen.
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Hum: mains frequency and its harmonics, with a buzzy band of noise.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.05;
    this.drive = ctx.createWaveShaper();
    this.setDrive(0);
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 1400;
    this.drive.connect(humFilter).connect(this.humGain).connect(this.master);
    for (const [freq, type, gain] of [
      [60, 'sawtooth', 0.35],
      [120, 'sine', 0.5],
      [240, 'square', 0.04],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.drive);
      o.start();
    }
    const buzz = ctx.createBufferSource();
    buzz.buffer = this.noiseBuffer;
    buzz.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 6;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.25;
    buzz.connect(band).connect(buzzGain).connect(this.humGain);
    buzz.start();

    // A shared echo so distant sounds feel far away.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.45;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 900;
    this.echo.connect(echoFilter).connect(feedback).connect(this.echo);
    echoFilter.connect(this.master);

    this.nextDistant = ctx.currentTime + 25 + Math.random() * 30;
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setDrive(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount * 40;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    this.drive.curve = curve;
  }

  // tension goes from 0 to 1 the longer the player is lost.
  update(tension) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0.05 + tension * 0.07, t, 0.5);
    if (Math.abs(tension - (this.lastTension ?? -1)) > 0.05) {
      this.lastTension = tension;
      this.setDrive(tension);
    }
    if (t > this.nextDistant) {
      this.nextDistant = t + 30 + Math.random() * 60 * (1 - tension * 0.6);
      if (Math.random() < 0.5) this.thud();
      else this.creak();
    }
  }

  footstep(running) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 300;
    const g = ctx.createGain();
    const peak = running ? 0.5 : 0.32;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.2);
  }

  distantOut() {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    pan.connect(g);
    g.connect(this.master);
    g.connect(this.echo);
    return pan;
  }

  thud() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.distantOut());
    o.start(t);
    o.stop(t + 0.8);
  }

  creak() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180 + Math.random() * 80, t);
    o.frequency.linearRampToValueAtTime(120 + Math.random() * 60, t + 1.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(f).connect(g).connect(this.distantOut());
    o.start(t);
    o.stop(t + 1.6);
  }

  flickerTick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.05);
  }
}
