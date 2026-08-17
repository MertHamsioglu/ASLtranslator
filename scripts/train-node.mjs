/**
 * OWNER: Mert
 *
 * Headless training. Same lib/train.js the browser page uses — this is only a
 * different way to run it, never a second implementation.
 *
 *   node scripts/train-node.mjs data/one.json data/two.json
 *
 * Why this exists: /train.html is the right tool when you want to watch the
 * curve, but Chrome throttles requestAnimationFrame to a crawl in a background
 * tab, and tfjs yields through rAF. Switch tabs mid-run and a 60-epoch fit can
 * take an hour. Node has no rAF, so yieldToBrowser returns immediately and the
 * same fit takes a couple of minutes.
 *
 * Writes public/model/asl-model.json + asl-model.weights.bin — the exact path
 * and filenames createRecognizer loads.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSES } from "../src/lib/contract.js";
import {
  DEFAULT_EPOCHS,
  confusionMatrix,
  findWeakClasses,
  holdOut,
  mergeDatasets,
  topConfusions,
  trainModel,
} from "../src/lib/train.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("usage: node scripts/train-node.mjs <capture.json> [more.json ...]");
  process.exit(1);
}

const parsed = files.map((f) => JSON.parse(readFileSync(resolve(root, f), "utf8")));
const { xs, ys, counts, byRecorder } = mergeDatasets(parsed);

console.log(`${xs.length} rows from ${files.length} file(s)`);
for (const [who, n] of Object.entries(byRecorder)) console.log(`  ${who}: ${n}`);

const weak = findWeakClasses(counts);
if (weak.length) {
  console.log(`thin classes: ${weak.map((w) => `${w.label}=${w.count}`).join(", ")}`);
}

const started = Date.now();
const { model, history, shuffled } = await trainModel({
  xs,
  ys,
  epochs: DEFAULT_EPOCHS,
  onEpochEnd: ({ epoch, acc, valAcc }) => {
    if (epoch % 5 === 0 || epoch === 1) {
      console.log(`  epoch ${epoch}/${DEFAULT_EPOCHS}  acc ${acc.toFixed(4)}  val_acc ${valAcc.toFixed(4)}`);
    }
  },
});

const last = history.at(-1);
console.log(`fit done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`final: acc ${last.acc.toFixed(4)}  val_acc ${last.valAcc.toFixed(4)}`);
if (last.valAcc > 0.98) {
  console.log("  val_acc above 0.98 — suspect near-duplicate rows rather than a great model");
}

// Score on the rows fit() held out, not on what it trained against.
const { testXs, testYs } = holdOut(shuffled.xs, shuffled.ys);
const cm = confusionMatrix(model, testXs, testYs);
const total = cm.flat().reduce((a, b) => a + b, 0);
const diagonal = cm.reduce((a, row, i) => a + row[i], 0);
console.log(`held-out accuracy: ${(diagonal / total).toFixed(4)} over ${total} rows`);

const worst = topConfusions(cm, 8);
if (worst.length) {
  console.log("worst confusions:");
  for (const c of worst) console.log(`  ${c.actual} -> ${c.predicted}  ${c.count}`);
}

const outDir = resolve(root, "public/model");
mkdirSync(outDir, { recursive: true });

await model.save({
  async save(artifacts) {
    const weightsFile = "asl-model.weights.bin";
    writeFileSync(
      resolve(outDir, "asl-model.json"),
      JSON.stringify({
        modelTopology: artifacts.modelTopology,
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        // Relative path: tf.loadLayersModel resolves it against the URL the
        // model JSON was fetched from, i.e. /model/.
        weightsManifest: [{ paths: [`./${weightsFile}`], weights: artifacts.weightSpecs }],
      }),
    );
    writeFileSync(resolve(outDir, weightsFile), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
  },
});

console.log(`wrote public/model/asl-model.json + asl-model.weights.bin`);
console.log(`output width ${model.outputs[0].shape.at(-1)} vs CLASSES ${CLASSES.length}`);
