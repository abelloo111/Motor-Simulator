import type { EngineState } from "../simulation/engine";

/**
 * Procedural engine sound: timed combustion transients + damped exhaust body,
 * filtered intake noise and quiet mechanical harmonics. Nodes are created after
 * a user gesture to comply with browser autoplay policies.
 */
export class EngineAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineTone: OscillatorNode | null = null;
  private blockTone: OscillatorNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private mechanicalGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private scheduler: number | null = null;
  private nextFireTime = 0;
  private lastRpm = 0;
  private lastThrottle = 0;
  private muted = false;
  private engineActive = false;

  async start(state: EngineState): Promise<void> {
    if (this.context) { this.setMuted(false); return; }
    const Ctx = window.AudioContext;
    if (!Ctx) throw new Error("Este navegador no admite Web Audio.");
    const ctx = new Ctx();
    this.context = ctx;
    await ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.16;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = "lowpass";
    this.exhaustFilter.frequency.value = 420;
    this.exhaustFilter.Q.value = 0.8;
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0.8;
    this.exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(this.master);

    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = "bandpass";
    this.intakeFilter.frequency.value = 680;
    this.intakeFilter.Q.value = 0.55;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0.08;
    this.intakeFilter.connect(intakeGain);
    intakeGain.connect(this.master);

    this.mechanicalGain = ctx.createGain();
    this.mechanicalGain.gain.value = 0.03;
    this.mechanicalGain.connect(this.master);

    this.engineTone = ctx.createOscillator();
    this.engineTone.type = "triangle";
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.18;
    this.engineTone.connect(toneGain);
    toneGain.connect(this.exhaustFilter);
    this.engineTone.start();

    this.blockTone = ctx.createOscillator();
    this.blockTone.type = "sawtooth";
    const blockFilter = ctx.createBiquadFilter();
    blockFilter.type = "lowpass";
    blockFilter.frequency.value = 180;
    const blockGain = ctx.createGain();
    blockGain.gain.value = 0.12;
    this.blockTone.connect(blockFilter);
    blockFilter.connect(blockGain);
    blockGain.connect(this.mechanicalGain);
    this.blockTone.start();

    this.noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    let seed = 13917;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 16807) % 2147483647;
      noise[i] = ((seed / 2147483647) * 2 - 1) * 0.8;
    }
    this.setMuted(false);
    this.update(state);
    this.nextFireTime = ctx.currentTime + Math.max(0.02, 120 / Math.max(state.rpm, 850)) * 0.4;
    this.scheduler = window.setInterval(() => this.scheduleCombustions(), 25);
  }

  update(state: EngineState): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const rpm = Math.max(0, state.rpm);
    this.lastRpm = rpm;
    this.lastThrottle = state.throttle;
    this.engineActive = state.ignition && rpm > 60;
    const smooth = (param: AudioParam, value: number, tau = 0.08) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, tau);
    };
    if (this.engineTone) smooth(this.engineTone.frequency, 23 + rpm * 0.42, 0.055);
    if (this.blockTone) smooth(this.blockTone.frequency, 32 + rpm * 0.19, 0.06);
    if (this.exhaustFilter) smooth(this.exhaustFilter.frequency, 220 + state.throttle * 1050 + rpm * 0.055);
    if (this.intakeFilter) smooth(this.intakeFilter.frequency, 350 + state.throttle * 2100 + rpm * 0.08);
    if (this.mechanicalGain) smooth(this.mechanicalGain.gain, 0.018 + Math.min(rpm / 6800, 1) * 0.055);
    if (this.master) smooth(this.master.gain, this.muted || !this.engineActive ? 0 : 0.24 + state.throttle * 0.2, 0.09);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(value || !this.engineActive ? 0 : 0.24 + this.lastThrottle * 0.2, this.context.currentTime, 0.04);
    }
  }
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }
  get isMuted(): boolean { return this.muted; }

  private scheduleCombustions(): void {
    const ctx = this.context;
    if (!ctx || !this.engineActive) return;
    const now = ctx.currentTime;
    const rpm = Math.max(0, this.lastRpm);
    if (rpm < 140) return;
    const period = 120 / Math.max(rpm, 140);
    if (this.nextFireTime < now - period) this.nextFireTime = now + 0.005;
    const horizon = now + 0.09;
    let guard = 0;
    while (this.nextFireTime < horizon && guard++ < 16) {
      this.fire(this.nextFireTime, this.lastThrottle, rpm);
      this.nextFireTime += period;
    }
  }

  private fire(at: number, throttle: number, rpm: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const strength = 0.24 + throttle * 0.76;
    const transient = ctx.createBufferSource();
    transient.buffer = this.noiseBuffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(480 + throttle * 1050 + rpm * 0.045, at);
    low.Q.value = 0.72;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 45;
    const resonance = ctx.createBiquadFilter();
    resonance.type = "peaking";
    resonance.frequency.setValueAtTime(112 + throttle * 24, at);
    resonance.Q.value = 1.15;
    resonance.gain.value = 5.5;
    const saturation = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    saturation.curve = curve;
    saturation.oversample = "2x";
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.18 * strength, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.115 + throttle * 0.09);
    transient.connect(low); low.connect(high); high.connect(resonance); resonance.connect(saturation); saturation.connect(env); env.connect(this.master);
    transient.start(at); transient.stop(at + 0.3);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(74 + throttle * 37 + rpm * 0.004, at);
    body.frequency.exponentialRampToValueAtTime(43 + rpm * 0.002, at + 0.17);
    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, at);
    bodyEnv.gain.exponentialRampToValueAtTime(0.13 * strength, at + 0.009);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    body.connect(bodyEnv); bodyEnv.connect(this.exhaustFilter ?? this.master);
    body.start(at); body.stop(at + 0.24);

    if (throttle > 0.08) {
      const intake = ctx.createBufferSource();
      intake.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(850 + throttle * 2100, at);
      filter.Q.value = 0.65;
      const intakeEnv = ctx.createGain();
      intakeEnv.gain.setValueAtTime(0.0001, at);
      intakeEnv.gain.exponentialRampToValueAtTime(0.025 * throttle, at + 0.014);
      intakeEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.075);
      intake.connect(filter); filter.connect(intakeEnv); intakeEnv.connect(this.master);
      intake.start(at); intake.stop(at + 0.09);
    }
  }

  stop(): void {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    if (this.context) void this.context.close();
    this.context = null; this.master = null; this.engineTone = null; this.blockTone = null;
    this.exhaustFilter = null; this.intakeFilter = null; this.mechanicalGain = null; this.noiseBuffer = null;
  }
}