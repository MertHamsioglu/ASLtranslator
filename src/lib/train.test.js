/**
 * OWNER: Mert — M4
 *
 * Kept small and fast on purpose — it runs on every `npm test`. The real
 * accuracy question is answered by /train.html on real captures, not here.
 * What this file protects is the plumbing, and one trap in particular:
 * validationSplit takes the LAST fraction before shuffling, so unshuffled
 * class-ordered data produces a val_acc that means nothing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import { CLASSES, NUM_FEATURES } from "./contract.js";
import {
  buildModel,
  confusionMatrix,
  findWeakClasses,
  holdOut,
  mergeDatasets,
  shuffleDataset,
  topConfusions,
  trainModel,
} from "./train.js";

const PER_CLASS = 20;
const EPOCHS = 12;

/**
 * Independent pseudo-random centroid per (class, feature).
 * NOT sin(a*c + b*k) — that puts every centroid on a 2-parameter manifold and
 * leaves some class pairs closer together than the noise, which is unlearnable
 * by construction and produces a confusing "the pipeline is broken" result.
 */
function centroid(c, k, seed) {
  let h = ((c + 1) * 374761393 + (k + 1) * 668265263 + seed * 2654435761) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h / 4294967295) * 2 - 1;
}

/** Mimics a real capture file: samples appended one whole class at a time. */
function makeFile(recordedBy, seed) {
  const samples = [];
  for (let c = 0; c < CLASSES.length; c++) {
    const mid = Array.from({ length: NUM_FEATURES }, (_, k) => centroid(c, k, seed));
    for (let s = 0; s < PER_CLASS; s++) {
      samples.push({ label: CLASSES[c], features: mid.map((v) => v + (Math.random() - 0.5) * 0.3) });
    }
  }
  return { version: 1, recordedBy, samples };
}

const row = (label, features) => ({ version: 1, recordedBy: "x", samples: [{ label, features }] });

describe("mergeDatasets", () => {
  const merged = mergeDatasets([makeFile("mert", 0), makeFile("aaron", 7)]);

  it("flattens every file and counts per class", () => {
    assert.equal(merged.xs.length, CLASSES.length * PER_CLASS * 2);
    assert.ok(CLASSES.every((c) => merged.counts[c] === PER_CLASS * 2));
  });

  it("tracks who recorded what, for Phase 2 merges", () => {
    assert.equal(merged.byRecorder.mert, CLASSES.length * PER_CLASS);
    assert.equal(merged.byRecorder.aaron, CLASSES.length * PER_CLASS);
  });

  it("one-hots against CLASSES", () => {
    assert.ok(merged.ys.every((r) => r.length === CLASSES.length));
    assert.ok(merged.ys.every((r) => r.reduce((a, b) => a + b, 0) === 1));
  });

  it("refuses a label that isn't a class", () => {
    assert.throws(() => mergeDatasets([row("J", new Array(NUM_FEATURES).fill(0))]));
  });

  it("refuses the wrong feature length", () => {
    assert.throws(() => mergeDatasets([row("A", [1, 2, 3])]));
  });

  it("refuses non-finite features", () => {
    assert.throws(() => mergeDatasets([row("A", new Array(NUM_FEATURES).fill(NaN))]));
  });

  it("flags thin classes before you waste a training run on them", () => {
    assert.equal(findWeakClasses(merged.counts, 10).length, 0);
    assert.equal(findWeakClasses(merged.counts, 10_000).length, CLASSES.length);
  });
});

describe("shuffleDataset", () => {
  const merged = mergeDatasets([makeFile("mert", 0)]);
  const shuffled = shuffleDataset(merged.xs, merged.ys);

  it("keeps each x with its own y", () => {
    assert.ok(
      shuffled.xs.every((x, i) => merged.ys[merged.xs.indexOf(x)] === shuffled.ys[i]),
    );
  });

  it("actually reorders", () => {
    assert.notEqual(shuffled.xs.indexOf(merged.xs[0]), 0);
  });
});

describe("training", () => {
  it("validation is meaningless unless the data is shuffled first", async () => {
    // THE trap. fit()'s validationSplit takes the LAST fraction BEFORE
    // shuffling, and shuffle:true only reshuffles the training portion. Real
    // captures are appended class by class, so raw order means validation is
    // drawn entirely from classes the model never sees in training.
    const { xs, ys } = mergeDatasets([makeFile("mert", 0)]);

    const raw = buildModel();
    let rawValAcc = 0;
    await raw.fit(tf.tensor2d(xs), tf.tensor2d(ys), {
      epochs: EPOCHS,
      validationSplit: 0.2,
      shuffle: true,
      verbose: 0,
      callbacks: { onEpochEnd: (_e, logs) => { rawValAcc = logs.val_acc; } },
    });

    const { history } = await trainModel({ xs, ys, epochs: EPOCHS });
    const shuffledValAcc = history.at(-1).valAcc;

    assert.ok(rawValAcc < 0.05, `unshuffled val_acc should collapse, got ${rawValAcc}`);
    assert.ok(shuffledValAcc > 0.5, `shuffled val_acc should be real, got ${shuffledValAcc}`);
  });

  it("reports one history entry per epoch and improves", async () => {
    const { xs, ys } = mergeDatasets([makeFile("mert", 0)]);
    const seen = [];
    const { model, history, shuffled } = await trainModel({
      xs, ys, epochs: EPOCHS, onEpochEnd: (e) => seen.push(e),
    });

    assert.equal(history.length, EPOCHS);
    assert.equal(seen.length, EPOCHS);
    assert.ok(history.every((h) => Number.isFinite(h.acc) && Number.isFinite(h.valAcc)));
    assert.ok(history.at(-1).acc > history[0].acc);
    assert.equal(shuffled.xs.length, xs.length);
    assert.equal(model.outputs[0].shape.at(-1), CLASSES.length);
    assert.equal(model.inputs[0].shape.at(-1), NUM_FEATURES);
  });

  it("scores the confusion matrix on rows fit() held out", async () => {
    const { xs, ys } = mergeDatasets([makeFile("mert", 0)]);
    const { model, shuffled } = await trainModel({ xs, ys, epochs: EPOCHS });
    const { testXs, testYs } = holdOut(shuffled.xs, shuffled.ys);

    const cm = confusionMatrix(model, testXs, testYs);
    assert.equal(cm.flat().reduce((a, b) => a + b, 0), testXs.length);
    assert.ok(topConfusions(cm).every((c) => c.actual !== c.predicted));
  });

  it("leaks no tensors in the predict path", async () => {
    // Regression guard for the recognizer's hot loop: 30 predictions a second
    // without tf.tidy climbs memory until the tab dies, and it presents as a
    // performance problem rather than a leak.
    const { xs } = mergeDatasets([makeFile("mert", 0)]);
    const model = buildModel();
    tf.tidy(() => model.predict(tf.zeros([1, NUM_FEATURES])).dataSync());

    const before = tf.memory().numTensors;
    for (let i = 0; i < 100; i++) {
      tf.tidy(() => model.predict(tf.tensor2d([xs[i]], [1, NUM_FEATURES])).dataSync());
    }
    assert.equal(tf.memory().numTensors, before);
  });
});
