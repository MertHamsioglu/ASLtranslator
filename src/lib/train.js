/**
 * OWNER: Mert — M4
 *
 * In-browser training with tfjs. No Python, no separate toolchain. Driven from
 * /train.html, which is Mert's own Vite entry — App.jsx is never involved.
 *
 * Everything here is pure of the DOM so it can be exercised headlessly.
 */

import * as tf from "@tensorflow/tfjs";
import { CLASSES, NUM_FEATURES } from "./contract.js";

export const DEFAULT_EPOCHS = 60;
export const VALIDATION_SPLIT = 0.2;

/**
 * Merge any number of collected data files into flat xs/ys arrays.
 * This is what makes Phase 2's "both record, retrain on the union" a one-liner.
 *
 * @param {Array<{version:number, recordedBy:string, samples:Array<{label:string, features:number[]}>}>} files
 */
export function mergeDatasets(files) {
  const xs = [];
  const ys = [];
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const byRecorder = {};

  for (const file of files) {
    const who = file.recordedBy || "unknown";
    byRecorder[who] = (byRecorder[who] ?? 0) + file.samples.length;

    for (const { label, features } of file.samples) {
      const classIndex = CLASSES.indexOf(label);
      if (classIndex === -1) throw new Error(`unknown label "${label}" in ${who}`);
      if (features.length !== NUM_FEATURES) {
        throw new Error(`bad feature length ${features.length} for "${label}" in ${who}`);
      }
      // A NaN here trains happily and produces a model that predicts one class
      // forever. Catch it at the door.
      if (!features.every(Number.isFinite)) {
        throw new Error(`non-finite feature for "${label}" in ${who}`);
      }
      xs.push(features);
      ys.push(CLASSES.map((_, i) => (i === classIndex ? 1 : 0)));
      counts[label]++;
    }
  }

  return { xs, ys, counts, byRecorder };
}

/**
 * Classes with too few samples to be learnable. Worth surfacing BEFORE a
 * training run, because a class with 12 samples is invisible in the accuracy
 * number and obvious in the counts.
 */
export function findWeakClasses(counts, threshold = 50) {
  return CLASSES.filter((c) => counts[c] < threshold).map((c) => ({
    label: c,
    count: counts[c],
  }));
}

/**
 * Fisher-Yates over xs and ys together, keeping rows paired.
 *
 * THIS IS NOT OPTIONAL, and it's the subtlest trap in the whole pipeline.
 * tf.fit's `validationSplit` carves off the LAST fraction of the data BEFORE
 * shuffling, and its `shuffle: true` only reshuffles the training portion each
 * epoch. Captures are appended one class at a time, so feeding fit() the raw
 * merged arrays would validate exclusively against the last handful of classes
 * and report a val_acc that means nothing at all.
 *
 * Shuffling here, up front, is what makes the validation split a random sample.
 */
export function shuffleDataset(xs, ys) {
  const order = xs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    xs: order.map((i) => xs[i]),
    ys: order.map((i) => ys[i]),
  };
}

export function buildModel() {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [NUM_FEATURES], units: 64, activation: "relu" }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: CLASSES.length, activation: "softmax" }),
    ],
  });
  model.compile({
    optimizer: "adam",
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });
  return model;
}

/**
 * Hand control back to the browser so the page can repaint — but only when the
 * tab is actually visible.
 *
 * THIS IS LOAD-BEARING, and it fixes a hang inside tfjs, not just in our code.
 * tf.nextFrame() awaits requestAnimationFrame, and Chrome pauses rAF ENTIRELY
 * in a hidden tab. tfjs's own CustomCallback.maybeWait() awaits nextFrame()
 * roughly every 125ms during fit(), so switching tabs mid-run freezes training
 * inside the library and it never resumes. You will switch tabs — 60 epochs
 * takes a while.
 *
 * That's why this is passed to fit() as `nextFrameFunc` below: tfjs reads that
 * off the callbacks object and uses it in place of rAF. setTimeout is not an
 * alternative — hidden tabs clamp it to ~1/second, then ~1/minute after five
 * minutes, which turns a 30-second run into an hour.
 *
 * When nothing is visible there is nothing to repaint, so skipping the yield
 * costs nothing. fit() still awaits internally between batches.
 */
async function yieldToBrowser() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  await tf.nextFrame();
}

/**
 * @param {{xs:number[][], ys:number[][], epochs?:number, onEpochEnd?:Function}} opts
 * @returns {Promise<{model: tf.LayersModel, history: Array, shuffled: {xs:number[][], ys:number[][]}}>}
 *
 * `shuffled` is returned so the caller can run the confusion matrix over the
 * same rows fit() held out — see holdOut().
 */
export async function trainModel({ xs, ys, epochs = DEFAULT_EPOCHS, onEpochEnd }) {
  const model = buildModel();
  const history = [];

  const shuffled = shuffleDataset(xs, ys);
  const xsT = tf.tensor2d(shuffled.xs);
  const ysT = tf.tensor2d(shuffled.ys);

  try {
    await model.fit(xsT, ysT, {
      epochs,
      validationSplit: VALIDATION_SPLIT,
      shuffle: true,
      callbacks: {
        // Overrides tfjs's internal rAF yield — see yieldToBrowser above.
        // Without this, fit() itself hangs the moment the tab goes hidden.
        nextFrameFunc: yieldToBrowser,
        onEpochEnd: async (epoch, logs) => {
          const entry = {
            epoch: epoch + 1,
            acc: logs.acc ?? logs.accuracy,
            valAcc: logs.val_acc ?? logs.val_accuracy,
            loss: logs.loss,
            valLoss: logs.val_loss,
          };
          history.push(entry);
          onEpochEnd?.(entry);
          await yieldToBrowser();
        },
      },
    });
  } finally {
    xsT.dispose();
    ysT.dispose();
  }

  return { model, history, shuffled };
}

/**
 * Confusion matrix over a held-out slice, as counts[actual][predicted].
 *
 * This is what turns "the model is 91%" into "M and N are eating each other,
 * go record more of those two" — which is actionable, where the accuracy
 * number alone is not.
 */
export function confusionMatrix(model, xs, ys) {
  const n = CLASSES.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  const predicted = tf.tidy(() => {
    const out = model.predict(tf.tensor2d(xs));
    return out.argMax(-1).dataSync();
  });

  for (let i = 0; i < ys.length; i++) {
    const actual = ys[i].indexOf(1);
    matrix[actual][predicted[i]]++;
  }
  return matrix;
}

/**
 * The worst confusions, most frequent first — the actionable read of the matrix.
 */
export function topConfusions(matrix, limit = 8) {
  const out = [];
  for (let a = 0; a < CLASSES.length; a++) {
    for (let p = 0; p < CLASSES.length; p++) {
      if (a !== p && matrix[a][p] > 0) {
        out.push({ actual: CLASSES[a], predicted: CLASSES[p], count: matrix[a][p] });
      }
    }
  }
  return out.sort((x, y) => y.count - x.count).slice(0, limit);
}

/**
 * The rows fit() held out for validation: the last `fraction` of whatever array
 * it was handed. Pass the `shuffled` arrays trainModel returned, not the
 * original merged ones, or you'll be scoring the model on its own training data.
 */
export function holdOut(xs, ys, fraction = VALIDATION_SPLIT) {
  const cut = Math.floor(xs.length * (1 - fraction));
  return {
    trainXs: xs.slice(0, cut),
    trainYs: ys.slice(0, cut),
    testXs: xs.slice(cut),
    testYs: ys.slice(cut),
  };
}
