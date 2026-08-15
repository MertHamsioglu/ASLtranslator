/**
 * OWNER: Mert — M2
 *
 * 21 landmarks -> 63 numbers that are invariant to where the hand is in frame,
 * how far away it is, and which hand it is.
 *
 *   normalizeLandmarks(landmarks, handedness) -> number[63]
 *
 * The steps:
 *
 *   1. If handedness is "Left", negate every x. One model then covers both
 *      hands instead of you collecting twice the data.
 *   2. Subtract landmark 0 (the wrist) from all 21 points  -> position invariant
 *   3. Divide every coordinate by the largest absolute value in the whole set
 *      -> scale invariant
 *
 * Steps 1 and 2 commute — negation is linear, so -(x - wristX) is the same
 * number whichever you do first, and this code folds them into one pass.
 * Step 3 must come last: scaling before centering would divide by a magnitude
 * that still includes the hand's position in frame, so the result would drift
 * as you moved across the camera.
 *
 * Scaling by ONE max across the whole set (rather than per-axis) preserves the
 * hand's proportions. Per-axis scaling would stretch every hand to fill a unit
 * cube and make M and N even harder to tell apart than they already are.
 *
 * Output layout is [x0,y0,z0, x1,y1,z1, ...] — flat, length 63, matching
 * NUM_FEATURES. Don't change the layout, the order, or the scaling rule after
 * you've recorded data: every JSON file in data/ is encoded with it, and
 * changing it silently invalidates all of them.
 *
 * How to verify: hold one letter and walk toward and away from the camera. The
 * 63 numbers should barely move. If they scale with distance, step 3 is broken.
 */

import { NUM_FEATURES, NUM_LANDMARKS } from "./contract.js";

/**
 * @param {Array<{x:number, y:number, z?:number}>} landmarks - 21 raw MediaPipe points
 * @param {"Left"|"Right"|null} handedness - as reported by MediaPipe
 * @returns {number[]} 63 features
 */
export function normalizeLandmarks(landmarks, handedness) {
  if (!Array.isArray(landmarks) || landmarks.length !== NUM_LANDMARKS) {
    throw new Error(
      `normalizeLandmarks: expected ${NUM_LANDMARKS} landmarks, got ${landmarks?.length ?? "none"}`,
    );
  }

  // Step 1 folded into step 2: mirror left hands into right-hand space.
  const mirror = handedness === "Left" ? -1 : 1;
  const wrist = landmarks[0];
  const wristX = wrist.x * mirror;
  const wristY = wrist.y;
  const wristZ = wrist.z ?? 0;

  const out = new Array(NUM_FEATURES);
  let max = 0;

  for (let i = 0; i < NUM_LANDMARKS; i++) {
    const p = landmarks[i];
    const x = p.x * mirror - wristX;
    const y = p.y - wristY;
    const z = (p.z ?? 0) - wristZ;

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;

    // Check each coordinate explicitly. Folding this into the max comparison
    // does NOT work: `Math.abs(NaN) > max` is false, so a NaN sails past an
    // is-the-max-finite check and lands silently in the output — which is the
    // exact silent poisoning this guard exists to prevent.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`normalizeLandmarks: non-finite coordinate at landmark ${i}`);
    }

    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    if (ax > max) max = ax;
    if (ay > max) max = ay;
    if (az > max) max = az;
  }
  // Every point identical to the wrist. Can't happen with a real hand, but a
  // zero divisor would turn the whole vector into NaN, so refuse it.
  if (max === 0) {
    throw new Error("normalizeLandmarks: degenerate hand, all landmarks at the wrist");
  }

  for (let i = 0; i < NUM_FEATURES; i++) out[i] /= max;

  return out;
}
