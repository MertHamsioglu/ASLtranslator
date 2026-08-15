/**
 * Phase 2 prepare: two capture files + a held-out third + a trained model.
 *
 *   node scripts/phase2-prepare.mjs
 *
 * Writes:
 *   data/aaron-phase2.json
 *   data/mert-phase2.json
 *   data/third-phase2.json   (not used for training)
 *   public/model/asl-model.json
 *   public/model/asl-model.weights.bin
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as tf from "@tensorflow/tfjs";
import { CLASSES } from "../src/lib/contract.js";
import { mergeDatasets, trainModel } from "../src/lib/train.js";
import { makeCapture } from "./synthetic-hand.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = 80;
const EPOCHS = 55;

const aaron = makeCapture({ recordedBy: "aaron", seed: 20260815, samplesPerClass: SAMPLES, handednessMix: 0.05 });
const mert = makeCapture({ recordedBy: "mert", seed: 91, samplesPerClass: SAMPLES, handednessMix: 0.45 });
const third = makeCapture({ recordedBy: "third", seed: 777, samplesPerClass: 40, handednessMix: 0.3 });

mkdirSync(resolve(root, "data"), { recursive: true });
writeFileSync(resolve(root, "data/aaron-phase2.json"), JSON.stringify(aaron));
writeFileSync(resolve(root, "data/mert-phase2.json"), JSON.stringify(mert));
writeFileSync(resolve(root, "data/third-phase2.json"), JSON.stringify(third));

const { xs, ys, counts, byRecorder } = mergeDatasets([aaron, mert]);
console.log("recorders", byRecorder);
console.log("counts", counts);

const { model, history } = await trainModel({
  xs,
  ys,
  epochs: EPOCHS,
  onEpochEnd: (e) => {
    if (e.epoch === 1 || e.epoch === EPOCHS || e.epoch % 10 === 0) {
      console.log(
        `epoch ${e.epoch} acc=${e.acc.toFixed(3)} val=${e.valAcc.toFixed(3)}`,
      );
    }
  },
});

const last = history.at(-1);
console.log("final", { acc: last.acc, valAcc: last.valAcc, classes: CLASSES.length });

const modelDir = resolve(root, "public/model");
mkdirSync(modelDir, { recursive: true });

await model.save(
  tf.io.withSaveHandler(async (artifacts) => {
    const body = {
      modelTopology: artifacts.modelTopology,
      format: artifacts.format,
      generatedBy: artifacts.generatedBy,
      convertedBy: artifacts.convertedBy,
      weightsManifest: [
        {
          paths: ["asl-model.weights.bin"],
          weights: artifacts.weightSpecs,
        },
      ],
    };
    writeFileSync(resolve(modelDir, "asl-model.json"), JSON.stringify(body));
    writeFileSync(
      resolve(modelDir, "asl-model.weights.bin"),
      Buffer.from(artifacts.weightData),
    );
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
  }),
);

console.log("wrote public/model/asl-model.json + asl-model.weights.bin");
model.dispose();
