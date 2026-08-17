/**
 * OWNER: Mert — M1
 *
 * Wraps MediaPipe HandLandmarker in a rAF loop. Deliberately knows nothing
 * about letters or the model: landmarks in, landmarks out. recognizer.js is the
 * only thing that composes this with normalize + predict.
 *
 *   createHandTracker({ onFrame }) -> Promise<{ attach(videoEl), stop() }>
 *   onFrame({ landmarks: [{x,y,z}] | null, handedness: "Left"|"Right"|null })
 *
 * Same attach/stop shape as the recognizer contract on purpose, so M5 is a thin
 * composition rather than a rewrite.
 *
 * THE VERSION IN WASM_BASE MUST MATCH package.json. The JS loader and the .wasm
 * binary are a matched pair — mixing versions fails at init with an error that
 * does not say "version mismatch". If you bump the dependency, bump this in the
 * same commit. See PHASE1-MERT.md for two ways to make that structural.
 */

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/" +
  "hand_landmarker/float16/1/hand_landmarker.task";

async function createLandmarker(delegate) {
  // Dynamic import so MediaPipe is code-split out of the initial bundle —
  // Aaron's shell paints before this downloads.
  const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

/**
 * Still-image landmarker, for importing an existing photo dataset rather than
 * recording. Same MediaPipe model, RunningMode IMAGE instead of VIDEO — the
 * VIDEO mode carries tracking state between frames, which is wrong for a pile
 * of unrelated stills and makes each detection depend on the file before it.
 *
 *   createImageLandmarker() -> { detect(source), close() }
 *   detect(ImageBitmap|HTMLImageElement) -> { landmarks, handedness } | null
 *
 * Returns null when no hand is found, which is a normal outcome on real
 * datasets — the caller should count it, not treat it as an error.
 */
export async function createImageLandmarker() {
  const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

  async function create(delegate) {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "IMAGE",
      numHands: 1,
    });
  }

  let landmarker;
  let delegate = "GPU";
  try {
    landmarker = await create("GPU");
  } catch (err) {
    console.warn("imageLandmarker: GPU delegate failed, falling back to CPU:", err);
    delegate = "CPU";
    landmarker = await create("CPU");
  }

  return {
    delegate,
    detect(source) {
      const result = landmarker.detect(source);
      const landmarks = result.landmarks?.[0];
      if (!landmarks) return null;
      return {
        landmarks,
        handedness: result.handedness?.[0]?.[0]?.categoryName ?? null,
      };
    },
    close() {
      landmarker.close();
    },
  };
}

/**
 * @param {{ onFrame: (frame: {landmarks: object[]|null, handedness: string|null}) => void }} opts
 */
export async function createHandTracker({ onFrame }) {
  // GPU fails outright on some machines, and it won't be yours — it'll be
  // Aaron's, or the demo laptop. CPU is slower but it runs.
  let landmarker;
  let delegate = "GPU";
  try {
    landmarker = await createLandmarker("GPU");
  } catch (err) {
    console.warn("handTracker: GPU delegate failed, falling back to CPU:", err);
    delegate = "CPU";
    landmarker = await createLandmarker("CPU");
  }

  let video = null;
  let rafId = null;
  let stopped = false;
  let lastVideoTime = -1;
  let lastTimestamp = -1;

  function loop() {
    if (stopped) return;
    rafId = requestAnimationFrame(loop);

    // HAVE_CURRENT_DATA — before this there is no frame to read.
    if (!video || video.readyState < 2) return;

    // rAF runs at display refresh, which is usually faster than the camera.
    // Skipping unchanged frames avoids paying for inference twice on the same
    // image, and is most of why this holds 30fps on a CPU delegate.
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    // detectForVideo throws if the timestamp isn't STRICTLY increasing.
    const timestamp = performance.now();
    if (timestamp <= lastTimestamp) return;
    lastTimestamp = timestamp;

    let result;
    try {
      result = landmarker.detectForVideo(video, timestamp);
    } catch (err) {
      console.error("handTracker: detectForVideo failed:", err);
      return;
    }

    const landmarks = result.landmarks?.[0] ?? null;
    // NOTE: `handedness`, not the deprecated `handednesses`. It's an array of
    // arrays of Category objects — one outer entry per detected hand.
    const handedness = result.handedness?.[0]?.[0]?.categoryName ?? null;

    onFrame({ landmarks: landmarks ?? null, handedness: landmarks ? handedness : null });
  }

  return {
    /** Which delegate actually loaded. Useful when debugging a slow machine. */
    delegate,

    attach(videoEl) {
      video = videoEl;
      if (rafId === null && !stopped) loop();
    },

    stop() {
      if (stopped) return;
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      // Must close, or StrictMode's double-mount leaks a landmarker per mount
      // and you eventually blame the model for running out of GPU memory.
      landmarker.close();
    },
  };
}
