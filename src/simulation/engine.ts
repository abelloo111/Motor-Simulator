export type EngineLayout = "inline" | "v" | "boxer";

export type EngineConfig = {
  cylinders: number;
  layout: EngineLayout;
  boreMm: number;
  strokeMm: number;
  compressionRatio: number;
  idleRpm: number;
  redlineRpm: number;
  /** Cylinder numbers in firing sequence, e.g. 1-3-4-2 for a common inline-four. */
  firingOrder: number[];
  gearRatios: number[];
  finalDrive: number;
  wheelRadiusMm: number;
  vehicleMassKg: number;
};

export type EngineControls = {
  throttle: number;
  load: number;
  ignition: boolean;
  /** -1 = reverse, 0 = neutral, 1..N = forward gears. */
  gear: number;
  /** 0 = clutch pedal pressed, 1 = clutch fully engaged. */
  clutch: number;
};

export type EngineState = {
  rpm: number;
  torque: number;
  power: number;
  throttle: number;
  load: number;
  ignition: boolean;
  cycleAngle: number;
  temperature: number;
  displacementCc: number;
  gear: number;
  clutch: number;
  vehicleSpeedKmh: number;
  combustionFrequency: number;
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  cylinders: 4,
  layout: "inline",
  boreMm: 86,
  strokeMm: 86,
  compressionRatio: 10.5,
  idleRpm: 850,
  redlineRpm: 6500,
  firingOrder: [1, 3, 4, 2],
  gearRatios: [3.45, 2.05, 1.38, 1, 0.78, 0.64],
  finalDrive: 3.9,
  wheelRadiusMm: 310,
  vehicleMassKg: 1250,
};

export const IDLE_SPEED = DEFAULT_ENGINE_CONFIG.idleRpm;
export const RPM_LIMIT = DEFAULT_ENGINE_CONFIG.redlineRpm;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function getEngineDisplacementCc(config: Pick<EngineConfig, "cylinders" | "boreMm" | "strokeMm">): number {
  const radiusCm = config.boreMm / 20;
  const strokeCm = config.strokeMm / 10;
  return Math.PI * radiusCm * radiusCm * strokeCm * config.cylinders;
}

export function defaultFiringOrder(cylinders: number, layout: EngineLayout = "inline"): number[] {
  const presets: Record<number, number[]> = {
    1: [1],
    2: [1, 2],
    3: [1, 3, 2],
    4: [1, 3, 4, 2],
    5: [1, 2, 4, 5, 3],
    6: [1, 5, 3, 6, 2, 4],
    8: [1, 5, 4, 8, 6, 3, 7, 2],
  };
  const order = presets[cylinders] ?? Array.from({ length: cylinders }, (_, i) => i + 1);
  // These are useful starter patterns, not manufacturer-specific firing-order data.
  if (layout === "boxer" && cylinders === 4) return [1, 3, 2, 4];
  if (layout === "v" && cylinders === 6) return [1, 4, 2, 5, 3, 6];
  return [...order];
}

export function normalizeFiringOrder(order: number[], cylinders: number): number[] {
  const valid: number[] = [];
  for (const value of order) {
    const cylinder = Math.round(value);
    if (cylinder >= 1 && cylinder <= cylinders && !valid.includes(cylinder)) valid.push(cylinder);
  }
  for (let cylinder = 1; cylinder <= cylinders; cylinder++) {
    if (!valid.includes(cylinder)) valid.push(cylinder);
  }
  return valid.slice(0, cylinders);
}

export function normalizeEngineConfig(candidate: EngineConfig): EngineConfig {
  const cylinders = Math.round(clamp(Number(candidate.cylinders) || 4, 1, 12));
  const layout: EngineLayout = candidate.layout === "v" || candidate.layout === "boxer" ? candidate.layout : "inline";
  const gearRatios = (candidate.gearRatios?.length ? candidate.gearRatios : DEFAULT_ENGINE_CONFIG.gearRatios)
    .slice(0, 8)
    .map((ratio) => clamp(Number(ratio) || 1, 0.3, 6));
  return {
    cylinders,
    layout,
    boreMm: clamp(Number(candidate.boreMm) || 86, 50, 120),
    strokeMm: clamp(Number(candidate.strokeMm) || 86, 40, 120),
    compressionRatio: clamp(Number(candidate.compressionRatio) || 10.5, 6, 16),
    idleRpm: clamp(Number(candidate.idleRpm) || 850, 500, 1800),
    redlineRpm: clamp(Number(candidate.redlineRpm) || 6500, 2500, 12000),
    firingOrder: normalizeFiringOrder(candidate.firingOrder ?? [], cylinders),
    gearRatios,
    finalDrive: clamp(Number(candidate.finalDrive) || 3.9, 2, 6),
    wheelRadiusMm: clamp(Number(candidate.wheelRadiusMm) || 310, 220, 430),
    vehicleMassKg: clamp(Number(candidate.vehicleMassKg) || 1250, 500, 3000),
  };
}

/**
 * Responsive illustrative model. It couples throttle, engine geometry, load and
 * a simple manual drivetrain; it is deliberately not a validated engine solver.
 */
export class EngineSimulation {
  private rpm = 0;
  private cycleAngle = 0;
  private temperature = 22;
  private filteredThrottle = 0;
  private vehicleSpeed = 0;
  private running = false;
  private config: EngineConfig;

  constructor(config: EngineConfig = DEFAULT_ENGINE_CONFIG) {
    this.config = normalizeEngineConfig(config);
  }

  setConfig(config: EngineConfig): void {
    this.config = normalizeEngineConfig(config);
    this.rpm = Math.min(this.rpm, this.config.redlineRpm);
  }

  getConfig(): EngineConfig {
    return { ...this.config, firingOrder: [...this.config.firingOrder], gearRatios: [...this.config.gearRatios] };
  }

  getState(controls: EngineControls): EngineState {
    const rpm = Math.max(0, this.rpm);
    const displacementCc = getEngineDisplacementCc(this.config);
    const normalizedRpm = rpm / this.config.redlineRpm;
    const torqueCurve = Math.max(0.35, 1.14 - Math.pow((normalizedRpm - 0.46) / 0.68, 2));
    const peakTorque = Math.max(18, (displacementCc / 1000) * (76 + (this.config.compressionRatio - 8) * 1.4));
    const loadFactor = 1 - clamp(controls.load, 0, 1) * 0.38;
    const torque = this.running && controls.ignition
      ? Math.max(0, peakTorque * (0.12 + this.filteredThrottle * 0.88) * torqueCurve * loadFactor)
      : 0;
    return {
      rpm,
      torque,
      power: Math.max(0, torque * rpm / 9549),
      throttle: this.filteredThrottle,
      load: controls.load,
      ignition: controls.ignition && this.running,
      cycleAngle: this.cycleAngle,
      temperature: this.temperature,
      displacementCc,
      gear: controls.gear,
      clutch: controls.clutch,
      vehicleSpeedKmh: this.vehicleSpeed * 3.6,
      combustionFrequency: rpm * this.config.cylinders / 120,
    };
  }

  reset(): void {
    this.rpm = 0;
    this.cycleAngle = 0;
    this.temperature = 22;
    this.filteredThrottle = 0;
    this.vehicleSpeed = 0;
    this.running = false;
  }

  step(dtSeconds: number, controls: EngineControls): EngineState {
    const dt = clamp(dtSeconds, 0, 0.05);
    const throttleInput = controls.ignition ? clamp(controls.throttle, 0, 1) : 0;
    this.filteredThrottle += (throttleInput - this.filteredThrottle) * (1 - Math.exp(-dt * 5.8));

    if (controls.ignition && !this.running) {
      this.running = true;
      this.rpm = Math.max(this.rpm, this.config.idleRpm * 0.42);
    }

    if (this.running) {
      const idleAssist = controls.ignition
        ? Math.max(0, (this.config.idleRpm - this.rpm) / this.config.idleRpm) * 0.85
        : 0;
      const freeTarget = controls.ignition
        ? this.config.idleRpm + this.filteredThrottle * (this.config.redlineRpm * 0.94 - this.config.idleRpm)
        : 0;
      const response = controls.ignition ? 2.4 + this.filteredThrottle * 4.8 : 1.8;
      const engineTorqueDemand = 0.2 + this.filteredThrottle * 1.65 + idleAssist;
      const friction = 0.14 + (this.rpm / this.config.redlineRpm) * 0.58 + controls.load * 0.34;
      const inertiaScale = 1 / Math.max(0.65, Math.sqrt(getEngineDisplacementCc(this.config) / 2000));
      const netDrive = engineTorqueDemand - friction;
      const freeRpmChange = (freeTarget - this.rpm) * (1 - Math.exp(-response * dt)) +
        netDrive * 115 * inertiaScale * dt;
      this.rpm += freeRpmChange;

      const gear = controls.gear;
      const ratio = gear > 0
        ? (this.config.gearRatios[gear - 1] ?? 1)
        : gear === -1 ? 3.2 : 0;
      const clutch = clamp(controls.clutch, 0, 1);
      if (gear !== 0 && clutch > 0.01) {
        const wheelCircumference = 2 * Math.PI * (this.config.wheelRadiusMm / 1000);
        const wheelRpm = Math.abs(this.vehicleSpeed) / wheelCircumference * 60;
        const targetRpm = wheelRpm * ratio * this.config.finalDrive;
        const coupling = clutch * clamp(this.vehicleSpeed / 3.5, 0, 1);
        this.rpm += (targetRpm - this.rpm) * clamp(dt * coupling * 2.8, 0, 0.22);
      }

      const normalizedRpm = clamp(this.rpm / this.config.redlineRpm, 0, 1.2);
      const torqueCurve = Math.max(0.35, 1.14 - Math.pow((normalizedRpm - 0.46) / 0.68, 2));
      const displacementLitres = getEngineDisplacementCc(this.config) / 1000;
      const peakTorque = Math.max(18, displacementLitres * (76 + (this.config.compressionRatio - 8) * 1.4));
      const availableTorque = controls.ignition
        ? peakTorque * (0.12 + this.filteredThrottle * 0.88) * torqueCurve * (1 - controls.load * 0.38)
        : 0;

      if (gear !== 0 && clutch > 0.01 && controls.ignition) {
        const ratioForForce = gear < 0 ? 3.2 : (this.config.gearRatios[gear - 1] ?? 1);
        const force = availableTorque * ratioForForce * this.config.finalDrive * 0.86 * clutch /
          Math.max(0.22, this.config.wheelRadiusMm / 1000);
        const direction = gear < 0 ? -1 : 1;
        const rollingResistance = Math.sign(this.vehicleSpeed) * (95 + Math.abs(this.vehicleSpeed) * 18);
        const loadDrag = Math.sign(this.vehicleSpeed || direction) * controls.load * 180;
        const acceleration = (direction * force - rollingResistance - loadDrag) / this.config.vehicleMassKg;
        this.vehicleSpeed = Math.max(-20, Math.min(66.7, this.vehicleSpeed + acceleration * dt));
      } else {
        this.vehicleSpeed *= Math.exp(-dt * 0.18);
      }

      this.rpm = clamp(this.rpm, 0, this.config.redlineRpm);
      if (this.rpm <= 5 && !controls.ignition) {
        this.running = false;
        this.rpm = 0;
      } else if (controls.ignition && this.rpm < this.config.idleRpm * 0.78 && controls.gear !== 0 && controls.clutch > 0.85 && Math.abs(this.vehicleSpeed) < 0.8) {
        // A fully engaged clutch at a standstill can stall the engine.
        this.rpm = Math.max(0, this.rpm - dt * 260);
        if (this.rpm < 5) this.running = false;
      }

      this.cycleAngle = (this.cycleAngle + this.rpm / 60 * 360 * dt) % 720;
      this.temperature += (2.5 + this.filteredThrottle * 8 - (this.temperature - 22) * 0.038) * dt;
    } else {
      this.rpm = 0;
      this.vehicleSpeed = Math.max(0, this.vehicleSpeed - (0.035 + this.vehicleSpeed * 0.018) * dt);
      this.temperature += (22 - this.temperature) * dt * 0.015;
    }

    return this.getState(controls);
  }
}

export function formatEngineLayout(layout: EngineLayout): string {
  if (layout === "v") return "V";
  if (layout === "boxer") return "BÓXER";
  return "EN LÍNEA";
}
