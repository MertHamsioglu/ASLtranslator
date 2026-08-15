/**
 * OWNER: Mert — M2
 *
 * The whole point of normalize is that the same handshape produces the same 63
 * numbers regardless of where the hand is, how far away it is, or which hand it
 * is. That's an invariance claim, and invariance claims are cheap to test and
 * expensive to debug from a bad model. So they're tested here.
 *
 *   npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeLandmarks } from "./normalize.js";
import { NUM_FEATURES } from "./contract.js";

/** A plausible right hand, fingers up. Same pose the mock recognizer uses. */
const HAND = [
  [0.5, 0.88], [0.42, 0.84], [0.36, 0.76], [0.32, 0.69], [0.29, 0.62],
  [0.44, 0.62], [0.42, 0.52], [0.41, 0.46], [0.4, 0.4],
  [0.51, 0.6], [0.51, 0.49], [0.51, 0.42], [0.51, 0.36],
  [0.58, 0.61], [0.59, 0.51], [0.6, 0.45], [0.6, 0.39],
  [0.64, 0.65], [0.66, 0.57], [0.67, 0.52], [0.68, 0.47],
].map(([x, y], i) => ({ x, y, z: -0.001 * i }));

const move = (lm, dx, dy) => lm.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z }));
const scale = (lm, k) => {
  const o = lm[0];
  return lm.map((p) => ({ x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k, z: p.z * k }));
};
/** Flip about the frame's vertical centre, the way a real left hand appears. */
const mirror = (lm) => lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const base = normalizeLandmarks(HAND, "Right");

describe("normalizeLandmarks — shape", () => {
  it("returns exactly NUM_FEATURES finite numbers", () => {
    assert.equal(base.length, NUM_FEATURES);
    assert.ok(base.every(Number.isFinite));
  });

  it("puts the wrist at the origin", () => {
    assert.ok(Math.abs(base[0]) < 1e-12);
    assert.ok(Math.abs(base[1]) < 1e-12);
    assert.ok(Math.abs(base[2]) < 1e-12);
  });

  it("scales so the largest absolute value is exactly 1", () => {
    assert.ok(Math.abs(Math.max(...base.map(Math.abs)) - 1) < 1e-12);
  });
});

describe("normalizeLandmarks — invariance", () => {
  it("is invariant to where the hand sits in frame", () => {
    assert.ok(maxDiff(base, normalizeLandmarks(move(HAND, 0.21, -0.13), "Right")) < 1e-9);
  });

  for (const k of [0.4, 0.75, 1.8, 3.0]) {
    it(`is invariant to hand size at ${k}x (distance from camera)`, () => {
      assert.ok(maxDiff(base, normalizeLandmarks(scale(HAND, k), "Right")) < 1e-9);
    });
  }

  it("is invariant to position and scale together", () => {
    const moved = move(scale(HAND, 2.2), -0.3, 0.15);
    assert.ok(maxDiff(base, normalizeLandmarks(moved, "Right")) < 1e-9);
  });
});

describe("normalizeLandmarks — handedness", () => {
  it("maps a mirrored left hand onto the same vector as the right", () => {
    assert.ok(maxDiff(base, normalizeLandmarks(mirror(HAND), "Left")) < 1e-9);
  });

  it("produces a different vector if handedness is mislabelled", () => {
    // Guards the M1/M2 seam: if handTracker reports the wrong hand, this must
    // not silently look correct.
    assert.ok(maxDiff(base, normalizeLandmarks(mirror(HAND), "Right")) > 0.1);
  });

  it("mirroring and centering commute", () => {
    // The SOW once claimed these had to happen in a fixed order. They don't —
    // negation is linear. This test is why we know.
    const mirrorFirst = (() => {
      const m = HAND.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
      const w = m[0];
      const c = m.flatMap((p) => [p.x - w.x, p.y - w.y, p.z - w.z]);
      const mx = Math.max(...c.map(Math.abs));
      return c.map((v) => v / mx);
    })();
    const centerFirst = (() => {
      const w = HAND[0];
      const c = HAND.flatMap((p) => [-(p.x - w.x), p.y - w.y, p.z - w.z]);
      const mx = Math.max(...c.map(Math.abs));
      return c.map((v) => v / mx);
    })();
    assert.ok(maxDiff(mirrorFirst, centerFirst) < 1e-12);
    assert.ok(maxDiff(normalizeLandmarks(HAND, "Left"), mirrorFirst) < 1e-12);
  });
});

describe("normalizeLandmarks — guards", () => {
  it("rejects the wrong number of landmarks", () => {
    assert.throws(() => normalizeLandmarks(HAND.slice(0, 20), "Right"));
    assert.throws(() => normalizeLandmarks(null, "Right"));
  });

  it("rejects a NaN coordinate", () => {
    // Regression: `Math.abs(NaN) > max` is false, so an earlier version let NaN
    // sail past the finite-max check straight into the training data, where it
    // trains happily and yields a model that predicts one class forever.
    const poisoned = HAND.map((p, i) => (i === 5 ? { ...p, x: NaN } : p));
    assert.throws(() => normalizeLandmarks(poisoned, "Right"));
  });

  it("rejects a degenerate hand with every point at the wrist", () => {
    assert.throws(() => normalizeLandmarks(HAND.map(() => ({ x: 0.5, y: 0.5, z: 0 })), "Right"));
  });

  it("tolerates landmarks with no z", () => {
    assert.doesNotThrow(() => normalizeLandmarks(HAND.map((p) => ({ x: p.x, y: p.y })), "Right"));
  });
});
