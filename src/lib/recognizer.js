/**
 * OWNER: Mert (from Phase 2 on)
 *
 * THE ONE FILE THAT CROSSES THE LINE. Aaron imports this and nothing else from
 * the vision half. Its body changes in M5; its signature never does.
 *
 *   createRecognizer({ onPrediction }) -> Promise<{ attach(videoEl), stop() }>
 *
 * onPrediction is called ~30x/sec with:
 *   { letter: "A".."Z" | null, confidence: 0..1, landmarks: [{x,y,z}] | null }
 *
 * Rules (see SOW.md):
 *   1. letter is null when there's no hand OR the winning class is NONE.
 *      The string "NONE" never leaves this file.
 *   2. landmarks are RAW and UNMIRRORED, straight from MediaPipe.
 *      The caller flips x for display: drawX = (1 - point.x) * width
 *   3. landmarks is non-null whenever a hand is detected, even if letter is null.
 */

import { createMockRecognizer } from "./mockRecognizer";

export async function createRecognizer({ onPrediction }) {
  // M5 replaces the body below with:
  //   handTracker -> normalizeLandmarks -> model.predict -> argmax over CLASSES
  //
  // Keep this mock path reachable behind the flag so a half-trained model can
  // never take the demo down. Set VITE_USE_MOCK=1 in .env.local to force it.
  return createMockRecognizer({ onPrediction });
}
