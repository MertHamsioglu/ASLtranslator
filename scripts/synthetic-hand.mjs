/**
 * Geometric stand-in for two people recording on two laptops.
 * Not a substitute for real hands — it exists so Phase 2 can be trained,
 * merged, and scored in CI before anyone sits in front of a camera.
 *
 * Output samples are already normalized (same shape CollectPage writes).
 */
import { CLASSES, LETTERS, NONE_LABEL } from "../src/lib/contract.js";
import { normalizeLandmarks } from "../src/lib/normalize.js";

/** Thumb, index, middle, ring, pinky: 0 extended, 1 fully curled. */
export const LETTER_CURLS = {
  A: [0.20, 1.00, 1.00, 1.00, 1.00],
  B: [0.95, 0.00, 0.00, 0.00, 0.00],
  C: [0.45, 0.40, 0.40, 0.40, 0.40],
  D: [0.50, 0.00, 0.88, 0.88, 0.88],
  E: [0.80, 0.82, 0.82, 0.82, 0.82],
  F: [0.55, 0.90, 0.00, 0.00, 0.00],
  G: [0.25, 0.10, 1.00, 1.00, 1.00],
  H: [0.30, 0.00, 0.00, 1.00, 1.00],
  I: [0.50, 1.00, 1.00, 1.00, 0.00],
  K: [0.15, 0.00, 0.35, 1.00, 1.00],
  L: [0.00, 0.00, 1.00, 1.00, 1.00],
  M: [0.72, 0.92, 0.92, 0.92, 1.00],
  N: [0.70, 0.90, 0.90, 1.00, 1.00],
  O: [0.50, 0.58, 0.58, 0.58, 0.58],
  P: [0.30, 0.20, 0.45, 1.00, 1.00],
  Q: [0.35, 0.35, 1.00, 1.00, 1.00],
  R: [0.40, 0.08, 0.18, 1.00, 1.00],
  S: [0.88, 1.00, 1.00, 1.00, 1.00],
  T: [0.55, 0.95, 1.00, 1.00, 1.00],
  U: [0.40, 0.00, 0.00, 1.00, 1.00],
  V: [0.40, 0.00, 0.22, 1.00, 1.00],
  W: [0.40, 0.00, 0.00, 0.00, 1.00],
  X: [0.40, 0.52, 1.00, 1.00, 1.00],
  Y: [0.05, 1.00, 1.00, 1.00, 0.00],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function joint(from, angle, length) {
  return {
    x: from.x + Math.cos(angle) * length,
    y: from.y + Math.sin(angle) * length,
    z: from.z - 0.012,
  };
}

/**
 * Right-hand pose in MediaPipe camera space (y grows downward).
 * Fingers point toward the top of the frame (negative screen-y after placement).
 */
export function rawHand(curls, opts) {
  const {
    ox = 0.52,
    oy = 0.78,
    scale = 0.22,
    spread = 0.18,
    rng = Math.random,
    jitter = 0.008,
  } = opts;

  const j = (v) => v + (rng() - 0.5) * 2 * jitter;
  const wrist = { x: j(ox), y: j(oy), z: j(0) };
  const pts = new Array(21);
  pts[0] = wrist;

  const palmUp = -Math.PI / 2;
  pts[1] = joint(wrist, palmUp + 0.9, 0.28 * scale);
  let prev = pts[1];
  const thumbCurl = curls[0];
  for (let i = 0; i < 3; i++) {
    const ang = palmUp + 1.15 + i * (0.55 * thumbCurl);
    prev = joint(prev, ang, (0.18 - i * 0.02) * scale);
    pts[2 + i] = prev;
  }

  const mcpIndex = [5, 9, 13, 17];
  const baseSpread = [-0.42, -0.14, 0.14, 0.42];
  for (let f = 0; f < 4; f++) {
    const mcpAng = palmUp + baseSpread[f] * spread;
    const mcp = joint(wrist, mcpAng, 0.42 * scale);
    pts[mcpIndex[f]] = mcp;
    const curl = curls[f + 1];
    prev = mcp;
    for (let k = 0; k < 3; k++) {
      const ang = mcpAng + curl * 0.95 * (k + 1);
      prev = joint(prev, ang, (0.22 - k * 0.03) * scale);
      pts[mcpIndex[f] + 1 + k] = prev;
    }
  }

  for (const p of pts) {
    p.x = j(p.x);
    p.y = j(p.y);
    p.z = j(p.z);
  }
  return pts;
}

export function curlsFor(label, rng) {
  if (label === NONE_LABEL) {
    return [0, 1, 2, 3, 4].map(() => rng());
  }
  const base = LETTER_CURLS[label];
  if (!base) throw new Error(`no curl template for ${label}`);
  return base.map((v) => Math.min(1, Math.max(0, v + (rng() - 0.5) * 0.06)));
}

export function makeCapture({ recordedBy, seed, samplesPerClass, handednessMix = 0 }) {
  const rng = mulberry32(seed);
  const samples = [];
  for (const label of CLASSES) {
    const n = label === NONE_LABEL ? Math.round(samplesPerClass * 1.4) : samplesPerClass;
    for (let i = 0; i < n; i++) {
      const handedness = rng() < handednessMix ? "Left" : "Right";
      const curls = curlsFor(label, rng);
      const raw = rawHand(curls, {
        rng,
        ox: 0.42 + rng() * 0.2,
        oy: 0.68 + rng() * 0.18,
        scale: 0.16 + rng() * 0.14,
        spread: 0.14 + rng() * 0.1,
        jitter: recordedBy === "third" ? 0.014 : 0.007,
      });
      if (handedness === "Left") {
        for (const p of raw) p.x = 1 - p.x;
      }
      samples.push({
        label,
        features: normalizeLandmarks(raw, handedness),
      });
    }
  }
  return { version: 1, recordedBy, samples };
}

export { LETTERS, NONE_LABEL, CLASSES };
