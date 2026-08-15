/**
 * OWNER: Mert — M4
 *
 * Training tool, at /train.html. Load one or more data/*.json captures, check
 * the per-class counts, fit, inspect the confusions, save.
 *
 * Watch VALIDATION accuracy, not training accuracy. Realistic band for one
 * person's data is 0.90-0.96. If val_acc hits 0.99 on the first try, be
 * suspicious rather than pleased — it almost always means the capture was done
 * holding still, and the model has memorized one exact hand position.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { CLASSES } from "../lib/contract";
import {
  DEFAULT_EPOCHS,
  confusionMatrix,
  findWeakClasses,
  holdOut,
  mergeDatasets,
  topConfusions,
  trainModel,
} from "../lib/train";
import AccuracyChart from "../components-mert/AccuracyChart";

export default function TrainPage() {
  // Loaded files are kept individually rather than merged on arrival, so a bad
  // capture can be excluded and the model retrained without reloading the rest.
  // Toggling is non-destructive — an excluded file stays in the list, because
  // "was it better with or without Aaron's set?" is a question you ask twice.
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [training, setTraining] = useState(false);
  const [confusions, setConfusions] = useState(null);
  const modelRef = useRef(null);

  const loadFiles = useCallback(async (fileList) => {
    setError(null);
    setConfusions(null);
    setHistory([]);
    try {
      const loaded = await Promise.all(
        [...fileList].map(async (f) => {
          const parsed = JSON.parse(await f.text());
          // Validate each file on its own so a bad one names itself, instead of
          // failing the whole merge with no clue which file was at fault.
          const { xs, counts } = mergeDatasets([parsed]);
          return {
            name: f.name,
            recordedBy: parsed.recordedBy ?? "unknown",
            samples: parsed.samples,
            rows: xs.length,
            counts,
            enabled: true,
          };
        }),
      );
      // Append rather than replace, so files can be added one at a time.
      // Re-loading the same filename replaces that entry.
      setFiles((prev) => [
        ...prev.filter((p) => !loaded.some((l) => l.name === p.name)),
        ...loaded,
      ]);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const toggleFile = useCallback((name) => {
    setFiles((prev) =>
      prev.map((f) => (f.name === name ? { ...f, enabled: !f.enabled } : f)),
    );
  }, []);

  const removeFile = useCallback((name) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const active = files.filter((f) => f.enabled);

  // Recomputed whenever a file is toggled, so the counts table and the weak
  // class warning always describe what would actually be trained.
  const dataset = useMemo(() => {
    if (active.length === 0) return null;
    try {
      return mergeDatasets(
        active.map((f) => ({ version: 1, recordedBy: f.recordedBy, samples: f.samples })),
      );
    } catch {
      return null;
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async () => {
    if (!dataset) return;
    setTraining(true);
    setHistory([]);
    setConfusions(null);
    try {
      const { model, shuffled } = await trainModel({
        xs: dataset.xs,
        ys: dataset.ys,
        epochs: DEFAULT_EPOCHS,
        onEpochEnd: (entry) => setHistory((h) => [...h, entry]),
      });
      modelRef.current = model;

      // Score on the same rows fit() held out, not on the training data.
      const { testXs, testYs } = holdOut(shuffled.xs, shuffled.ys);
      setConfusions(topConfusions(confusionMatrix(model, testXs, testYs)));
    } catch (err) {
      setError(err.message);
    } finally {
      setTraining(false);
    }
  }, [dataset]);

  const save = useCallback(async () => {
    if (!modelRef.current) return;
    await modelRef.current.save("downloads://asl-model");
  }, []);

  const last = history.at(-1);
  const weak = dataset ? findWeakClasses(dataset.counts) : [];

  return (
    <main className="phase0">
      <h1>train</h1>

      <div className="row">
        <input
          type="file"
          accept="application/json"
          multiple
          onChange={(e) => loadFiles(e.target.files)}
        />
        <button onClick={run} disabled={!dataset || training}>
          {training ? "Training…" : `Train ${DEFAULT_EPOCHS} epochs`}
        </button>
        <button onClick={save} disabled={!modelRef.current || training}>
          Save model
        </button>
      </div>

      {error && <p className="meta error">{error}</p>}

      {files.length > 0 && (
        <>
          <h2>Datasets</h2>
          <p className="meta">
            Untick a file to leave it out of the merge — counts and training
            update immediately. Nothing is deleted from disk.
          </p>
          <table className="counts">
            <thead>
              <tr>
                <th>use</th>
                <th>file</th>
                <th>recorded by</th>
                <th>rows</th>
                <th>classes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name} className={f.enabled ? "" : "missing"}>
                  <td>
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      disabled={training}
                      onChange={() => toggleFile(f.name)}
                      aria-label={`Include ${f.name}`}
                    />
                  </td>
                  <td>{f.name}</td>
                  <td>{f.recordedBy}</td>
                  <td>{f.rows}</td>
                  <td>{CLASSES.filter((c) => f.counts[c] > 0).length}/{CLASSES.length}</td>
                  <td>
                    <button onClick={() => removeFile(f.name)} disabled={training}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {files.length > 0 && active.length === 0 && (
        <p className="meta error">Every dataset is excluded — nothing to train on.</p>
      )}

      {dataset && (
        <>
          <p className="meta">
            {dataset.xs.length} samples ·{" "}
            {Object.entries(dataset.byRecorder)
              .map(([who, n]) => `${who}: ${n}`)
              .join(" · ")}
          </p>
          {weak.length > 0 && (
            <p className="meta error">
              thin classes (likely an interrupted capture run):{" "}
              {weak.map((w) => `${w.label}=${w.count}`).join(", ")}
            </p>
          )}
          <table className="counts">
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c} className={dataset.counts[c] ? "" : "missing"}>
                  <td>{c}</td>
                  <td>{dataset.counts[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {history.length > 0 && (
        <>
          <p className="meta">
            epoch {last.epoch}/{DEFAULT_EPOCHS} · acc {last.acc?.toFixed(3)} · val_acc{" "}
            {last.valAcc?.toFixed(3)}
            {last.valAcc > 0.98 && " — suspiciously high, did you hold still while recording?"}
          </p>
          <AccuracyChart history={history} />
        </>
      )}

      {confusions && (
        <>
          <h2>Worst confusions</h2>
          {confusions.length === 0 ? (
            <p className="meta">none on the held-out set</p>
          ) : (
            <table className="counts">
              <tbody>
                {confusions.map((c) => (
                  <tr key={`${c.actual}-${c.predicted}`}>
                    <td>
                      {c.actual} → {c.predicted}
                    </td>
                    <td>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="meta">
            Record more of whatever tops this list. M/N/S/T are the expected offenders.
          </p>
        </>
      )}

      {files.length === 0 && !error && (
        <p className="meta">Load one or more data/*.json captures to begin.</p>
      )}
    </main>
  );
}
