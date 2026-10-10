import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity, AudioLines, Gauge, RotateCcw, Settings2, Volume2, VolumeX,
  Zap, Flame, ChevronDown, Power, Waves, ChevronUp, ChevronDown as ChevronDownIcon,
  Settings, Cog, GaugeCircle,
} from "lucide-react";
import EngineCanvas from "./components/EngineCanvas";
import { EngineAudio } from "./audio/EngineAudio";
import {
  DEFAULT_ENGINE_CONFIG, EngineSimulation, defaultFiringOrder, formatEngineLayout,
  getEngineDisplacementCc, normalizeEngineConfig, type EngineConfig, type EngineControls,
  type EngineLayout, type EngineState,
} from "./simulation/engine";

const initialControls: EngineControls = { throttle: 0.04, load: 0.18, ignition: false, gear: 0, clutch: 1 };
const initialState: EngineState = {
  rpm: 0, torque: 0, power: 0, throttle: 0, load: initialControls.load,
  ignition: false, cycleAngle: 0, temperature: 22, displacementCc: 0,
  gear: 0, clutch: 1, vehicleSpeedKmh: 0, combustionFrequency: 0,
};

function Metric({ label, value, unit, icon: Icon, accent = "neutral" }: {
  label: string; value: string; unit: string; icon: typeof Activity; accent?: "neutral" | "orange" | "blue";
}) {
  return <div className="metric-card">
    <div className={"metric-icon " + accent}><Icon size={16} strokeWidth={1.8} /></div>
    <div className="metric-copy"><span className="metric-label">{label}</span><div className="metric-value">{value}<small>{unit}</small></div></div>
  </div>;
}

function GearLabel({ gear }: { gear: number }) {
  return <>{gear === -1 ? "R" : gear === 0 ? "N" : String(gear)}</>;
}

export default function App() {
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG);
  const simulation = useRef(new EngineSimulation(DEFAULT_ENGINE_CONFIG));
  const audio = useRef(new EngineAudio());
  const lastTime = useRef(0);
  const [controls, setControls] = useState<EngineControls>(initialControls);
  const [state, setState] = useState<EngineState>(initialState);
  const [soundActive, setSoundActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [firingOrderText, setFiringOrderText] = useState(DEFAULT_ENGINE_CONFIG.firingOrder.join("-"));
  const [gearRatiosText, setGearRatiosText] = useState(DEFAULT_ENGINE_CONFIG.gearRatios.join(", "));
  const [shiftHint, setShiftHint] = useState("");

  const patchControls = (patch: Partial<EngineControls>) => setControls((current) => ({ ...current, ...patch }));
  const patchConfig = (patch: Partial<EngineConfig>) => setConfig((current) => {
    const next = normalizeEngineConfig({ ...current, ...patch });
    simulation.current.setConfig(next);
    return next;
  });

  const changeCylinderCount = (count: number) => {
    const order = defaultFiringOrder(count, config.layout);
    setFiringOrderText(order.join("-"));
    patchConfig({ cylinders: count, firingOrder: order });
  };
  const changeLayout = (layout: EngineLayout) => {
    const order = defaultFiringOrder(config.cylinders, layout);
    setFiringOrderText(order.join("-"));
    patchConfig({ layout, firingOrder: order });
  };
  const changeFiringOrder = (text: string) => {
    setFiringOrderText(text);
    const order = text.split(/[\s,;-]+/).filter(Boolean).map(Number);
    if (order.length === config.cylinders &&
      order.every((n) => Number.isInteger(n) && n >= 1 && n <= config.cylinders) &&
      new Set(order).size === config.cylinders) {
      patchConfig({ firingOrder: order });
    }
  };
  const changeGearRatios = (text: string) => {
    setGearRatiosText(text);
    const ratios = text.split(/[,\s;]+/).filter(Boolean).map(Number);
    if (ratios.length >= 2 && ratios.length <= 8 && ratios.every((value) => Number.isFinite(value) && value >= 0.3 && value <= 6)) {
      patchConfig({ gearRatios: ratios });
      if (controls.gear > ratios.length) patchControls({ gear: ratios.length });
    }
  };

  const startAudio = useCallback(async () => {
    try {
      setSoundError("");
      await audio.current.start(state, config);
      setSoundActive(true);
      setMuted(false);
    } catch {
      setSoundError("No se pudo iniciar el audio. Prueba en Chrome o revisa los permisos de sonido.");
    }
  }, [state, config]);

  useEffect(() => {
    simulation.current.setConfig(config);
    let raf = 0;
    const tick = (now: number) => {
      const dt = lastTime.current === 0 ? 0 : Math.min((now - lastTime.current) / 1000, 0.05);
      lastTime.current = now;
      const next = simulation.current.step(dt, controls);
      setState(next);
      if (soundActive) audio.current.update(next, config);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controls, soundActive, config]);

  useEffect(() => () => audio.current.stop(), []);

  const toggleIgnition = () => patchControls({ ignition: !controls.ignition });
  const reset = () => {
    simulation.current.reset();
    setControls(initialControls);
    setState({ ...initialState, load: initialControls.load });
    lastTime.current = 0;
    setShiftHint("");
  };

  const toggleSound = async () => {
    if (!soundActive) { await startAudio(); return; }
    const isMuted = audio.current.toggleMute();
    setMuted(isMuted);
  };

  const shiftGear = (nextGear: number) => {
    if (controls.clutch > 0.45) {
      setShiftHint("Pisa el embrague antes de cambiar de marcha.");
      return;
    }
    patchControls({ gear: Math.max(-1, Math.min(config.gearRatios.length, nextGear)) });
    setShiftHint("");
  };

  const cyclePhase = state.cycleAngle < 180 ? "EXPANSIÓN" :
    state.cycleAngle < 360 ? "ESCAPE" : state.cycleAngle < 540 ? "ADMISIÓN" : "COMPRESIÓN";
  const displacementCc = getEngineDisplacementCc(config);
  const gearName = controls.gear === -1 ? "MARCHA ATRÁS" : controls.gear === 0 ? "PUNTO MUERTO" : "MARCHA " + controls.gear;
  const gearRatio = controls.gear > 0 ? config.gearRatios[controls.gear - 1] :
    controls.gear === -1 ? 3.2 : 0;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Motor Simulator inicio">
        <div className="brand-mark"><Gauge size={21} strokeWidth={1.9} /></div>
        <div className="brand-type"><strong>MOTOR<span>SIM</span></strong><small>ENGINE LAB / 02</small></div>
      </a>
      <div className="topbar-center"><span className="status-dot" /><span>SIMULACIÓN EN TIEMPO REAL</span></div>
      <div className="topbar-right">
        <span className="mode-chip">BETA <span>0.2</span></span>
        <button className={"icon-button " + (showSettings ? "settings-active" : "")} onClick={() => setShowSettings((v) => !v)} aria-label="Configuración del motor" title="Configuración del motor"><Settings2 size={18} /></button>
      </div>
    </header>

    {showSettings && <section className="config-panel">
      <div className="config-panel-heading">
        <div><span className="section-number">SETUP / 01</span><h2>Configuración del motor</h2><p>Los parámetros modifican la geometría estimada, el régimen y la respuesta del sonido.</p></div>
        <button className="quiet-button" onClick={() => {
          setConfig(DEFAULT_ENGINE_CONFIG);
          simulation.current.setConfig(DEFAULT_ENGINE_CONFIG);
          setFiringOrderText(DEFAULT_ENGINE_CONFIG.firingOrder.join("-"));
          setGearRatiosText(DEFAULT_ENGINE_CONFIG.gearRatios.join(", "));
        }}><RotateCcw size={14} /> Valores base</button>
      </div>
      <div className="config-grid">
        <label className="config-field"><span>Cilindros</span>
          <select value={config.cylinders} onChange={(e) => changeCylinderCount(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? "cilindro" : "cilindros"}</option>)}
          </select>
        </label>
        <label className="config-field"><span>Disposición</span>
          <select value={config.layout} onChange={(e) => changeLayout(e.target.value as EngineLayout)}>
            <option value="inline">En línea</option><option value="v">En V</option><option value="boxer">Bóxer</option>
          </select>
        </label>
        <label className="config-field"><span>Diámetro (mm)</span><input type="number" min="50" max="120" value={config.boreMm} onChange={(e) => patchConfig({ boreMm: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Carrera (mm)</span><input type="number" min="40" max="120" value={config.strokeMm} onChange={(e) => patchConfig({ strokeMm: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Compresión ( : 1 )</span><input type="number" min="6" max="16" step="0.1" value={config.compressionRatio} onChange={(e) => patchConfig({ compressionRatio: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Ralentí (RPM)</span><input type="number" min="500" max="1800" step="50" value={config.idleRpm} onChange={(e) => patchConfig({ idleRpm: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Límite de RPM</span><input type="number" min="2500" max="12000" step="100" value={config.redlineRpm} onChange={(e) => patchConfig({ redlineRpm: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Orden de encendido</span><input value={firingOrderText} onChange={(e) => changeFiringOrder(e.target.value)} onBlur={() => {
          const order = config.firingOrder;
          setFiringOrderText(order.join("-"));
        }} aria-label="Orden de encendido, separados por guiones" /><small>Usa cada cilindro una vez: 1-3-4-2</small></label>
        <label className="config-field"><span>Relación final</span><input type="number" min="2" max="6" step="0.05" value={config.finalDrive} onChange={(e) => patchConfig({ finalDrive: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Masa del vehículo (kg)</span><input type="number" min="500" max="3000" step="25" value={config.vehicleMassKg} onChange={(e) => patchConfig({ vehicleMassKg: Number(e.target.value) })} /></label>
        <label className="config-field"><span>Radio de rueda (mm)</span><input type="number" min="220" max="430" step="5" value={config.wheelRadiusMm} onChange={(e) => patchConfig({ wheelRadiusMm: Number(e.target.value) })} /></label>
        <label className="config-field config-field-wide"><span>Relaciones de caja (primera → última)</span><input value={gearRatiosText} onChange={(e) => changeGearRatios(e.target.value)} onBlur={() => setGearRatiosText(config.gearRatios.map((r) => r.toFixed(2)).join(", "))} /><small>Entre 2 y 8 relaciones, separadas por comas. Ej.: 3.45, 2.05, 1.38, 1.00, 0.78, 0.64</small></label>
      </div>
    </section>}

    <section className="intro-row">
      <div>
        <div className="eyebrow"><span>01</span> LABORATORIO DE COMBUSTIÓN</div>
        <h1>Entiende lo que<br /><em>lo hace girar.</em></h1>
        <p className="intro-copy">Configura la arquitectura del motor, prueba su respuesta y explora cómo la transmisión transforma el par en movimiento.</p>
      </div>
      <div className="engine-identity">
        <span className="identity-kicker">PLATAFORMA ACTIVA</span><strong>{config.layout === "v" ? "V" : config.layout === "boxer" ? "BÓXER" : "EN LÍNEA"} · {config.cylinders} CYL</strong>
        <span>4 tiempos / encendido por chispa</span><div className="identity-rule" />
        <div className="identity-spec"><span>CILINDRADA</span><b>{Math.round(displacementCc).toLocaleString("es-ES")} cc</b></div>
        <div className="identity-spec"><span>RÉGIMEN MÁX.</span><b>{config.redlineRpm.toLocaleString("es-ES")} rpm</b></div>
        <small>Geometría calculada según diámetro y carrera.</small>
      </div>
    </section>

    <section className="workspace">
      <div className="panel engine-panel">
        <div className="panel-header">
          <div className="panel-title"><span className="section-number">01 /</span><div><h2>Vista de sección</h2><p>MECÁNICA · CICLO DE 720°</p></div></div>
          <div className={"running-chip " + (controls.ignition ? "on" : "")}><span />{controls.ignition ? "MOTOR ACTIVO" : "MOTOR DETENIDO"}</div>
        </div>
        <div className="engine-visual">
          <EngineCanvas state={state} config={config} />
          <div className="visual-legend">
            <span><i className="legend-blue" /> Admisión</span><span><i className="legend-orange" /> Escape</span>
            <span className="legend-phase">{cyclePhase}</span>
          </div>
        </div>
        <div className="cycle-strip">
          {["Admisión", "Compresión", "Expansión", "Escape"].map((phase, i) => {
            const active = (i === 0 && state.cycleAngle >= 360 && state.cycleAngle < 540) ||
              (i === 1 && state.cycleAngle >= 540) || (i === 2 && state.cycleAngle < 180) ||
              (i === 3 && state.cycleAngle >= 180 && state.cycleAngle < 360);
            return <div key={phase} className={"cycle-step " + (active && controls.ignition ? "active" : "")}><span>0{i + 1}</span><b>{phase}</b></div>;
          })}
        </div>
      </div>

      <aside className="panel controls-panel">
        <div className="panel-header"><div className="panel-title"><span className="section-number">02 /</span><div><h2>Banco de pruebas</h2><p>RESPUESTA Y TRANSMISIÓN</p></div></div></div>
        <div className="rpm-block">
          <div className="rpm-meta"><span>RÉGIMEN DEL MOTOR</span><span className="live-tag"><i /> LIVE</span></div>
          <div className="rpm-reading">{Math.round(state.rpm).toLocaleString("es-ES")}<small>RPM</small></div>
          <div className="rpm-track"><div style={{ width: Math.min(100, state.rpm / config.redlineRpm * 100) + "%" }} /></div>
          <div className="scale-labels"><span>0</span><span>{config.idleRpm.toLocaleString("es-ES")} ralentí</span><span>{config.redlineRpm.toLocaleString("es-ES")}</span></div>
        </div>

        <div className="control-group">
          <div className="control-heading"><label htmlFor="throttle">Acelerador</label><strong>{Math.round(controls.throttle * 100)}<small>%</small></strong></div>
          <input id="throttle" className="range throttle" type="range" min="0" max="1" step="0.01" value={controls.throttle} onChange={(e) => patchControls({ throttle: Number(e.target.value) })} style={{ "--range-progress": (controls.throttle * 100) + "%" } as CSSProperties & { "--range-progress": string }} />
          <div className="range-captions"><span>CERRADO</span><span>PLENA CARGA</span></div>
        </div>
        <div className="control-group load-group">
          <div className="control-heading"><label htmlFor="load">Carga del motor</label><strong>{Math.round(controls.load * 100)}<small>%</small></strong></div>
          <input id="load" className="range load" type="range" min="0" max="1" step="0.01" value={controls.load} onChange={(e) => patchControls({ load: Number(e.target.value) })} style={{ "--range-progress": (controls.load * 100) + "%" } as CSSProperties & { "--range-progress": string }} />
          <div className="range-captions"><span>SIN CARGA</span><span>ALTA CARGA</span></div>
        </div>

        <div className="transmission-card">
          <div className="transmission-top">
            <div><span className="micro-label">TRANSMISIÓN MANUAL</span><strong className="gear-display"><GearLabel gear={controls.gear} /></strong><span className="gear-name">{gearName}</span></div>
            <div className="speed-readout"><strong>{Math.abs(state.vehicleSpeedKmh).toFixed(0)}</strong><span>KM/H</span></div>
          </div>
          <div className="gear-controls">
            <button className="gear-shift-button" onClick={() => shiftGear(controls.gear - 1)} disabled={controls.gear <= -1} aria-label="Bajar marcha" title="Bajar marcha"><ChevronDownIcon size={16} /> MARCHA −</button>
            <button className="gear-shift-button" onClick={() => shiftGear(controls.gear + 1)} disabled={controls.gear >= config.gearRatios.length} aria-label="Subir marcha" title="Subir marcha">MARCHA + <ChevronUp size={16} /></button>
          </div>
          <div className="control-heading clutch-heading"><label htmlFor="clutch">Embrague</label><strong>{Math.round(controls.clutch * 100)}<small>%</small></strong></div>
          <input id="clutch" className="range clutch-range" type="range" min="0" max="1" step="0.01" value={controls.clutch} onChange={(e) => {
            patchControls({ clutch: Number(e.target.value) });
            if (Number(e.target.value) <= 0.45) setShiftHint("");
          }} style={{ "--range-progress": (controls.clutch * 100) + "%" } as CSSProperties & { "--range-progress": string }} />
          <div className="range-captions"><span>PISADO</span><span>ACOPLADO</span></div>
          <div className="gear-detail"><span>Relación</span><b>{gearRatio ? gearRatio.toFixed(2) + " : 1" : "—"} </b><span>Final</span><b>{config.finalDrive.toFixed(2)} : 1</b></div>
          <p className="gear-help">{shiftHint || "Pisa el embrague para cambiar; suéltalo gradualmente para transmitir el par."}</p>
        </div>

        <div className="ignition-row">
          <div className="ignition-icon"><Zap size={17} /></div><div className="ignition-copy"><strong>Encendido</strong><span>{controls.ignition ? "Combustión habilitada" : "Sistema apagado"}</span></div>
          <button className={"toggle " + (controls.ignition ? "checked" : "")} role="switch" aria-checked={controls.ignition} aria-label="Encendido del motor" onClick={toggleIgnition}><span /></button>
        </div>
        <div className="primary-controls">
          <button className={"start-button " + (controls.ignition ? "is-running" : "")} onClick={toggleIgnition}><Power size={17} />{controls.ignition ? "DETENER MOTOR" : "ARRANCAR MOTOR"}</button>
          <button className="reset-button" onClick={reset} aria-label="Reiniciar simulación" title="Reiniciar simulación"><RotateCcw size={17} /></button>
        </div>
        <button className={"sound-button " + (soundActive && !muted ? "sound-on" : "")} onClick={toggleSound}>
          {soundActive && !muted ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <span><strong>{!soundActive ? "Activar sonido del motor" : muted ? "Reanudar sonido" : "Silenciar motor"}</strong><small>Combustión · admisión · escape</small></span><AudioLines className="sound-wave" size={20} />
        </button>
        {soundError && <p className="error-message">{soundError}</p>}
        <p className="audio-note"><Waves size={13} /> El pulso de combustión y el timbre responden a la configuración seleccionada y a las RPM.</p>
      </aside>
    </section>

    <section className="metrics-section">
      <div className="metrics-heading"><div><span className="section-number">03 /</span><h2>Telemetría</h2></div><span>VALORES DEL MODELO SIMPLIFICADO</span></div>
      <div className="metrics-grid">
        <Metric label="Potencia estimada" value={state.power.toFixed(1)} unit="kW" icon={Activity} accent="orange" />
        <Metric label="Par estimado" value={state.torque.toFixed(1)} unit="Nm" icon={RotateCcw} accent="blue" />
        <Metric label="Temperatura virtual" value={Math.round(state.temperature).toString()} unit="°C" icon={Flame} />
        <Metric label="Cilindrada" value={(displacementCc / 1000).toFixed(2)} unit="L" icon={Cog} />
      </div>
    </section>

    <footer className="footer">
      <div className="footer-brand"><Gauge size={16} /> MOTOR<span>SIM</span></div>
      <span>PROTOTIPO INTERACTIVO · MODELO FÍSICO SIMPLIFICADO</span><span>HECHO PARA EXPLORAR.</span>
    </footer>
  </main>;
}
