/**
 * OWNER: Aaron — A5
 *
 * Skeleton overlay. Landmarks stay raw/unmirrored (contract rule 2);
 * we flip x here so it lines up with the CSS-mirrored video.
 */

import { useEffect, useRef } from "react";
import { HAND_CONNECTIONS } from "../lib/contract";
import type { Landmark } from "../types";

type HandOverlayProps = {
  landmarks: Landmark[] | null;
};

export default function HandOverlay({ landmarks }: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const host = parent;

    function paint() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = host.clientWidth;
      const cssH = host.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!landmarks || landmarks.length === 0) return;

      const x = (p: Landmark) => (1 - p.x) * w;
      const y = (p: Landmark) => p.y * h;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(186, 230, 253, 0.92)";
      ctx.lineWidth = Math.max(2, w / 280);

      for (const [a, b] of HAND_CONNECTIONS as [number, number][]) {
        const pa = landmarks[a];
        const pb = landmarks[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(x(pa), y(pa));
        ctx.lineTo(x(pb), y(pb));
        ctx.stroke();
      }

      for (const point of landmarks) {
        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.arc(x(point), y(point), Math.max(3, w / 180), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(host);
    return () => ro.disconnect();
  }, [landmarks]);

  return <canvas ref={canvasRef} className="overlay" aria-hidden="true" />;
}
