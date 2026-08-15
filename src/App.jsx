/**
 * OWNER: Aaron — A2–A5
 *
 * Camera + mock recognizer + commit buffer. The recognizer effect always
 * starts, even when getUserMedia fails (contract rule 4), and always stop()s
 * in cleanup so StrictMode doesn't leave two intervals running.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecognizer } from "./lib/recognizer";
import { createCommitter } from "./components/commit";
import HandOverlay from "./components/HandOverlay";
import ConfidenceMeter from "./components/ConfidenceMeter";

const COPY_RESET_MS = 1500;

export default function App() {
  const videoRef = useRef(null);
  const committerRef = useRef(null);
  if (committerRef.current == null) committerRef.current = createCommitter();

  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [prediction, setPrediction] = useState({
    letter: null,
    confidence: 0,
    landmarks: null,
  });
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);

  const onPrediction = useCallback((next) => {
    setPrediction(next);
    const committed = committerRef.current.ingest(next);
    if (committed) setText((prev) => prev + committed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let recognizer = null;
    let stream = null;
    const video = videoRef.current;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setCameraLive(true);
      } catch (err) {
        if (cancelled) return;
        setCameraError(`${err.name}: ${err.message}`);
        setCameraLive(false);
      }

      recognizer = await createRecognizer({ onPrediction });
      if (cancelled) {
        recognizer.stop();
        return;
      }
      if (stream) recognizer.attach(video);
    }

    start();

    return () => {
      cancelled = true;
      recognizer?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [onPrediction]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copyText() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopied(false);
    }
  }

  const liveLetter = prediction.letter ?? "";

  return (
    <div className="app">
      <main className="shell">
        <section className="stage" aria-label="Camera">
          <p className="brand">Fingerspell</p>
          <div className="well">
            <video ref={videoRef} playsInline muted />
            <HandOverlay landmarks={prediction.landmarks} />
            {!cameraLive && (
              <div className="well-empty">
                {cameraError ? (
                  <p className="banner" role="status">
                    Camera unavailable. The recognizer is still running on the mock.
                    {` ${cameraError}`}
                  </p>
                ) : (
                  <p className="banner" role="status">
                    Starting camera…
                  </p>
                )}
              </div>
            )}
            <div className="stage-chrome">
              <p className="live-flag">
                <span className={cameraLive ? "dot on" : "dot"} />
                {cameraLive ? "Camera live" : "No camera"}
              </p>
              <ConfidenceMeter value={prediction.confidence} />
            </div>
          </div>
        </section>

        <section className="side" aria-label="Readout">
          <p className="letter" aria-live="polite">
            {liveLetter || "·"}
          </p>
          <p className="reading">
            {prediction.letter
              ? `reading · ${prediction.confidence.toFixed(2)}`
              : prediction.landmarks
                ? "transition"
                : "no hand"}
          </p>

          <p className="buffer-label" id="committed-label">
            Committed text
          </p>
          <div className="buffer" role="status" aria-labelledby="committed-label">
            {text}
            <span className="caret" aria-hidden="true" />
          </div>

          <div className="actions">
            <button type="button" className="btn primary" onClick={copyText} disabled={!text}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn" onClick={() => setText((t) => `${t} `)}>
              Space
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setText((t) => t.slice(0, -1))}
              disabled={!text}
            >
              Backspace
            </button>
            <button type="button" className="btn" onClick={() => setText("")} disabled={!text}>
              Clear
            </button>
          </div>

          <p className="footnote">24 static letters. J and Z need motion.</p>
        </section>
      </main>
    </div>
  );
}
