/**
 * OWNER: Mert — M4
 *
 * In-browser training with tfjs. No Python, no separate toolchain.
 * Driven from /train.html, which is Mert's own Vite entry — App.jsx is
 * never involved.
 *
 * Reference architecture:
 *
 *   const model = tf.sequential({
 *     layers: [
 *       tf.layers.dense({ inputShape: [NUM_FEATURES], units: 64, activation: "relu" }),
 *       tf.layers.dropout({ rate: 0.2 }),
 *       tf.layers.dense({ units: CLASSES.length, activation: "softmax" }),
 *     ],
 *   });
 *   model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });
 *   await model.fit(xs, ys, { epochs: 60, validationSplit: 0.2, shuffle: true });
 *   await model.save("downloads://asl-model");
 *
 * Then move asl-model.json + asl-model.weights.bin into public/model/.
 *
 * Watch VALIDATION accuracy, not training accuracy. val_acc of 0.99 almost
 * always means you captured 200 near-identical frames and the model has
 * memorized your exact hand position — it will fall apart on Aaron's hand.
 *
 * One-hot the labels against CLASSES from contract.js. Never retype the list.
 */

import { CLASSES, NUM_FEATURES } from "./contract";

/**
 * Merge any number of collected data files into flat xs/ys arrays.
 * Written now because it's the boring part and it's what makes "both record
 * data, then retrain on the combined set" a one-liner in Phase 2.
 *
 * @param {Array<{version:number, recordedBy:string, samples:Array<{label:string, features:number[]}>}>} files
 */
export function mergeDatasets(files) {
  const xs = [];
  const ys = [];
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));

  for (const file of files) {
    for (const { label, features } of file.samples) {
      const classIndex = CLASSES.indexOf(label);
      if (classIndex === -1) throw new Error(`unknown label "${label}" in ${file.recordedBy}`);
      if (features.length !== NUM_FEATURES) {
        throw new Error(`bad feature length ${features.length} for "${label}" in ${file.recordedBy}`);
      }
      xs.push(features);
      ys.push(CLASSES.map((_, i) => (i === classIndex ? 1 : 0)));
      counts[label]++;
    }
  }

  return { xs, ys, counts };
}
