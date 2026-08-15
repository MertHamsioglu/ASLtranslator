/**
 * OWNER: Mert
 *
 * THE ONE FILE THAT CROSSES THE LINE. Aaron imports this and nothing else from
 * the vision half. Its body changes; its signature never does.
 *
 *   createRecognizer({ onPrediction }) -> Promise<{ attach(videoEl), stop() }>
 *
 * onPrediction is called ~30x/sec with:
 *   { letter: "A".."Y" (no J/Z) | null, confidence: 0..1, landmarks: [{x,y,z}] | null }
 *
 * Rules (see SOW.md):
 *   1. letter is null when there's no hand OR the winning class is NONE.
 *      The string "NONE" never leaves this file.
 *   2. landmarks are RAW and UNMIRRORED, straight from MediaPipe.
 *      The caller flips x for display: drawX = (1 - point.x) * width
 *   3. landmarks is non-null whenever a hand is detected, even if letter is null.
 *   4. attach() may never be called (camera failure). stop() must survive that.
 */

import { CLASSES, NONE_LABEL, NUM_FEATURES } from "./contract";
import { createHandTracker } from "./handTracker";
import { normalizeLandmarks } from "./normalize";
import { createMockRecognizer } from "./mockRecognizer";

const MODEL_URL = "/model/asl-model.json";

/**
 * Anything that goes wrong during setup falls back to the mock rather than
 * throwing. Aaron's App calls this unguarded, and a recognizer that throws is
 * a white screen for him — which is exactly the cross-half blocking this
 * project is structured to avoid. The warnings are deliberately loud.
 */
function fallbackToMock(reason, onPrediction) {
  console.error(
    `%crecognizer: falling back to the MOCK — ${reason}`,
    "font-weight:bold",
    "\nLetters shown are random and mean nothing. Fix the cause or set " +
      "VITE_USE_MOCK=1 in .env.local to silence this.",
  );
  return createMockRecognizer({ onPrediction });
}

/**
 * No classifier yet, but MediaPipe is ready. Overlay tracks a real hand;
 * letter stays null so Aaron's commit buffer does not type garbage.
 */
async function createLiveTrackerRecognizer({ onPrediction, reason }) {
  console.warn(
    `recognizer: no classifier (${reason}). Live landmarks only — letters will not commit until ${MODEL_URL} exists.`,
  );
  try {
    const tracker = await createHandTracker({
      onFrame({ landmarks }) {
        onPrediction({
          letter: null,
          confidence: 0,
          landmarks: landmarks ?? null,
        });
      },
    });
    return {
      attach(videoEl) {
        tracker.attach(videoEl);
      },
      stop() {
        tracker.stop();
      },
    };
  } catch (err) {
    return fallbackToMock(
      `no model, and hand tracker failed to start (${err.message})`,
      onPrediction,
    );
  }
}

export async function createRecognizer({ onPrediction }) {
  // Demo-day insurance: a bad retrain can never take the app down.
  if (import.meta.env.VITE_USE_MOCK === "1") {
    console.info("recognizer: VITE_USE_MOCK=1, using the mock deliberately");
    return createMockRecognizer({ onPrediction });
  }

  // Skip the tfjs download when there is nothing to load. HEAD is not
  // reliable on every static host, so a cheap GET is the existence check.
  try {
    const probe = await fetch(MODEL_URL, { cache: "no-store" });
    if (!probe.ok) {
      return createLiveTrackerRecognizer({
        onPrediction,
        reason: `${MODEL_URL} → ${probe.status}`,
      });
    }
  } catch (err) {
    return createLiveTrackerRecognizer({
      onPrediction,
      reason: `could not reach ${MODEL_URL} (${err.message})`,
    });
  }

  // Dynamic import so tfjs (~875kB) is code-split out of the initial bundle.
  // Aaron's shell paints before this downloads.
  const tf = await import("@tensorflow/tfjs");

  let model;
  try {
    model = await tf.loadLayersModel(MODEL_URL);
  } catch (err) {
    return createLiveTrackerRecognizer({
      onPrediction,
      reason: `tf.loadLayersModel failed (${err.message})`,
    });
  }

  // Sanity-check the model against the contract rather than discovering a
  // mismatch as garbage predictions. A model trained on a different CLASSES
  // list is the single most confusing failure mode in this project.
  const outputUnits = model.outputs[0].shape.at(-1);
  if (outputUnits !== CLASSES.length) {
    model.dispose();
    return fallbackToMock(
      `model outputs ${outputUnits} classes but contract.js has ${CLASSES.length}. ` +
        "It was trained against a different label list — retrain it.",
      onPrediction,
    );
  }

  // Warm up so the first real frame isn't a several-hundred-ms stall.
  tf.tidy(() => model.predict(tf.zeros([1, NUM_FEATURES])).dataSync());

  let loggedFrameError = false;

  let tracker;
  try {
    tracker = await createHandTracker({
      onFrame({ landmarks, handedness }) {
        if (!landmarks) {
          onPrediction({ letter: null, confidence: 0, landmarks: null });
          return;
        }

        let scores;
        try {
          const features = normalizeLandmarks(landmarks, handedness);
          // tf.tidy is NOT optional here. This runs 30x/sec and every tensor
          // is an allocation tfjs will not collect for you — without it the
          // tab climbs memory and dies, looking like a perf problem, not a
          // leak. Check tf.memory().numTensors stays flat.
          scores = tf.tidy(() =>
            model.predict(tf.tensor2d([features], [1, NUM_FEATURES])).dataSync(),
          );
        } catch (err) {
          if (!loggedFrameError) {
            console.error("recognizer: prediction failed, emitting nulls:", err);
            loggedFrameError = true; // once, not 30x/sec
          }
          onPrediction({ letter: null, confidence: 0, landmarks });
          return;
        }

        let best = 0;
        for (let i = 1; i < scores.length; i++) {
          if (scores[i] > scores[best]) best = i;
        }
        const label = CLASSES[best];

        onPrediction({
          // Rule 1: NONE becomes null. Aaron never sees the string.
          letter: label === NONE_LABEL ? null : label,
          confidence: scores[best],
          // Rule 3 + rule 2: still present, still raw and unmirrored.
          landmarks,
        });
      },
    });
  } catch (err) {
    model.dispose();
    return fallbackToMock(`hand tracker failed to start (${err.message})`, onPrediction);
  }

  return {
    attach(videoEl) {
      tracker.attach(videoEl);
    },
    stop() {
      // Rule 4: reachable without attach() ever having been called.
      tracker.stop();
      model.dispose();
    },
  };
}
