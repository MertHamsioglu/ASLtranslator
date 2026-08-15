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

import { useCallback, useRef, useState } from "react";
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
  const [dataset, setDataset] = useState(null);
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
      const files = await Promise.all(
        [...fileList].map(async (f) => JSON.parse(await f.text())),
      );
      setDataset(mergeDatasets(files));
    } catch (err) {
      setDataset(null);
      setError(err.message);
    }
  }, []);

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

      {dataset === null && !error && (
        <p className="meta">Load one or more data/*.json captures to begin.</p>
      )}
    </main>
  );
}
