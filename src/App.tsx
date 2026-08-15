/**
 * OWNER: Aaron — A2–A5
 *
 * Camera + createRecognizer (Mert's file) + commit buffer. Same import as
 * Phase 0; the body behind it is now live MediaPipe, with the mock only if
 * the tracker itself cannot start. The recognizer effect always starts, even
 * when getUserMedia fails (contract rule 4), and always stop()s in cleanup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecognizer } from "./lib/recognizer";
import { createCommitter, type Committer } from "./components/commit";
import HandOverlay from "./components/HandOverlay";
import ConfidenceMeter from "./components/ConfidenceMeter";
import type { Prediction, Recognizer } from "./types";

const COPY_RESET_MS = 1500;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const committerRef = useRef<Committer | null>(null);
  if (committerRef.current == null) committerRef.current = createCommitter();

  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction>({
    letter: null,
    confidence: 0,
    landmarks: null,
  });
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [pipeline, setPipeline] = useState<"starting" | "live" | "landmarks" | "mock">("starting");
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPrediction = useCallback((next: Prediction) => {
    setPrediction(next);
    const committed = committerRef.current?.ingest(next);
    if (committed) setText((prev) => prev + committed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let recognizer: Recognizer | null = null;
    let stream: MediaStream | null = null;
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
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraLive(true);
        }
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setCameraError(`${error.name}: ${error.message}`);
        setCameraLive(false);
      }

      // Rule 4: the recognizer starts whether or not the camera came up.
      recognizer = await createRecognizer({ onPrediction });
      if (cancelled) {
        recognizer.stop();
        return;
      }
      if (stream && video) recognizer.attach(video);

      try {
        const probe = await fetch("/model/asl-model.json", { cache: "no-store" });
        setPipeline(probe.ok ? "live" : "landmarks");
      } catch {
        setPipeline("landmarks");
      }
    }

    start();

    return () => {
      cancelled = true;
      recognizer?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [onPrediction]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  async function copyText() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
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
                    Camera unavailable. The recognizer still starts.
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
                {pipeline === "live"
                  ? " · classifier"
                  : pipeline === "landmarks"
                    ? " · tracker, no model yet"
                    : pipeline === "mock"
                      ? " · mock"
                      : ""}
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

          <p className="footnote">
            {pipeline === "live"
              ? "Live classifier. 24 static letters. J and Z need motion."
              : pipeline === "landmarks"
                ? "Overlay is Mert’s tracker. Letters wait until a model is in public/model/. Capture at /collect.html, train at /train.html."
                : "24 static letters. J and Z need motion."}
          </p>
        </section>
      </main>
    </div>
  );
}
