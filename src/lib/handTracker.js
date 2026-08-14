/**
 * OWNER: Mert — M1
 *
 * Wraps MediaPipe HandLandmarker in a rAF loop. Deliberately knows nothing
 * about letters or the model: landmarks in, landmarks out. recognizer.js is
 * the only thing that composes this with normalize + predict.
 *
 * Target shape:
 *
 *   createHandTracker({ onFrame }) -> Promise<{ attach(videoEl), stop() }>
 *   onFrame({ landmarks: [{x,y,z}] | null, handedness: "Left"|"Right"|null })
 *
 * Same attach/stop shape as the recognizer contract on purpose, so M5 is a
 * thin composition rather than a rewrite.
 *
 * Setup notes for M1:
 *
 *   import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
 *
 *   const vision = await FilesetResolver.forVisionTasks(
 *     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
 *   );
 *   const landmarker = await HandLandmarker.createFromOptions(vision, {
 *     baseOptions: {
 *       modelAssetPath:
 *         "https://storage.googleapis.com/mediapipe-models/hand_landmarker/" +
 *         "hand_landmarker/float16/1/hand_landmarker.task",
 *       delegate: "GPU",
 *     },
 *     runningMode: "VIDEO",
 *     numHands: 1,
 *   });
 *
 * THE VERSION IN THAT URL MUST MATCH package.json (currently 1.0.1). The JS
 * loader and the .wasm binary are a matched pair — mixing versions fails at
 * init with an error that does not say "version mismatch". If you bump the
 * dependency, bump the URL in the same commit.
 *
 * Two ways to make that impossible instead of merely documented, if you'd
 * rather not rely on the CDN at all (demo-day wifi is a real risk):
 *   - the package exposes the wasm as subpath exports, so Vite can bundle and
 *     fingerprint them for you:
 *       import loader from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
 *       import binary from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
 *     then hand createFromOptions a fileset literal instead of calling
 *     forVisionTasks: { wasmLoaderPath: loader, wasmBinaryPath: binary }
 *   - or copy node_modules/@mediapipe/tasks-vision/wasm into public/ at
 *     postinstall. Simpler, but it's 35MB and all of it lands in dist.
 * The .task model file is a separate ~7MB download from Google's CDN either
 * way; vendor it into public/model/ too if you want a fully offline demo.
 *
 * Three things that will bite you:
 *   - detectForVideo() throws if the timestamp isn't STRICTLY increasing.
 *     rAF can fire twice on the same video frame; track lastTimestamp and skip.
 *   - delegate:"GPU" fails outright on some machines. Catch and retry with
 *     "CPU" — slower, but it runs on Aaron's laptop and on demo day.
 *   - the result has BOTH `handedness` and a deprecated `handednesses`. Use
 *     `result.handedness[0]`. Most tutorials online still use the old one.
 */

// eslint-disable-next-line no-unused-vars
export async function createHandTracker({ onFrame }) {
  throw new Error("handTracker: not implemented yet (Mert, M1)");
}
