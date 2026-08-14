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
 *     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
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
 * Two things that will bite you:
 *   - detectForVideo() throws if the timestamp isn't STRICTLY increasing.
 *     rAF can fire twice on the same video frame; track lastTimestamp and skip.
 *   - delegate:"GPU" fails outright on some machines. Catch and retry with
 *     "CPU" — slower, but it runs on Aaron's laptop and on demo day.
 */

// eslint-disable-next-line no-unused-vars
export async function createHandTracker({ onFrame }) {
  throw new Error("handTracker: not implemented yet (Mert, M1)");
}
