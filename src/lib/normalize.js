/**
 * OWNER: Mert — M2
 *
 * 21 landmarks -> 63 numbers that are invariant to where the hand is in frame,
 * how far away it is, and which hand it is.
 *
 *   normalizeLandmarks(landmarks, handedness) -> number[63]
 *
 * The three steps, in this order:
 *
 *   1. If handedness === "Left", negate every x FIRST. One model then covers
 *      both hands instead of you collecting twice the data.
 *   2. Subtract landmark 0 (the wrist) from all 21 points  -> position invariant
 *   3. Divide every coordinate by the largest absolute value in the whole set
 *      -> scale invariant
 *
 * Order matters. Mirroring after centering gives you a different vector.
 *
 * Output layout is [x0,y0,z0, x1,y1,z1, ...] — flat, length 63, matching
 * NUM_FEATURES. Whatever order you pick, the collector and the recognizer must
 * agree, so don't change it after you've recorded data.
 *
 * How to verify M2 is right: hold one letter and walk toward and away from the
 * camera. The 63 numbers should barely move. If they scale with distance,
 * step 3 is wrong.
 */

// eslint-disable-next-line no-unused-vars
export function normalizeLandmarks(landmarks, handedness) {
  throw new Error("normalize: not implemented yet (Mert, M2)");
}
