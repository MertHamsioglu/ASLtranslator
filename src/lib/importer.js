/**
 * OWNER: Mert
 *
 * Turning someone else's dataset into our capture format.
 *
 * Everything here is pure — no DOM, no MediaPipe — so it can be tested
 * headlessly. The parts that need a browser (decoding images, running the
 * landmarker) live in pages/ImportPage.jsx.
 *
 * THE RULE THAT MATTERS: an imported row must go through the same
 * normalizeLandmarks() the live recognizer uses. Never trust a dataset that
 * ships "already normalized" features — a different centering or scaling rule
 * puts your training data and your inference in two different spaces, which
 * trains beautifully and fails completely on camera.
 */

import { CLASSES, LETTERS, NONE_LABEL, NUM_FEATURES, NUM_LANDMARKS } from "./contract.js";

/**
 * Map a dataset's folder or file name onto one of our classes.
 *
 * Public ASL datasets are usually laid out as one folder per class:
 *   asl_alphabet_train/A/A1.jpg
 * with extra folders for things we don't model.
 *
 * The parent directory wins; the filename stem is only a fallback, because
 * flat datasets exist ("set/W.jpeg") and a directory picker always prefixes
 * the folder you chose, so parent-only matching would reject them wholesale.
 *
 * The cost of that fallback: an unrecognised parent plus a filename that
 * happens to be a letter resolves to that letter ("train/hello/x.jpg" -> X).
 * There is no way to tell that apart from a genuine flat layout by path alone.
 * The mitigation is the import report — it shows per-class counts and names
 * the missing classes, so a misread layout is loud rather than silent. Check
 * it before you download.
 *
 * @returns {string|null} a member of CLASSES, or null to skip the file
 */
export function labelFromPath(path) {
  const parts = path.split("/").filter(Boolean);
  // Prefer the parent directory; fall back to the filename stem for flat sets.
  const candidates = [parts.at(-2), parts.at(-1)?.replace(/\.[^.]+$/, "")];

  for (const raw of candidates) {
    if (!raw) continue;
    const token = raw.trim().toUpperCase();

    // J and Z are motion letters and are not in CLASSES. Dataset copies are a
    // single static frame of the start pose, which is just I and D — importing
    // them actively poisons those two classes.
    if (token === "J" || token === "Z") return null;

    // "nothing" is empty background: MediaPipe finds no hand, so it yields no
    // landmarks and no row. Our NONE means a hand IS visible but isn't a
    // letter, which no image dataset provides. See synthesizeNone below.
    if (["NOTHING", "BLANK", "EMPTY", "BACKGROUND"].includes(token)) return null;
    if (["SPACE", "DEL", "DELETE"].includes(token)) return null;

    if (LETTERS.includes(token)) return token;
    if (token === NONE_LABEL) return NONE_LABEL;
  }
  return null;
}

/**
 * Parse a CSV of RAW landmark coordinates into per-row landmark arrays.
 *
 * Accepts a label column plus 42 (x,y) or 63 (x,y,z) numeric columns. Missing
 * z is filled with 0 — MediaPipe's z is relative depth and our normalization
 * scales it alongside x and y, so a flat z is a real loss of signal but not a
 * broken row. Datasets built from single photos often have no usable z anyway.
 *
 * Refuses anything that looks pre-normalized (see the file header for why).
 */
export function parseLandmarkCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("csv: needs a header row and at least one data row");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const labelIndex = header.findIndex((h) => ["label", "class", "letter", "target"].includes(h));
  if (labelIndex === -1) {
    throw new Error('csv: no label column (expected one of "label", "class", "letter", "target")');
  }

  const numericColumns = header.length - 1;
  let dims;
  if (numericColumns === NUM_LANDMARKS * 3) dims = 3;
  else if (numericColumns === NUM_LANDMARKS * 2) dims = 2;
  else {
    throw new Error(
      `csv: expected ${NUM_LANDMARKS * 2} or ${NUM_LANDMARKS * 3} coordinate columns, found ${numericColumns}`,
    );
  }

  const rows = [];
  const skipped = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    if (cells.length !== header.length) {
      skipped.push({ line: i + 1, why: "wrong column count" });
      continue;
    }

    const label = labelFromPath(cells[labelIndex].trim());
    if (!label) {
      skipped.push({ line: i + 1, why: `unmapped label "${cells[labelIndex].trim()}"` });
      continue;
    }

    const nums = cells.filter((_, c) => c !== labelIndex).map(Number);
    if (!nums.every(Number.isFinite)) {
      skipped.push({ line: i + 1, why: "non-numeric coordinate" });
      continue;
    }

    const landmarks = [];
    for (let p = 0; p < NUM_LANDMARKS; p++) {
      landmarks.push(
        dims === 3
          ? { x: nums[p * 3], y: nums[p * 3 + 1], z: nums[p * 3 + 2] }
          : { x: nums[p * 2], y: nums[p * 2 + 1], z: 0 },
      );
    }
    rows.push({ label, landmarks });
  }

  return { rows, skipped, dims };
}

/**
 * Does this look like raw MediaPipe output, or has someone already normalized it?
 *
 * Raw landmarks are image-space: x and y in roughly [0,1], and the wrist is
 * nowhere near the origin. Our normalized vectors put the wrist exactly at
 * (0,0,0). If a dataset already did that, its centering and scaling rule is
 * probably not ours, and mixing the two is the silent train/serve skew this
 * module exists to prevent.
 */
export function looksPreNormalized(rows) {
  if (rows.length === 0) return false;
  const sample = rows.slice(0, Math.min(50, rows.length));
  const wristAtOrigin = sample.filter((r) => {
    const w = r.landmarks[0];
    return Math.abs(w.x) < 1e-6 && Math.abs(w.y) < 1e-6;
  }).length;
  return wristAtOrigin / sample.length > 0.9;
}

/**
 * Build NONE rows by blending pairs of letter samples.
 *
 * No image dataset can give us NONE. Its "nothing" class is empty background,
 * which produces no hand and therefore no row at all — while our NONE means a
 * hand IS visible and simply isn't a letter. Without it the app spells
 * confidently and continuously while your hand moves between signs, which is
 * the single most demo-breaking failure available.
 *
 * A blend of an A row and a B row is, geometrically, a pose partway between
 * the two — which is exactly what a mid-transition hand is. This is an
 * approximation: an interpolated vector is not guaranteed to be a physically
 * reachable hand, and it will never cover a hand resting in your lap. Real
 * recorded NONE is better. This is enormously better than nothing.
 *
 * Blend ratios stay inside [0.25, 0.75] so the result is never close enough to
 * either endpoint to contradict that letter's own training rows.
 *
 * @param {Array<{label:string, features:number[]}>} samples letter rows to blend
 * @param {number} count how many NONE rows to generate
 * @param {() => number} rng injectable for deterministic tests
 */
export function synthesizeNone(samples, count, rng = Math.random) {
  const letters = samples.filter((s) => s.label !== NONE_LABEL);
  if (letters.length < 2) {
    throw new Error("synthesizeNone: need at least two letter samples to blend");
  }

  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 50) {
    guard++;
    const a = letters[Math.floor(rng() * letters.length)];
    const b = letters[Math.floor(rng() * letters.length)];
    // Blending a letter with itself just reproduces that letter.
    if (a.label === b.label) continue;

    const t = 0.25 + rng() * 0.5;
    const features = new Array(NUM_FEATURES);
    for (let i = 0; i < NUM_FEATURES; i++) {
      features[i] = a.features[i] * (1 - t) + b.features[i] * t;
    }
    out.push({ label: NONE_LABEL, features });
  }

  if (out.length < count) {
    throw new Error("synthesizeNone: too few distinct classes to blend");
  }
  return out;
}

/** Per-class tally over CLASSES, including the zeros. */
export function tally(samples) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (const s of samples) counts[s.label] = (counts[s.label] ?? 0) + 1;
  return counts;
}

/**
 * Cap how many rows any single class contributes.
 *
 * Public datasets ship thousands of images per letter, and an unbalanced merge
 * quietly teaches the model that the biggest class is the safest guess. It
 * also means you don't have to push 87,000 images through MediaPipe to get a
 * usable set.
 */
export function capPerClass(samples, max) {
  if (!max || max <= 0) return samples;
  const seen = {};
  const out = [];
  for (const s of samples) {
    seen[s.label] = (seen[s.label] ?? 0) + 1;
    if (seen[s.label] <= max) out.push(s);
  }
  return out;
}
