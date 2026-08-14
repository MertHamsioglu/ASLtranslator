/**
 * OWNER: Aaron — A2 onwards
 *
 * This is Phase 0 scaffolding, not a design. It exists to prove the whole loop
 * works end to end on both laptops: camera -> recognizer -> letters on screen.
 * Delete all of it as you build the real UI (A2-A5). Nothing here is precious.
 *
 * The one thing worth keeping the shape of is the effect below: create the
 * recognizer once, always stop it in cleanup. React StrictMode mounts every
 * effect twice in dev, so a recognizer that isn't cleaned up means two
 * intervals racing and a camera light that won't turn off.
 */

import { useEffect, useRef, useState } from "react";
import { createRecognizer } from "./lib/recognizer";

export default function App() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("starting");
  const [cameraError, setCameraError] = useState(null);
  const [prediction, setPrediction] = useState({
    letter: null,
    confidence: 0,
    landmarks: null,
  });

  useEffect(() => {
    let cancelled = false;
    let recognizer = null;
    let stream = null;
    const video = videoRef.current;

    async function start() {
      // Camera first, but a failure here must NOT stop the recognizer. Aaron
      // needs the mock emitting on a locked-down machine, in a headless
      // browser, or when he simply denies the prompt. A camera error is a
      // missing video feed, not a dead app.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        if (cancelled) return;
        setCameraError(`${err.name} — ${err.message}`);
      }

      recognizer = await createRecognizer({ onPrediction: setPrediction });
      if (cancelled) {
        recognizer.stop();
        return;
      }

      // attach() gets the video element only if we actually have a feed.
      // The real recognizer produces nothing without one; the mock ignores it.
      if (stream) recognizer.attach(video);
      setStatus(stream ? "running" : "running (no camera)");
    }

    start();

    return () => {
      cancelled = true;
      recognizer?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  const { letter, confidence, landmarks } = prediction;

  return (
    <main className="phase0">
      <h1>ASL Fingerspelling Recognizer</h1>
      <p className="meta">Phase 0 — mock recognizer. Status: {status}</p>

      {cameraError && <p className="meta error">camera unavailable: {cameraError}</p>}
      <video ref={videoRef} playsInline muted />

      <div className="letter">{letter ?? "·"}</div>
      <p className="meta">
        confidence {confidence.toFixed(2)} · landmarks{" "}
        {landmarks ? `${landmarks.length} pts` : "none"}
      </p>
    </main>
  );
}
