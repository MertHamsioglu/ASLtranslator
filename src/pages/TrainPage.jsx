/**
 * OWNER: Mert — M4
 *
 * Training tool, rendered at /train.html.
 *
 * What M4 needs to do:
 *   - file picker accepting one or more data/*.json files
 *   - mergeDatasets() from lib/train.js to flatten them
 *   - show per-class counts BEFORE training — a class with 12 samples because
 *     a capture run got interrupted is invisible in the accuracy number and
 *     obvious in the counts
 *   - fit, plot val_acc per epoch, save via "downloads://asl-model"
 *   - move the two output files into public/model/
 *
 * Watch validation accuracy, not training accuracy.
 */

import { CLASSES, NUM_FEATURES } from "../lib/contract";

export default function TrainPage() {
  return (
    <main className="phase0">
      <h1>train</h1>
      <p className="meta">
        Phase 0 stub — Mert, M4. Input {NUM_FEATURES} → dense 64 → dropout 0.2 →
        softmax {CLASSES.length}.
      </p>
      <p className="meta">Blocked on M3 producing data. Nothing to do here yet.</p>
    </main>
  );
}
