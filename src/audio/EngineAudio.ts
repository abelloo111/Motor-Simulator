import type { EngineConfig, EngineState } from "../simulation/engine";
import { DEFAULT_ENGINE_CONFIG } from "../simulation/engine";

/**
 * Procedural exhaust / intake texture whose pulse rate follows each configured
 * cylinder's share of a four-stroke cycle. This is a synthesis model, not a
 * recording or acoustically validated engine model.
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
  private saturation: WaveShaperNode | null = null;
  private scheduler: number | null = null;
  private nextFireTime = 0;
  private lastRpm = 0;
  private lastThrottle = 0;
  private lastLoad = 0;
  private lastCylinders = DEFAULT_ENGINE_CONFIG.cylinders;
  private lastLayout: EngineConfig["layout"] = DEFAULT_ENGINE_CONFIG.layout;
  private lastFiringOrder = [...DEFAULT_ENGINE_CONFIG.firingOrder];
  private fireIndex = 0;
  private muted = false;
  private engineActive = false;

  async start(state: EngineState, config: EngineConfig = DEFAULT_ENGINE_CONFIG): Promise<void> {
    if (this.context) {
      this.setMuted(false);
      this.update(state, config);
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) throw new Error("Este navegador no admite Web Audio.");
    const ctx = new Ctx();
    this.context = ctx;
    await ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.16;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    // Build the nonlinear saturation curve once. Creating an oversampled
    // WaveShaperNode and its curve for every combustion pulse caused avoidable
    // garbage collection and CPU spikes at high RPM.
    this.saturation = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * 2.1);
    }
    this.saturation.curve = curve;
    this.saturation.oversample = "2x";
    this.saturation.connect(this.master);

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = "lowpass";
    this.exhaustFilter.frequency.value = 360;
    this.exhaustFilter.Q.value = 0.8;
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0.72;
    this.exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(this.master);

    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = "bandpass";
    this.intakeFilter.frequency.value = 680;
    this.intakeFilter.Q.value = 0.55;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0.075;
    this.intakeFilter.connect(intakeGain);
    intakeGain.connect(this.master);

    this.mechanicalGain = ctx.createGain();
    this.mechanicalGain.gain.value = 0.02;
    this.mechanicalGain.connect(this.master);

    this.engineTone = ctx.createOscillator();
    this.engineTone.type = "triangle";
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.075;
    this.engineTone.connect(toneGain);
    toneGain.connect(this.exhaustFilter);
    this.engineTone.start();

    this.blockTone = ctx.createOscillator();
    this.blockTone.type = "sawtooth";
    const blockFilter = ctx.createBiquadFilter();
    blockFilter.type = "lowpass";
    blockFilter.frequency.value = 180;
    const blockGain = ctx.createGain();
    blockGain.gain.value = 0.045;
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
    this.muted = false;
    this.update(state, config);
    this.nextFireTime = ctx.currentTime + Math.max(0.01, 120 / Math.max(state.rpm * config.cylinders, 850));
    this.scheduler = window.setInterval(() => this.scheduleCombustions(), 20);
  }

  update(state: EngineState, config: EngineConfig = DEFAULT_ENGINE_CONFIG): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const rpm = Math.max(0, state.rpm);
    this.lastRpm = rpm;
    this.lastThrottle = state.throttle;
    this.lastLoad = state.load;
    this.lastCylinders = Math.max(1, config.cylinders);
    this.lastLayout = config.layout;
    this.lastFiringOrder = config.firingOrder.length ? config.firingOrder : [1];
    this.engineActive = state.ignition && rpm > 60;

    const smooth = (param: AudioParam, value: number, tau = 0.08) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, tau);
    };
    const firingHz = rpm * this.lastCylinders / 120;
    const layoutFactor = this.lastLayout === "boxer" ? 1.08 : this.lastLayout === "v" ? 0.94 : 1;
    if (this.engineTone) smooth(this.engineTone.frequency, 18 + firingHz * layoutFactor, 0.055);
    if (this.blockTone) smooth(this.blockTone.frequency, 28 + rpm / 60 * (this.lastLayout === "v" ? 0.58 : 0.47), 0.06);
    if (this.exhaustFilter) smooth(this.exhaustFilter.frequency, 190 + state.throttle * 950 + rpm * 0.052 + this.lastCylinders * 9);
    if (this.intakeFilter) smooth(this.intakeFilter.frequency, 320 + state.throttle * 1850 + rpm * 0.07);
    if (this.mechanicalGain) smooth(this.mechanicalGain.gain, 0.014 + Math.min(rpm / config.redlineRpm, 1) * 0.045);
    if (this.master) smooth(this.master.gain, this.muted || !this.engineActive ? 0 : 0.19 + state.throttle * 0.18 + state.load * 0.035, 0.09);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.context && this.master) {
      const level = value || !this.engineActive ? 0 : 0.19 + this.lastThrottle * 0.18 + this.lastLoad * 0.035;
      this.master.gain.setTargetAtTime(level, this.context.currentTime, 0.04);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  get isMuted(): boolean { return this.muted; }

  private scheduleCombustions(): void {
    const ctx = this.context;
    if (!ctx || !this.engineActive) return;
    const now = ctx.currentTime;
    const rpm = Math.max(0, this.lastRpm);
    if (rpm < 140) return;

    const period = 120 / Math.max(rpm * this.lastCylinders, 140);
    if (this.nextFireTime < now - period) this.nextFireTime = now + 0.003;
    const horizon = now + 0.075;
    let guard = 0;
    while (this.nextFireTime < horizon && guard++ < 24) {
      const cylinder = this.lastFiringOrder[this.fireIndex % this.lastFiringOrder.length] ?? 1;
      this.fire(this.nextFireTime, this.lastThrottle, this.lastLoad, rpm, cylinder);
      this.fireIndex++;
      this.nextFireTime += period;
    }
  }

  private fire(at: number, throttle: number, load: number, rpm: number, cylinder: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noiseBuffer) return;

    const cylinderVariation = cylinder % 2 === 0 ? 0.94 : 1.04;
    const layoutVariation = this.lastLayout === "boxer" ? 1.05 : this.lastLayout === "v" ? 0.96 : 1;
    const strength = (0.24 + throttle * 0.76) * cylinderVariation * layoutVariation /
      Math.sqrt(Math.max(1, this.lastCylinders));
    const transient = ctx.createBufferSource();
    transient.buffer = this.noiseBuffer;
    transient.playbackRate.setValueAtTime(0.88 + Math.min(rpm / 8500, 0.4), at);

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(420 + throttle * 970 + rpm * 0.042 + (cylinder % 3) * 38, at);
    low.Q.value = 0.72;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 42;
    const resonance = ctx.createBiquadFilter();
    resonance.type = "peaking";
    resonance.frequency.setValueAtTime((this.lastLayout === "boxer" ? 96 : this.lastLayout === "v" ? 118 : 108) + throttle * 28, at);
    resonance.Q.value = 1.1;
    resonance.gain.value = 4.5 + Math.min(load, 1) * 1.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.25 * strength, at + 0.0035);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09 + throttle * 0.07);
    transient.connect(low);
    low.connect(high);
    high.connect(resonance);
    resonance.connect(env);
    env.connect(this.saturation ?? this.master);
    transient.start(at);
    transient.stop(at + 0.24);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime((this.lastLayout === "boxer" ? 57 : 66) + throttle * 24 + rpm * 0.003, at);
    body.frequency.exponentialRampToValueAtTime(38 + rpm * 0.0018, at + 0.16);
    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, at);
    bodyEnv.gain.exponentialRampToValueAtTime(0.095 * strength, at + 0.008);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    body.connect(bodyEnv);
    bodyEnv.connect(this.exhaustFilter ?? this.master);
    body.start(at);
    body.stop(at + 0.22);

    if (throttle > 0.08) {
      const intake = ctx.createBufferSource();
      intake.buffer = this.noiseBuffer;
      intake.playbackRate.setValueAtTime(0.7 + throttle * 0.8, at);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(780 + throttle * 1900 + rpm * 0.035, at);
      filter.Q.value = 0.65;
      const intakeEnv = ctx.createGain();
      intakeEnv.gain.setValueAtTime(0.0001, at);
      intakeEnv.gain.exponentialRampToValueAtTime(0.018 * throttle * strength, at + 0.012);
      intakeEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.068);
      intake.connect(filter);
      filter.connect(intakeEnv);
      intakeEnv.connect(this.master);
      intake.start(at);
      intake.stop(at + 0.085);
    }
  }

  stop(): void {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
    this.engineTone = null;
    this.blockTone = null;
    this.exhaustFilter = null;
    this.intakeFilter = null;
    this.mechanicalGain = null;
    this.noiseBuffer = null;
    this.saturation = null;
  }
}
