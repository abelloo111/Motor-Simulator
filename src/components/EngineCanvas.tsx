import { useEffect, useRef } from "react";
import type { EngineState } from "../simulation/engine";

type Props = { state: EngineState };

export default function EngineCanvas({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  latest.current = state;

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
    observer.observe(canvas); resize();

    const roundRect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.lineWidth = 1.25; ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    const draw = () => {
      const s = latest.current, w = canvas.clientWidth, h = canvas.clientHeight;
      const scale = Math.min(w / 620, h / 355);
      ctx.clearRect(0, 0, w, h); ctx.save();
      ctx.translate((w - 620 * scale) / 2, (h - 355 * scale) / 2); ctx.scale(scale, scale);

      ctx.strokeStyle = "rgba(148,163,184,0.075)"; ctx.lineWidth = 1;
      for (let x = 0; x <= 620; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 355); ctx.stroke(); }
      for (let y = 0; y <= 355; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(620, y); ctx.stroke(); }

      const x = 222, top = 45, boreW = 126, boreH = 174;
      const angle = s.cycleAngle * Math.PI / 180;
      const crankX = x + boreW / 2, crankY = 281, crankR = 42;
      const pinX = crankX + Math.sin(angle) * crankR, pinY = crankY - Math.cos(angle) * crankR;
      const pistonY = Math.max(top + 93, Math.min(top + 154, top + 93 + (1 - Math.cos(angle)) * 30.5));
      const rodAngle = Math.atan2(pinY - (pistonY + 34), pinX - crankX);

      ctx.lineWidth = 13; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(56,189,248,0.55)";
      ctx.beginPath(); ctx.moveTo(x - 55, top + 24); ctx.lineTo(x + 3, top + 24); ctx.lineTo(x + 21, top + 42); ctx.stroke();
      ctx.strokeStyle = "rgba(251,146,60,0.55)";
      ctx.beginPath(); ctx.moveTo(x + boreW - 3, top + 24); ctx.lineTo(x + boreW + 42, top + 24); ctx.lineTo(x + boreW + 64, top + 7); ctx.stroke();

      roundRect(x - 25, top - 9, boreW + 50, 196, 15, "#252e38", "#586575");
      roundRect(x - 10, top + 4, boreW + 20, boreH, 7, "#111923", "#8996a5");
      roundRect(x + 1, top + 8, boreW - 2, boreH - 2, 4, "#19232d", "#364454");
      const firing = s.ignition && s.throttle > 0.04 && s.cycleAngle < 180;
      if (firing) {
        const glow = ctx.createRadialGradient(crankX, top + 29, 2, crankX, top + 29, 72);
        glow.addColorStop(0, "rgba(255,171,74,0.58)"); glow.addColorStop(1, "rgba(245,95,40,0)");
        ctx.fillStyle = glow; ctx.fillRect(x + 5, top + 5, boreW - 10, 85);
      }
      roundRect(x - 19, top - 24, boreW + 38, 24, 5, "#424f5f", "#7f8c9b");
      const valves: [number, string, boolean][] = [
        [x + 28, "#38bdf8", s.cycleAngle > 175 && s.cycleAngle < 355],
        [x + boreW - 28, "#fb923c", s.cycleAngle > 360 && s.cycleAngle < 540],
      ];
      for (const [vx, color, open] of valves) {
        ctx.strokeStyle = "#97a3b3"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(vx, top - 20); ctx.lineTo(vx, top + (open ? 13 : 2)); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(vx, top + (open ? 14 : 3), 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      roundRect(crankX - 8, top - 37, 16, 17, 3, "#cbd5e1", "#f8fafc");
      ctx.strokeStyle = firing ? "#facc15" : "#94a3b8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(crankX, top - 20); ctx.lineTo(crankX, top + 3); ctx.stroke();
      if (firing) {
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(crankX - 3, top + 5); ctx.lineTo(crankX + 3, top + 12); ctx.lineTo(crankX - 2, top + 16); ctx.lineTo(crankX + 3, top + 22); ctx.stroke();
      }

      const pistonX = x + 8;
      roundRect(pistonX, pistonY, boreW - 16, 43, 5, "#aab5c1", "#e2e8f0");
      ctx.fillStyle = "#dce3e9"; ctx.fillRect(pistonX + 4, pistonY + 3, boreW - 24, 4);
      ctx.fillStyle = "#4b5969"; ctx.fillRect(pistonX + 3, pistonY + 9, boreW - 22, 2); ctx.fillRect(pistonX + 3, pistonY + 15, boreW - 22, 2);
      ctx.fillStyle = "#7c8999"; ctx.fillRect(pistonX + 12, pistonY + 26, boreW - 40, 8);

      ctx.save(); ctx.translate(crankX, pistonY + 34); ctx.rotate(rodAngle);
      const rod = ctx.createLinearGradient(-8, 0, 8, 0);
      rod.addColorStop(0, "#667586"); rod.addColorStop(0.5, "#c3cdd7"); rod.addColorStop(1, "#566575");
      roundRect(-7, -4, 14, 91, 4, rod, "#d7e0e9"); ctx.restore();

      ctx.strokeStyle = "#657587"; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(crankX - 78, crankY + 8); ctx.lineTo(crankX + 77, crankY + 8); ctx.stroke();
      ctx.fillStyle = "#384656"; ctx.beginPath(); ctx.ellipse(crankX, crankY, 57, 40, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8594a4"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#758596"; ctx.beginPath(); ctx.moveTo(crankX, crankY); ctx.lineTo(pinX + Math.cos(angle) * 27, pinY + Math.sin(angle) * 22);
      ctx.arc(crankX, crankY, 32, -Math.PI / 2 + angle, Math.PI / 2 + angle); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b4c0cb"; ctx.beginPath(); ctx.arc(pinX, pinY, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#455364"; ctx.beginPath(); ctx.arc(pinX, pinY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b5c0cb"; ctx.beginPath(); ctx.arc(crankX, crankY, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#455364"; ctx.beginPath(); ctx.arc(crankX, crankY, 6, 0, Math.PI * 2); ctx.fill();

      const label = (text: string, lx: number, ly: number, color = "#9eacbc") => {
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace"; ctx.fillStyle = color; ctx.fillText(text, lx, ly);
      };
      ctx.strokeStyle = "rgba(148,163,184,0.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 64, top + 34); ctx.lineTo(x - 26, top + 34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + boreW + 20, top + 34); ctx.lineTo(x + boreW + 59, top + 34); ctx.stroke();
      label("ADMISIÓN", x - 92, top + 27, "#38bdf8"); label("ESCAPE", x + boreW + 22, top);
      label("BUJÍA", crankX + 15, top - 28); label("PISTÓN", x + boreW + 24, pistonY + 22);
      ctx.beginPath(); ctx.moveTo(x + boreW - 4, pistonY + 19); ctx.lineTo(x + boreW + 17, pistonY + 19); ctx.stroke();
      label("BIELA", crankX + 73, pistonY + 57); ctx.beginPath(); ctx.moveTo(crankX + 38, pistonY + 62); ctx.lineTo(crankX + 67, pistonY + 62); ctx.stroke();
      label("CIGÜEÑAL", x - 82, crankY + 39);
      roundRect(24, 285, 128, 43, 7, "rgba(17,25,35,0.92)", "#354253");
      label("CICLO 720°", 36, 301); ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 15px ui-monospace, monospace";
      ctx.fillText(Math.round(s.cycleAngle).toString().padStart(3, "0") + "°", 36, 318);
      roundRect(468, 285, 128, 43, 7, "rgba(17,25,35,0.92)", "#354253");
      label("GIRO / MIN", 480, 301); ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 15px ui-monospace, monospace";
      ctx.fillText(Math.round(s.rpm).toLocaleString("en-US"), 480, 318);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="engine-canvas" aria-label="Animación en corte de un motor monocilíndrico de cuatro tiempos" />;
}