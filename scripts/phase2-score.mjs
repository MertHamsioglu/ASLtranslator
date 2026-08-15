/**
 * One-off scorer used while writing Phase 2 tests. Prints third-hand accuracy
 * and a commit-threshold sweep against the trained model.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as tf from "@tensorflow/tfjs";
import { CLASSES, NONE_LABEL, NUM_FEATURES } from "../src/lib/contract.js";
import { mergeDatasets, confusionMatrix, topConfusions } from "../src/lib/train.js";
import { createCommitter, COMMIT_CONFIG } from "../src/components/commit.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadModel() {
  const json = JSON.parse(readFileSync(resolve(root, "public/model/asl-model.json"), "utf8"));
  const bin = readFileSync(resolve(root, "public/model/asl-model.weights.bin"));
  const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData,
    }),
  );
}

function predict(model, features) {
  const scores = tf.tidy(() => model.predict(tf.tensor2d([features], [1, NUM_FEATURES])).dataSync());
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const label = CLASSES[best];
  return {
    letter: label === NONE_LABEL ? null : label,
    confidence: scores[best],
    label,
  };
}

const model = await loadModel();
const third = JSON.parse(readFileSync(resolve(root, "data/third-phase2.json"), "utf8"));
const merged = mergeDatasets([third]);
const { xs, ys } = merged;
const predicted = xs.map((f) => predict(model, f));
let correct = 0;
for (let i = 0; i < xs.length; i++) {
  const actual = CLASSES[ys[i].indexOf(1)];
  if (predicted[i].label === actual) correct++;
}
console.log(`third-hand accuracy ${correct}/${xs.length} = ${(correct / xs.length).toFixed(3)}`);

const cm = confusionMatrix(
  model,
  xs,
  ys,
);
console.log("top confusions", topConfusions(cm, 8));

// Commit simulation: for each letter, 20 frames of that class then 8 NONE
const aaron = JSON.parse(readFileSync(resolve(root, "data/aaron-phase2.json"), "utf8"));
const byLabel = Object.fromEntries(CLASSES.map((c) => [c, []]));
for (const s of aaron.samples) byLabel[s.label].push(s.features);

function simulate(config) {
  let commits = 0;
  let falseCommits = 0;
  let doubles = 0;
  for (const letter of CLASSES) {
    if (letter === NONE_LABEL) continue;
    const c = createCommitter(config);
    const frames = byLabel[letter].slice(0, 20);
    const got = [];
    for (const f of frames) {
      const p = predict(model, f);
      const out = c.ingest({ letter: p.letter, confidence: p.confidence, landmarks: null });
      if (out) got.push(out);
    }
    for (const f of byLabel[NONE_LABEL].slice(0, 8)) {
      const p = predict(model, f);
      const out = c.ingest({ letter: p.letter, confidence: p.confidence, landmarks: null });
      if (out) got.push(out);
    }
    if (got[0] === letter) commits++;
    if (got.length > 1) doubles++;
    falseCommits += got.filter((g) => g !== letter).length;
  }
  return { commits, doubles, falseCommits };
}

console.log("default", COMMIT_CONFIG, simulate(COMMIT_CONFIG));
for (const minMeanConfidence of [0.45, 0.55, 0.65, 0.7, 0.8]) {
  for (const minAgreement of [7, 8, 9, 10]) {
    const cfg = { ...COMMIT_CONFIG, minMeanConfidence, minAgreement };
    const r = simulate(cfg);
    console.log(JSON.stringify({ minMeanConfidence, minAgreement, ...r }));
  }
}

model.dispose();
