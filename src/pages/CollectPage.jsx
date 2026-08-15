/**
 * OWNER: Mert — M3
 *
 * Data capture tool, at /collect.html. Function only — Aaron is not looking at
 * this page and no styling effort belongs here.
 *
 * Output format (frozen in Phase 0, read by train.js#mergeDatasets):
 *
 *   { version: 1, recordedBy: "mert", samples: [{ label, features[63] }] }
 *
 * Samples are held as RUNS rather than one flat list, so a fumbled capture can
 * be thrown away without losing the session. A run is one press of Record: one
 * class, one continuous take. That's the unit you actually regret, so that's
 * the unit you can delete.
 *
 * HOW TO RECORD, which matters more than anything in this file:
 * rotate and shift your hand slowly through the whole capture. Tilt forward and
 * back, rotate ~20 degrees each way, move nearer and farther, drift around the
 * frame. Holding still gives you 200 near-identical rows, a val_acc of 0.99,
 * and a model that collapses the moment someone holds their hand differently.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLASSES, NONE_LABEL } from "../lib/contract";
import { createHandTracker } from "../lib/handTracker";
import { normalizeLandmarks } from "../lib/normalize";

const COUNTDOWN_SECONDS = 3;
const DEFAULT_TARGET = 200;
/** NONE has to cover far more variety than any single letter, so record more. */
const NONE_TARGET = 400;

export default function CollectPage() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("starting");
  const [handPresent, setHandPresent] = useState(false);
  const [handedness, setHandedness] = useState(null);

  const [recordedBy, setRecordedBy] = useState(
    () => localStorage.getItem("asl.recordedBy") ?? "",
  );
  const [label, setLabel] = useState(CLASSES[0]);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [countdown, setCountdown] = useState(null);
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState(null);

  // The rAF callback must not close over stale state, so anything it reads
  // lives in a ref. `capture.current === null` means "not recording".
  const capture = useRef(null);
  const countdownTimer = useRef(null);
  const nextRunId = useRef(1);

  useEffect(() => {
    localStorage.setItem("asl.recordedBy", recordedBy);
  }, [recordedBy]);

  useEffect(() => {
    setTarget(label === NONE_LABEL ? NONE_TARGET : DEFAULT_TARGET);
  }, [label]);

  // Nothing here is persisted. Losing a 30-minute session to a stray Cmd-R is
  // a worse outcome than a confirm dialog.
  useEffect(() => {
    if (runs.length === 0) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [runs.length]);

  useEffect(() => {
    let cancelled = false;
    let tracker = null;
    let stream = null;
    const video = videoRef.current;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        if (!cancelled) setError(`camera: ${err.name} — ${err.message}`);
        return;
      }

      try {
        tracker = await createHandTracker({ onFrame: handleFrame });
      } catch (err) {
        if (!cancelled) setError(`hand tracker: ${err.message}`);
        return;
      }
      if (cancelled) {
        tracker.stop();
        return;
      }

      tracker.attach(video);
      setStatus(`running (${tracker.delegate})`);
    }

    function handleFrame({ landmarks, handedness: hand }) {
      setHandPresent(Boolean(landmarks));
      setHandedness(hand);

      const session = capture.current;
      if (!session || !landmarks) return;

      // Skip frames with no hand rather than counting them — otherwise a
      // fumbled start gives you 40 real samples and 160 nothings.
      let features;
      try {
        features = normalizeLandmarks(landmarks, hand);
      } catch (err) {
        console.warn("skipped a frame:", err.message);
        return;
      }

      session.rows.push({ label: session.label, features });
      setCaptured(session.rows.length);

      if (session.rows.length >= session.target) {
        capture.current = null;
        setRecording(false);
        setCaptured(0);
        setRuns((prev) => [
          ...prev,
          { id: nextRunId.current++, label: session.label, rows: session.rows },
        ]);
        setStatus(`captured ${session.rows.length} of ${session.label}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      capture.current = null;
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      tracker?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  const record = useCallback(() => {
    if (capture.current || countdownTimer.current) return;
    setCountdown(COUNTDOWN_SECONDS);

    let remaining = COUNTDOWN_SECONDS;
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
      setCountdown(null);
      setCaptured(0);
      capture.current = { label, target, rows: [] };
      setRecording(true);
      setStatus(`recording ${label} — keep rotating`);
    }, 1000);
  }, [label, target]);

  /**
   * Bail out of a take you already know is bad, without waiting for it to fill.
   * Also cancels a pending countdown — that's when you usually notice you
   * picked the wrong letter.
   */
  const cancelRun = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
      setCountdown(null);
      setStatus("countdown cancelled");
      return;
    }
    if (!capture.current) return;
    const { label: aborted, rows } = capture.current;
    capture.current = null;
    setRecording(false);
    setCaptured(0);
    setStatus(`discarded ${rows.length} frames of ${aborted}`);
  }, []);

  const deleteRun = useCallback((id) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const deleteClass = useCallback((cls) => {
    setRuns((prev) => prev.filter((r) => r.label !== cls));
  }, []);

  const undoLast = useCallback(() => {
    setRuns((prev) => prev.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    if (!window.confirm("Discard every run in this session?")) return;
    setRuns([]);
  }, []);

  const samples = useMemo(() => runs.flatMap((r) => r.rows), [runs]);

  const counts = useMemo(() => {
    const out = {};
    for (const run of runs) out[run.label] = (out[run.label] ?? 0) + run.rows.length;
    return out;
  }, [runs]);

  const download = useCallback(() => {
    const payload = { version: 1, recordedBy: recordedBy || "unknown", samples };
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.recordedBy}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordedBy, samples]);

  const done = CLASSES.filter((c) => counts[c] > 0).length;
  const busy = recording || countdown !== null;

  return (
    <main className="phase0">
      <h1>collect</h1>
      <p className="meta">
        {status}
        {" · "}
        {handPresent ? `hand: ${handedness ?? "?"}` : "no hand"}
        {" · "}
        {samples.length} samples · {runs.length} runs · {done}/{CLASSES.length} classes
      </p>
      {error && <p className="meta error">{error}</p>}

      <video ref={videoRef} playsInline muted />

      <div className="row">
        <label>
          recorded by{" "}
          <input
            value={recordedBy}
            onChange={(e) => setRecordedBy(e.target.value)}
            placeholder="mert"
          />
        </label>
        <label>
          class{" "}
          <select value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy}>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c} {counts[c] ? `(${counts[c]})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          frames{" "}
          <input
            type="number"
            value={target}
            min={10}
            step={10}
            disabled={busy}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
        <button onClick={record} disabled={busy || Boolean(error)}>
          Record
        </button>
        <button onClick={cancelRun} disabled={!busy}>
          Cancel run
        </button>
        <button onClick={download} disabled={samples.length === 0}>
          Download JSON
        </button>
      </div>

      {countdown !== null && <div className="letter">{countdown}</div>}
      {recording && (
        <div className="letter">
          {captured} / {target}
        </div>
      )}

      <div className="split">
        <section>
          <h2>Runs</h2>
          <div className="row">
            <button onClick={undoLast} disabled={runs.length === 0 || busy}>
              Undo last run
            </button>
            <button onClick={clearAll} disabled={runs.length === 0 || busy}>
              Clear session
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="meta">No runs yet. Each press of Record adds one.</p>
          ) : (
            <table className="counts">
              <thead>
                <tr>
                  <th>#</th>
                  <th>class</th>
                  <th>frames</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.id}</td>
                    <td>{run.label}</td>
                    <td>{run.rows.length}</td>
                    <td>
                      <button onClick={() => deleteRun(run.id)} disabled={busy}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>Per class</h2>
          <table className="counts">
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c} className={counts[c] ? "" : "missing"}>
                  <td>{c}</td>
                  <td>{counts[c] ?? 0}</td>
                  <td>
                    <button
                      onClick={() => deleteClass(c)}
                      disabled={!counts[c] || busy}
                      title={`Delete every run of ${c}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
