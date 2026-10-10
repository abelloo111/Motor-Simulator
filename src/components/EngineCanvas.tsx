import { useEffect, useRef } from "react";
import type { EngineConfig, EngineState } from "../simulation/engine";
import { formatEngineLayout } from "../simulation/engine";

type Props = { state: EngineState; config: EngineConfig };

export default function EngineCanvas({ state, config }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, config });
  latest.current = { state, config };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const roundRect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 1.15;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };
    const label = (text: string, x: number, y: number, color = "#9eacbc", size = 9) => {
      ctx.font = size + "px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };

    const draw = () => {
      const { state: s, config: c } = latest.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const scale = Math.min(w / 620, h / 355);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate((w - 620 * scale) / 2, (h - 355 * scale) / 2);
      ctx.scale(scale, scale);

      ctx.strokeStyle = "rgba(148,163,184,0.075)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= 620; x += 26) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 355); ctx.stroke();
      }
      for (let y = 0; y <= 355; y += 26) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(620, y); ctx.stroke();
      }

      const count = Math.max(1, Math.min(12, c.cylinders));
      const areaLeft = 38, areaWidth = 544;
      const spacing = areaWidth / count;
      const cylinderW = Math.min(76, Math.max(27, spacing - 7));
      const cylinderTop = 49;
      const crankY = 268;
      const crankR = Math.max(16, Math.min(28, c.strokeMm / 3.6));
      const strokePx = Math.max(23, Math.min(52, c.strokeMm / 2.05));

      // Engine block / cylinder bank
      roundRect(24, 40, 572, 174, 10, "#202a35", "#4b5a6a");
      roundRect(31, 47, 558, 160, 7, "#151e28", "#394858");
      ctx.strokeStyle = "#677789";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(42, 216); ctx.lineTo(578, 216); ctx.stroke();

      const firingOrder = c.firingOrder.length ? c.firingOrder : Array.from({ length: count }, (_, i) => i + 1);
      const cylinderCenters: number[] = [];
      for (let i = 0; i < count; i++) {
        const cx = areaLeft + spacing * (i + 0.5);
        cylinderCenters.push(cx);
        const firingPosition = firingOrder.indexOf(i + 1);
        const phaseDegrees = (s.cycleAngle + Math.max(0, firingPosition) * (720 / count)) % 720;
        const angle = phaseDegrees * Math.PI / 180;
        const pistonY = cylinderTop + 26 + (1 - Math.cos(angle)) * (strokePx / 2);
        const pinX = cx + Math.sin(angle) * crankR;
        const pinY = crankY - Math.cos(angle) * crankR;
        const rodStartY = pistonY + 22;
        const firing = s.ignition && s.throttle > 0.04 && phaseDegrees < 180;

        // Inlet and exhaust passages
        ctx.lineWidth = Math.max(4, Math.min(10, cylinderW * 0.13));
        ctx.strokeStyle = "rgba(56,189,248,0.58)";
        ctx.beginPath(); ctx.moveTo(cx - cylinderW * 0.23, 29); ctx.lineTo(cx - cylinderW * 0.23, 45); ctx.stroke();
        ctx.strokeStyle = "rgba(251,146,60,0.58)";
        ctx.beginPath(); ctx.moveTo(cx + cylinderW * 0.23, 29); ctx.lineTo(cx + cylinderW * 0.23, 45); ctx.stroke();

        // Cylinder liner and animated combustion flash
        roundRect(cx - cylinderW / 2, cylinderTop, cylinderW, 126, 4, "#101720", "#738295");
        roundRect(cx - cylinderW / 2 + 4, cylinderTop + 3, cylinderW - 8, 120, 2, "#1c2732", "#303f4f");
        if (firing) {
          const glow = ctx.createRadialGradient(cx, cylinderTop + 15, 1, cx, cylinderTop + 15, Math.max(22, cylinderW * 0.8));
          glow.addColorStop(0, "rgba(255,171,74,0.56)");
          glow.addColorStop(1, "rgba(245,95,40,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(cx - cylinderW / 2 + 3, cylinderTop + 2, cylinderW - 6, 57);
        }

        // Piston, rings and pin
        roundRect(cx - cylinderW / 2 + 5, pistonY, cylinderW - 10, 23, 3, "#9eacba", "#e0e7ef");
        ctx.fillStyle = "#e0e7ef";
        ctx.fillRect(cx - cylinderW / 2 + 8, pistonY + 3, Math.max(2, cylinderW - 16), 2);
        ctx.fillStyle = "#4b5969";
        ctx.fillRect(cx - cylinderW / 2 + 7, pistonY + 8, Math.max(2, cylinderW - 14), 2);
        ctx.fillRect(cx - cylinderW / 2 + 7, pistonY + 13, Math.max(2, cylinderW - 14), 2);

        // Connecting rod to its crank throw
        ctx.strokeStyle = "#7e8d9d";
        ctx.lineWidth = Math.max(3, Math.min(7, cylinderW * 0.1));
        ctx.beginPath(); ctx.moveTo(cx, rodStartY); ctx.lineTo(pinX, pinY); ctx.stroke();
        ctx.strokeStyle = "#d3dce5";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 1, rodStartY); ctx.lineTo(pinX - 1, pinY); ctx.stroke();
        ctx.fillStyle = "#bac6d2";
        ctx.beginPath(); ctx.arc(cx, rodStartY, Math.max(3, cylinderW * 0.07), 0, Math.PI * 2); ctx.fill();

        // Simplified valve discs and a spark plug per cylinder
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath(); ctx.ellipse(cx - cylinderW * 0.22, cylinderTop + 4, Math.max(3, cylinderW * 0.12), 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fb923c";
        ctx.beginPath(); ctx.ellipse(cx + cylinderW * 0.22, cylinderTop + 4, Math.max(3, cylinderW * 0.12), 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = firing ? "#facc15" : "#9ba8b8";
        ctx.fillRect(cx - 1.4, cylinderTop - 9, 2.8, 12);
        if (count <= 6) label(String(i + 1).padStart(2, "0"), cx - 5, 34, firing ? "#ffc47d" : "#758598", 8);
      }

      // Shared crankshaft, counterweights and crank pins.
      ctx.strokeStyle = "#647487"; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(31, crankY); ctx.lineTo(589, crankY); ctx.stroke();
      ctx.strokeStyle = "#9aa8b7"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(31, crankY - 4); ctx.lineTo(589, crankY - 4); ctx.stroke();
      cylinderCenters.forEach((cx, i) => {
        const angle = (s.cycleAngle + i * (720 / count)) * Math.PI / 180;
        const pinX = cx + Math.sin(angle) * crankR;
        const pinY = crankY - Math.cos(angle) * crankR;
        ctx.fillStyle = "#3b4a5b";
        ctx.beginPath(); ctx.ellipse(cx, crankY, Math.max(8, cylinderW * 0.25), 20, angle * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#8595a7"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#c0cbd6";
        ctx.beginPath(); ctx.arc(pinX, pinY, Math.max(4, Math.min(7, cylinderW * 0.09)), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#455364";
        ctx.beginPath(); ctx.arc(pinX, pinY, 2.2, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = "#b5c0cb";
      ctx.beginPath(); ctx.arc(310, crankY, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#455364";
      ctx.beginPath(); ctx.arc(310, crankY, 5, 0, Math.PI * 2); ctx.fill();

      // Configuration and live readouts
      roundRect(24, 302, 180, 36, 6, "rgba(17,25,35,0.94)", "#354253");
      label("ARQUITECTURA", 36, 316, "#7e8b9d", 8);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillText(count + " CYL · " + formatEngineLayout(c.layout), 36, 331);
      roundRect(416, 302, 180, 36, 6, "rgba(17,25,35,0.94)", "#354253");
      label("GIRO / MIN", 428, 316, "#7e8b9d", 8);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillText(Math.round(s.rpm).toLocaleString("en-US") + " RPM", 428, 331);

      ctx.strokeStyle = "rgba(148,163,184,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(34, 236); ctx.lineTo(34, 249); ctx.lineTo(50, 249); ctx.stroke();
      label("BLOQUE / CAMISAS", 35, 231, "#8d9bab", 8);
      ctx.beginPath(); ctx.moveTo(530, 236); ctx.lineTo(530, 249); ctx.lineTo(564, 249); ctx.stroke();
      label("CIGÜEÑAL", 530, 231, "#8d9bab", 8);

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="engine-canvas" aria-label={"Esquema mecánico de " + config.cylinders + " cilindros, disposición " + formatEngineLayout(config.layout)} />;
}
