import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity, AudioLines, Gauge, RotateCcw, Settings2, Volume2, VolumeX,
  Zap, Flame, ChevronDown, Power, Waves,
} from "lucide-react";
import EngineCanvas from "./components/EngineCanvas";
import { EngineAudio } from "./audio/EngineAudio";
import { EngineSimulation, IDLE_SPEED, RPM_LIMIT, type EngineControls, type EngineState } from "./simulation/engine";

const initialControls: EngineControls = { throttle: 0.12, load: 0.18, ignition: false };
const initialState: EngineState = {
  rpm: 0, torque: 0, power: 0, throttle: 0, load: initialControls.load,
  ignition: false, cycleAngle: 0, temperature: 22,
};

function Metric({ label, value, unit, icon: Icon, accent = "neutral" }: {
  label: string; value: string; unit: string; icon: typeof Activity; accent?: "neutral" | "orange" | "blue";
}) {
  return <div className="metric-card">
    <div className={"metric-icon " + accent}><Icon size={16} strokeWidth={1.8} /></div>
    <div className="metric-copy"><span className="metric-label">{label}</span><div className="metric-value">{value}<small>{unit}</small></div></div>
  </div>;
}

export default function App() {
  const simulation = useRef(new EngineSimulation());
  const audio = useRef(new EngineAudio());
  const lastTime = useRef(0);
  const [controls, setControls] = useState<EngineControls>(initialControls);
  const [state, setState] = useState<EngineState>(initialState);
  const [soundActive, setSoundActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundError, setSoundError] = useState("");

  const patchControls = (patch: Partial<EngineControls>) => setControls((current) => ({ ...current, ...patch }));

  const startAudio = useCallback(async () => {
    try {
      setSoundError("");
      await audio.current.start(state);
      setSoundActive(true);
      setMuted(false);
    } catch {
      setSoundError("No se pudo iniciar el audio. Prueba en Chrome o revisa los permisos de sonido.");
    }
  }, [state]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const dt = lastTime.current === 0 ? 0 : Math.min((now - lastTime.current) / 1000, 0.05);
      lastTime.current = now;
      const next = simulation.current.step(dt, controls);
      setState(next);
      if (soundActive) audio.current.update(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controls, soundActive]);

  useEffect(() => () => audio.current.stop(), []);

  const toggleIgnition = () => patchControls({ ignition: !controls.ignition });
  const reset = () => {
    simulation.current.reset();
    setControls(initialControls);
    setState(initialState);
  };

  const toggleSound = async () => {
    if (!soundActive) { await startAudio(); return; }
    const isMuted = audio.current.toggleMute();
    setMuted(isMuted);
  };

  const cyclePhase = state.cycleAngle < 180 ? "EXPANSIÓN" :
    state.cycleAngle < 360 ? "ESCAPE" : state.cycleAngle < 540 ? "ADMISIÓN" : "COMPRESIÓN";

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Motor Simulator inicio">
        <div className="brand-mark"><Gauge size={21} strokeWidth={1.9} /></div>
        <div className="brand-type"><strong>MOTOR<span>SIM</span></strong><small>ENGINE LAB / 01</small></div>
      </a>
      <div className="topbar-center"><span className="status-dot" /><span>SIMULACIÓN EN TIEMPO REAL</span></div>
      <div className="topbar-right">
        <span className="mode-chip">BETA <span>0.1</span></span>
        <button className="icon-button" onClick={() => setShowSettings((v) => !v)} aria-label="Ajustes" title="Ajustes"><Settings2 size={18} /></button>
      </div>
    </header>

    {showSettings && <section className="settings-panel">
      <div><strong>Configuración del prototipo</strong><p>Monocilíndrico · 4 tiempos · encendido por chispa</p></div>
      <button className="quiet-button" onClick={reset}><RotateCcw size={14} /> Reiniciar motor</button>
    </section>}

    <section className="intro-row">
      <div>
        <div className="eyebrow"><span>01</span> LABORATORIO DE COMBUSTIÓN</div>
        <h1>Entiende lo que<br /><em>lo hace girar.</em></h1>
        <p className="intro-copy">Un motor, pieza por pieza. Modifica la aceleración, observa el ciclo y escucha cómo cambia su carácter.</p>
      </div>
      <div className="engine-identity">
        <span className="identity-kicker">PLATAFORMA ACTIVA</span><strong>SI · 1 CYL</strong>
        <span>4 tiempos / refrigerado por aire</span><div className="identity-rule" />
        <div className="identity-spec"><span>CILINDRADA</span><b>499 cc*</b></div>
        <div className="identity-spec"><span>RÉGIMEN MÁX.</span><b>{RPM_LIMIT.toLocaleString("es-ES")} rpm</b></div>
        <small>* Especificación visual de referencia</small>
      </div>
    </section>

    <section className="workspace">
      <div className="panel engine-panel">
        <div className="panel-header">
          <div className="panel-title"><span className="section-number">01 /</span><div><h2>Vista de sección</h2><p>MECÁNICA INTERNA · CICLO DE 720°</p></div></div>
          <div className={"running-chip " + (controls.ignition ? "on" : "")}><span />{controls.ignition ? "MOTOR ACTIVO" : "MOTOR DETENIDO"}</div>
        </div>
        <div className="engine-visual">
          <EngineCanvas state={state} />
          <div className="visual-legend">
            <span><i className="legend-blue" /> Admisión</span><span><i className="legend-orange" /> Escape</span>
            <span className="legend-phase">{cyclePhase}</span>
          </div>
        </div>
        <div className="cycle-strip">
          {["Admisión", "Compresión", "Expansión", "Escape"].map((phase, i) => {
            const active = (i === 0 && state.cycleAngle >= 180 && state.cycleAngle < 360) ||
              (i === 1 && state.cycleAngle >= 540) || (i === 2 && state.cycleAngle < 180) ||
              (i === 3 && state.cycleAngle >= 360 && state.cycleAngle < 540);
            return <div key={phase} className={"cycle-step " + (active && controls.ignition ? "active" : "")}><span>0{i + 1}</span><b>{phase}</b></div>;
          })}
        </div>
      </div>

      <aside className="panel controls-panel">
        <div className="panel-header"><div className="panel-title"><span className="section-number">02 /</span><div><h2>Banco de pruebas</h2><p>PARÁMETROS DEL MOTOR</p></div></div></div>
        <div className="rpm-block">
          <div className="rpm-meta"><span>RÉGIMEN DEL MOTOR</span><span className="live-tag"><i /> LIVE</span></div>
          <div className="rpm-reading">{Math.round(state.rpm).toLocaleString("es-ES")}<small>RPM</small></div>
          <div className="rpm-track"><div style={{ width: Math.min(100, state.rpm / RPM_LIMIT * 100) + "%" }} /></div>
          <div className="scale-labels"><span>0</span><span>{IDLE_SPEED.toLocaleString("es-ES")} ralentí</span><span>{RPM_LIMIT.toLocaleString("es-ES")}</span></div>
        </div>

        <div className="control-group">
          <div className="control-heading"><label htmlFor="throttle">Acelerador</label><strong>{Math.round(controls.throttle * 100)}<small>%</small></strong></div>
          <input id="throttle" className="range throttle" type="range" min="0" max="1" step="0.01" value={controls.throttle} onChange={(e) => patchControls({ throttle: Number(e.target.value) })} style={{ "--range-progress": (controls.throttle * 100) + "%" } as CSSProperties} />
          <div className="range-captions"><span>CERRADO</span><span>PLENA CARGA</span></div>
        </div>
        <div className="control-group load-group">
          <div className="control-heading"><label htmlFor="load">Carga del motor</label><strong>{Math.round(controls.load * 100)}<small>%</small></strong></div>
          <input id="load" className="range load" type="range" min="0" max="1" step="0.01" value={controls.load} onChange={(e) => patchControls({ load: Number(e.target.value) })} style={{ "--range-progress": (controls.load * 100) + "%" } as CSSProperties} />
          <div className="range-captions"><span>SIN CARGA</span><span>ALTA CARGA</span></div>
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
          <span><strong>{!soundActive ? "Activar sonido del motor" : muted ? "Reanudar sonido" : "Silenciar motor"}</strong><small>Combustión · escape · resonancia</small></span><AudioLines className="sound-wave" size={20} />
        </button>
        {soundError && <p className="error-message">{soundError}</p>}
        <p className="audio-note"><Waves size={13} /> El audio se genera en tiempo real. Usa auriculares para apreciar mejor las capas de sonido.</p>
      </aside>
    </section>

    <section className="metrics-section">
      <div className="metrics-heading"><div><span className="section-number">03 /</span><h2>Telemetría</h2></div><span>VALORES SIMULADOS</span></div>
      <div className="metrics-grid">
        <Metric label="Potencia estimada" value={state.power.toFixed(1)} unit="kW" icon={Activity} accent="orange" />
        <Metric label="Par estimado" value={state.torque.toFixed(1)} unit="Nm" icon={RotateCcw} accent="blue" />
        <Metric label="Temperatura virtual" value={Math.round(state.temperature).toString()} unit="°C" icon={Flame} />
        <Metric label="Apertura de mariposa" value={Math.round(state.throttle * 100).toString()} unit="%" icon={ChevronDown} />
      </div>
    </section>

    <footer className="footer">
      <div className="footer-brand"><Gauge size={16} /> MOTOR<span>SIM</span></div>
      <span>PROTOTIPO INTERACTIVO · MODELO FÍSICO SIMPLIFICADO</span><span>HECHO PARA EXPLORAR.</span>
    </footer>
  </main>;
}