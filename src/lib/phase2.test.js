/**
 * Phase 2 validation harness.
 *
 * Scores whatever model and captures sit in .phase2/ — it does not fit a new
 * network, that's scripts/phase2-prepare.mjs. Run `npm run phase2` to generate
 * a synthetic set and model, then `npm test` picks these suites up.
 *
 * .phase2/ is GITIGNORED, deliberately. An earlier version of this harness
 * wrote its synthetic model into public/model/, where createRecognizer loads
 * it — which makes the app confidently commit wrong letters with no console
 * warning, because as far as the recognizer is concerned a classifier exists.
 * A stand-in model must never sit on the path the app serves.
 *
 * Covers SOW Phase 2:
 *   2. merge two recorders
 *   3. commit thresholds against this model (no double-commit, no false letters)
 *   4. held-out third "hand"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as tf from "@tensorflow/tfjs";
import { CLASSES, NONE_LABEL, NUM_FEATURES } from "./contract.js";
import { findWeakClasses, mergeDatasets } from "./train.js";
import { COMMIT_CONFIG, createCommitter } from "../components/commit.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

// Skip rather than fail when nothing has been generated — a clean clone has no
// .phase2/, and `npm test` should still be green there.
const ARTIFACTS = [
  ".phase2/model/asl-model.json",
  ".phase2/model/asl-model.weights.bin",
  ".phase2/aaron.json",
  ".phase2/mert.json",
  ".phase2/third.json",
];
const ready = ARTIFACTS.every((rel) => existsSync(resolve(root, rel)));
const suite = ready ? describe : describe.skip;
if (!ready) {
  console.log("phase2: no .phase2/ artifacts — run `npm run phase2` first. Skipping.");
}

async function loadShippedModel() {
  const json = readJson(".phase2/model/asl-model.json");
  const bin = readFileSync(resolve(root, ".phase2/model/asl-model.weights.bin"));
  const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData,
    }),
  );
}

function decide(scores) {
  let best = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[best]) best = i;
  }
  const label = CLASSES[best];
  return {
    label,
    letter: label === NONE_LABEL ? null : label,
    confidence: scores[best],
  };
}

function predict(model, features) {
  const scores = tf.tidy(() =>
    model.predict(tf.tensor2d([features], [1, NUM_FEATURES])).dataSync(),
  );
  return decide(scores);
}

suite("Phase 2 · two-recorder merge", () => {
  const aaron = readJson(".phase2/aaron.json");
  const mert = readJson(".phase2/mert.json");
  const merged = mergeDatasets([aaron, mert]);

  it("keeps the frozen capture shape", () => {
    assert.equal(aaron.version, 1);
    assert.equal(mert.version, 1);
    assert.equal(aaron.recordedBy, "aaron");
    assert.equal(mert.recordedBy, "mert");
  });

  it("concatenates both laptops into one training set", () => {
    assert.equal(merged.byRecorder.aaron, aaron.samples.length);
    assert.equal(merged.byRecorder.mert, mert.samples.length);
    assert.equal(merged.xs.length, aaron.samples.length + mert.samples.length);
  });

  it("has no thin classes at the Phase-2 floor of 50", () => {
    assert.deepEqual(findWeakClasses(merged.counts, 50), []);
  });
});

suite("Phase 2 · shipped classifier", () => {
  it("maps NONE to letter:null — the string never crosses the boundary", () => {
    const scores = new Float32Array(CLASSES.length);
    scores[CLASSES.indexOf(NONE_LABEL)] = 0.91;
    scores[0] = 0.04;
    const out = decide(scores);
    assert.equal(out.label, NONE_LABEL);
    assert.equal(out.letter, null);
  });

  it("loads the committed model with 63 in and 25 out", async () => {
    const model = await loadShippedModel();
    assert.equal(model.inputs[0].shape.at(-1), NUM_FEATURES);
    assert.equal(model.outputs[0].shape.at(-1), CLASSES.length);
    model.dispose();
  });
});

suite("Phase 2 · third hand (held out of training)", () => {
  it("stays above 0.70 overall on the held-out recorder", async () => {
    const model = await loadShippedModel();
    const third = readJson(".phase2/third.json");
    const { xs, ys } = mergeDatasets([third]);
    let correct = 0;
    for (let i = 0; i < xs.length; i++) {
      const actual = CLASSES[ys[i].indexOf(1)];
      if (predict(model, xs[i]).label === actual) correct++;
    }
    const acc = correct / xs.length;
    assert.ok(acc >= 0.7, `third-hand acc ${acc.toFixed(3)} (n=${xs.length})`);
    model.dispose();
  });
});

suite("Phase 2 · A3 thresholds against this model", () => {
  it("keeps the four knobs in one config object", () => {
    assert.equal(COMMIT_CONFIG.windowSize, 12);
    assert.equal(COMMIT_CONFIG.minAgreement, 9);
    assert.equal(COMMIT_CONFIG.minMeanConfidence, 0.7);
    assert.equal(COMMIT_CONFIG.lockoutFrames, 6);
  });

  it("commits a held letter once and does not type AAAAA", async () => {
    const model = await loadShippedModel();
    const aaron = readJson(".phase2/aaron.json");
    const frames = aaron.samples.filter((s) => s.label === "L").slice(0, 24);
    assert.ok(frames.length >= 12);

    const committer = createCommitter();
    const committed = [];
    for (const sample of frames) {
      const p = predict(model, sample.features);
      const letter = committer.ingest({
        letter: p.letter,
        confidence: p.confidence,
        landmarks: null,
      });
      if (letter) committed.push(letter);
    }
    assert.equal(committed.length, 1);
    assert.equal(committed[0], "L");
    model.dispose();
  });

  it("does not commit through a NONE stretch", async () => {
    const model = await loadShippedModel();
    const aaron = readJson(".phase2/aaron.json");
    const frames = aaron.samples.filter((s) => s.label === NONE_LABEL).slice(0, 24);
    const committer = createCommitter();
    const committed = [];
    for (const sample of frames) {
      const p = predict(model, sample.features);
      const letter = committer.ingest({
        letter: p.letter,
        confidence: p.confidence,
        landmarks: null,
      });
      if (letter) committed.push(letter);
    }
    assert.equal(committed.length, 0);
    model.dispose();
  });
});
