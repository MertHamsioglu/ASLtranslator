/**
 * OWNER: Mert
 *
 * Turn a downloaded dataset into a capture file, at /import.html.
 *
 * Two inputs:
 *   - a folder of images (one subfolder per class, the usual Kaggle layout)
 *   - a CSV of RAW landmark coordinates
 *
 * Either way the landmarks go through the same normalizeLandmarks() the live
 * recognizer uses, and the output is the same JSON /train.html already eats.
 *
 * Why this can work at all: you are not training on pixels. Skin tone,
 * lighting, background and camera — the things that stop an image model
 * transferring between people — are gone by the time MediaPipe has produced 21
 * points and normalize has removed position and scale. What is left is hand
 * proportion, which varies far less. Someone else's landmarks have a real
 * chance on your hand.
 *
 * What it cannot give you is NONE. See synthesizeNone in lib/importer.js.
 */

import { useCallback, useRef, useState } from "react";
import { CLASSES } from "../lib/contract";
import { createImageLandmarker } from "../lib/handTracker";
import { normalizeLandmarks } from "../lib/normalize";
import {
  capPerClass,
  labelFromPath,
  looksPreNormalized,
  parseLandmarkCsv,
  synthesizeNone,
  tally,
} from "../lib/importer";

const DEFAULT_CAP = 300;
const FEATURE_PRECISION = 5;
const round = (f) => f.map((v) => Number(v.toFixed(FEATURE_PRECISION)));

/**
 * Draw the image centred inside a larger canvas, with the background filled by
 * a blurred, stretched copy of itself.
 *
 * MediaPipe's palm detector wants margin around the hand. Public datasets are
 * usually cropped tight — the Kaggle asl-alphabet set is 200x200 with the hand
 * filling the frame — and on those it simply fails. Measured on that dataset,
 * 20 images per letter across all 24 classes:
 *
 *   raw only                 53.7%   with C, D, M, V and X at ZERO
 *   1.8x padded only         80.4%   but now A, B and E collapse instead
 *   raw, then 1.8x, then 1.3x  89.2%
 *
 * Padding moves the failures rather than removing them — closed handshapes
 * want the tight crop, open ones want the margin — which is why this is a
 * cascade and not a single transform. A flat colour background scored far
 * worse than a blurred copy (39.6% vs 49.0% on the hardest eight classes),
 * presumably because a hard rectangular edge reads as a competing object.
 */
function padded(bitmap, scale, blurPx = 8) {
  const size = Math.round(bitmap.width * scale);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, size, size);
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  const offset = Math.round((size - bitmap.width) / 2);
  ctx.drawImage(bitmap, offset, offset);
  return canvas;
}

/** Tight crop first — it is both the cheapest and the best for closed shapes. */
const CASCADE = [
  { name: "raw", render: (b) => b },
  { name: "pad1.8", render: (b) => padded(b, 1.8) },
  { name: "pad1.3", render: (b) => padded(b, 1.3) },
];

export default function ImportPage() {
  const [importedBy, setImportedBy] = useState("kaggle");
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [noneCount, setNoneCount] = useState(400);
  const [samples, setSamples] = useState([]);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  const runImages = useCallback(
    async (fileList) => {
      setError(null);
      setReport(null);
      setBusy(true);
      cancelled.current = false;

      const files = [...fileList];
      // Decide the label before doing any expensive work, and drop everything
      // we don't model (J, Z, nothing, space, del) up front.
      const planned = files
        .map((f) => ({ file: f, label: labelFromPath(f.webkitRelativePath || f.name) }))
        .filter((p) => p.label);

      // Cap by class before decoding, not after — otherwise you pay MediaPipe
      // for 87,000 images to keep 7,500 of them.
      const seen = {};
      const queue = [];
      for (const p of planned) {
        seen[p.label] = (seen[p.label] ?? 0) + 1;
        if (!cap || seen[p.label] <= cap) queue.push(p);
      }

      let landmarker;
      try {
        landmarker = await createImageLandmarker();
      } catch (err) {
        setError(`could not start MediaPipe: ${err.message}`);
        setBusy(false);
        return;
      }

      const rows = [];
      const resolvedBy = Object.fromEntries(CASCADE.map((s) => [s.name, 0]));
      let noHand = 0;
      let failed = 0;

      try {
        for (let i = 0; i < queue.length; i++) {
          if (cancelled.current) break;
          const { file, label } = queue[i];

          try {
            const bitmap = await createImageBitmap(file);
            let found = null;
            for (const stage of CASCADE) {
              found = landmarker.detect(stage.render(bitmap));
              if (found) {
                resolvedBy[stage.name]++;
                break;
              }
            }
            bitmap.close();
            if (!found) {
              noHand++;
            } else {
              rows.push({
                label,
                features: round(normalizeLandmarks(found.landmarks, found.handedness)),
              });
            }
          } catch {
            failed++;
          }

          // Yield often enough that the page stays responsive and the cancel
          // button works, but not so often that decoding dominates.
          if (i % 25 === 0) {
            setProgress({ done: i + 1, total: queue.length, kept: rows.length });
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      } finally {
        landmarker.close();
      }

      setProgress(null);
      setBusy(false);
      setSamples(rows);
      setReport({
        kind: "images",
        delegate: landmarker.delegate,
        offered: files.length,
        skippedByLabel: files.length - planned.length,
        cappedOut: planned.length - queue.length,
        attempted: queue.length,
        noHand,
        failed,
        kept: rows.length,
        detectionRate: queue.length ? rows.length / queue.length : 0,
        resolvedBy,
        cancelled: cancelled.current,
      });
    },
    [cap],
  );

  const runCsv = useCallback(
    async (file) => {
      setError(null);
      setReport(null);
      setBusy(true);
      try {
        const { rows, skipped, dims } = parseLandmarkCsv(await file.text());
        if (looksPreNormalized(rows)) {
          throw new Error(
            "this CSV looks already normalized — the wrist sits at the origin. " +
              "Its centering and scaling rule is probably not ours, and mixing the two " +
              "trains fine and fails on camera. Use a raw-landmark or image dataset.",
          );
        }
        const kept = capPerClass(
          rows.map((r) => ({
            label: r.label,
            features: round(normalizeLandmarks(r.landmarks, null)),
          })),
          cap,
        );
        setSamples(kept);
        setReport({
          kind: "csv",
          dims,
          offered: rows.length + skipped.length,
          skippedRows: skipped.length,
          kept: kept.length,
          firstSkips: skipped.slice(0, 5),
        });
      } catch (err) {
        setError(err.message);
        setSamples([]);
      } finally {
        setBusy(false);
      }
    },
    [cap],
  );

  const addNone = useCallback(() => {
    try {
      setSamples((prev) => [...prev, ...synthesizeNone(prev, Number(noneCount))]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [noneCount]);

  const download = useCallback(() => {
    const payload = { version: 1, recordedBy: importedBy || "imported", samples };
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.recordedBy}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [importedBy, samples]);

  const counts = tally(samples);
  const missing = CLASSES.filter((c) => counts[c] === 0);
  const hasNone = counts.NONE > 0;

  return (
    <main className="phase0">
      <h1>import</h1>
      <p className="meta">
        Convert a downloaded dataset into a capture file. Landmarks go through the
        same normalization the live recognizer uses.
      </p>
      {error && <p className="meta error">{error}</p>}

      <div className="row">
        <label>
          name{" "}
          <input value={importedBy} onChange={(e) => setImportedBy(e.target.value)} />
        </label>
        <label>
          max per class{" "}
          <input
            type="number"
            value={cap}
            min={0}
            step={50}
            disabled={busy}
            onChange={(e) => setCap(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="row">
        <label>
          image folder{" "}
          <input
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            disabled={busy}
            onChange={(e) => e.target.files.length && runImages(e.target.files)}
          />
        </label>
      </div>
      <div className="row">
        <label>
          or raw-landmark CSV{" "}
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => e.target.files[0] && runCsv(e.target.files[0])}
          />
        </label>
        {busy && (
          <button onClick={() => (cancelled.current = true)}>Cancel</button>
        )}
      </div>

      {progress && (
        <p className="meta">
          {progress.done} / {progress.total} images · {progress.kept} hands found
        </p>
      )}

      {report && (
        <>
          <h2>Import report</h2>
          <table className="counts">
            <tbody>
              {report.kind === "images" ? (
                <>
                  <tr><td>files offered</td><td>{report.offered}</td></tr>
                  <tr><td>skipped by label (J, Z, nothing, space, del)</td><td>{report.skippedByLabel}</td></tr>
                  <tr><td>dropped by per-class cap</td><td>{report.cappedOut}</td></tr>
                  <tr><td>run through MediaPipe</td><td>{report.attempted}</td></tr>
                  <tr>
                    <td>found on the tight crop / 1.8x pad / 1.3x pad</td>
                    <td>
                      {report.resolvedBy.raw} / {report.resolvedBy["pad1.8"]} /{" "}
                      {report.resolvedBy["pad1.3"]}
                    </td>
                  </tr>
                  <tr><td>no hand at any padding</td><td>{report.noHand}</td></tr>
                  <tr><td>failed to decode</td><td>{report.failed}</td></tr>
                  <tr><td>rows kept</td><td>{report.kept}</td></tr>
                  <tr>
                    <td>detection rate</td>
                    <td>{(report.detectionRate * 100).toFixed(1)}%</td>
                  </tr>
                  {report.cancelled && <tr><td colSpan={2}>cancelled early</td></tr>}
                </>
              ) : (
                <>
                  <tr><td>coordinate dimensions</td><td>{report.dims}D</td></tr>
                  <tr><td>rows offered</td><td>{report.offered}</td></tr>
                  <tr><td>rows skipped</td><td>{report.skippedRows}</td></tr>
                  <tr><td>rows kept</td><td>{report.kept}</td></tr>
                </>
              )}
            </tbody>
          </table>
          {report.kind === "images" && report.detectionRate < 0.7 && report.attempted > 0 && (
            <p className="meta error">
              Detection rate under 70%. On the Kaggle asl-alphabet set the cascade
              reaches ~89%, so well below that usually means the images already have
              landmarks or a skeleton drawn on them — MediaPipe cannot find a hand
              under its own annotation — or the folder layout is not what
              labelFromPath expects. Check the per-class counts below before training.
            </p>
          )}
          {report.firstSkips?.length > 0 && (
            <p className="meta">
              first skips: {report.firstSkips.map((s) => `line ${s.line} (${s.why})`).join(", ")}
            </p>
          )}
        </>
      )}

      {samples.length > 0 && (
        <>
          <h2>NONE</h2>
          {hasNone ? (
            <p className="meta">{counts.NONE} NONE rows present.</p>
          ) : (
            <p className="meta error">
              No NONE rows. No image dataset can provide them — its “nothing” class is
              empty background, which yields no hand and therefore no row, while NONE
              means a hand IS visible and is not a letter. Without it the app spells
              confidently and continuously while your hand moves between letters.
            </p>
          )}
          <div className="row">
            <label>
              synthesize{" "}
              <input
                type="number"
                value={noneCount}
                min={0}
                step={50}
                onChange={(e) => setNoneCount(Number(e.target.value))}
              />
            </label>
            <button onClick={addNone} disabled={busy}>
              Blend NONE from letter pairs
            </button>
          </div>
          <p className="meta">
            Blends pairs of letter rows at 25–75%, which is geometrically a pose partway
            between two handshapes — what a mid-transition hand is. An approximation:
            recording your own NONE is better, this is far better than none.
          </p>

          <h2>Per class</h2>
          <p className="meta">
            {samples.length} rows · {CLASSES.length - missing.length}/{CLASSES.length} classes
            {missing.length > 0 && ` · missing: ${missing.join(", ")}`}
          </p>
          <table className="counts">
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c} className={counts[c] ? "" : "missing"}>
                  <td>{c}</td>
                  <td>{counts[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row">
            <button onClick={download}>Download JSON</button>
            <button onClick={() => { setSamples([]); setReport(null); }} disabled={busy}>
              Discard
            </button>
          </div>
        </>
      )}
    </main>
  );
}
