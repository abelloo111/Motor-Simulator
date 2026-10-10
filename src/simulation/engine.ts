export type EngineControls = { throttle: number; load: number; ignition: boolean };
export type EngineState = {
  rpm: number; torque: number; power: number; throttle: number; load: number;
  ignition: boolean; cycleAngle: number; temperature: number;
};
const IDLE_RPM = 850;
const MAX_RPM = 6800;

/** Responsive, tunable single-cylinder four-stroke prototype; not a thermodynamic solver. */
export class EngineSimulation {
  private rpm = 0;
  private cycleAngle = 0;
  private temperature = 22;
  private filteredThrottle = 0;
  private running = false;

  getState(controls: EngineControls): EngineState {
    const t = this.filteredThrottle;
    const n = Math.max(0, Math.min(1, this.rpm / MAX_RPM));
    const curve = Math.max(0.18, 1.12 - Math.pow((n - 0.43) / 0.62, 2));
    const torque = this.running ? (2.15 + t * 45 * curve) * (1 - controls.load * 0.54) : 0;
    return {
      rpm: this.rpm, torque: Math.max(0, torque), power: Math.max(0, torque * this.rpm / 9549),
      throttle: t, load: controls.load, ignition: controls.ignition && this.running,
      cycleAngle: this.cycleAngle, temperature: this.temperature,
    };
  }

  reset(): void {
    this.rpm = 0; this.cycleAngle = 0; this.temperature = 22;
    this.filteredThrottle = 0; this.running = false;
  }

  step(dtSeconds: number, controls: EngineControls): EngineState {
    const dt = Math.max(0, Math.min(dtSeconds, 0.05));
    this.filteredThrottle += ((controls.ignition ? controls.throttle : 0) - this.filteredThrottle) * (1 - Math.exp(-dt * 5.8));
    if (controls.ignition && !this.running) { this.running = true; this.rpm = Math.max(this.rpm, 340); }
    if (this.running) {
      const idleAssist = Math.max(0, (IDLE_RPM - this.rpm) / IDLE_RPM) * 0.44;
      const combustion = 0.48 + this.filteredThrottle * 1.28 + idleAssist;
      const drag = 0.18 + this.rpm / 4200 + controls.load * 0.8;
      this.rpm += (combustion - drag) * 2450 * dt;
      if (!controls.ignition) this.rpm -= (950 + this.rpm * 0.6) * dt;
      this.rpm = Math.max(0, Math.min(MAX_RPM, this.rpm));
      if (this.rpm <= 1 && !controls.ignition) this.running = false;
      this.cycleAngle = (this.cycleAngle + this.rpm / 60 * 360 * dt) % 720;
      this.temperature += (25 + this.filteredThrottle * 170 - (this.temperature - 22) * 0.05) * dt;
    } else {
      this.rpm = 0;
      this.temperature += (22 - this.temperature) * dt * 0.015;
    }
    return this.getState(controls);
  }
}
export const RPM_LIMIT = MAX_RPM;
export const IDLE_SPEED = IDLE_RPM;