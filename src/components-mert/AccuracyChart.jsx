/**
 * OWNER: Mert — M4
 *
 * Training vs validation accuracy per epoch.
 *
 * Lives in components-mert/ rather than components/ — that directory is
 * Aaron's, and the ownership map has no shared folders in it.
 *
 * The only thing you're actually reading this chart for: whether the two lines
 * stay together. A widening gap is overfitting (more dropout, or more data). A
 * val line that shoots to ~1.0 in a handful of epochs means the captures are
 * near-duplicates of each other, not that the model is good.
 */

import { useState } from "react";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 64, bottom: 28, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const SERIES = [
  { key: "acc", label: "training", varName: "--series-1" },
  { key: "valAcc", label: "validation", varName: "--series-2" },
];

export default function AccuracyChart({ history }) {
  const [hover, setHover] = useState(null);
  if (history.length < 2) return null;

  const maxEpoch = history.at(-1).epoch;
  const x = (epoch) => PAD.left + ((epoch - 1) / Math.max(1, maxEpoch - 1)) * PLOT_W;
  const y = (value) => PAD.top + (1 - value) * PLOT_H;

  const path = (key) =>
    history
      .filter((d) => Number.isFinite(d[key]))
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.epoch).toFixed(1)},${y(d[key]).toFixed(1)}`)
      .join(" ");

  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const ratio = (px - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (history.length - 1));
    setHover(history[Math.min(history.length - 1, Math.max(0, index))] ?? null);
  }

  const last = history.at(-1);

  return (
    <figure className="viz-root">
      <div className="viz-legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: `var(${s.varName})` }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Training and validation accuracy over ${maxEpoch} epochs`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(v)} y2={y(v)} />
            <text className="tick" x={PAD.left - 8} y={y(v)} textAnchor="end" dy="0.32em">
              {v.toFixed(2)}
            </text>
          </g>
        ))}

        <text className="tick" x={PAD.left} y={H - 8}>
          1
        </text>
        <text className="tick" x={PAD.left + PLOT_W} y={H - 8} textAnchor="end">
          {maxEpoch}
        </text>

        {SERIES.map((s) => (
          <path key={s.key} className="line" style={{ stroke: `var(${s.varName})` }} d={path(s.key)} />
        ))}

        {/* Direct labels — identity without relying on the legend alone. */}
        {SERIES.map(
          (s) =>
            Number.isFinite(last[s.key]) && (
              <text
                key={s.key}
                className="direct-label"
                x={PAD.left + PLOT_W + 8}
                y={y(last[s.key])}
                dy="0.32em"
              >
                {last[s.key].toFixed(3)}
              </text>
            ),
        )}

        {hover && (
          <g>
            <line
              className="crosshair"
              x1={x(hover.epoch)}
              x2={x(hover.epoch)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
            />
            {SERIES.map(
              (s) =>
                Number.isFinite(hover[s.key]) && (
                  <circle
                    key={s.key}
                    cx={x(hover.epoch)}
                    cy={y(hover[s.key])}
                    r="5"
                    style={{ fill: `var(${s.varName})` }}
                    className="dot"
                  />
                ),
            )}
          </g>
        )}
      </svg>

      <figcaption className="viz-caption">
        {hover
          ? `epoch ${hover.epoch} · training ${hover.acc?.toFixed(3)} · validation ${hover.valAcc?.toFixed(3)}`
          : "Hover for per-epoch values. Watch the gap between the two lines, not the height of either."}
      </figcaption>

      <details>
        <summary className="viz-caption">Table view</summary>
        <table className="counts">
          <thead>
            <tr>
              <th>epoch</th>
              <th>training</th>
              <th>validation</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d.epoch}>
                <td>{d.epoch}</td>
                <td>{d.acc?.toFixed(4)}</td>
                <td>{d.valAcc?.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
