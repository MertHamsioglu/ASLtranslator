/**
 * OWNER: Aaron — A5
 *
 * Skeleton overlay. Landmarks stay raw/unmirrored (contract rule 2);
 * we flip x here so it lines up with the CSS-mirrored video.
 */

import { useEffect, useRef } from "react";
import { HAND_CONNECTIONS } from "../lib/contract";

export default function HandOverlay({ landmarks }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    function paint() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!landmarks || landmarks.length === 0) return;

      const x = (p) => (1 - p.x) * w;
      const y = (p) => p.y * h;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(186, 230, 253, 0.92)";
      ctx.lineWidth = Math.max(2, w / 280);

      for (const [a, b] of HAND_CONNECTIONS) {
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
    ro.observe(parent);
    return () => ro.disconnect();
  }, [landmarks]);

  return <canvas ref={canvasRef} className="overlay" aria-hidden="true" />;
}
