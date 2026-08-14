/**
 * OWNER: Mert — M3
 *
 * Data capture tool, rendered at /collect.html. Styling is irrelevant here —
 * Aaron is not looking at this page.
 *
 * What M3 needs to do:
 *   - dropdown of CLASSES (so NONE is selectable — it is a class, not an absence)
 *   - 3 second countdown, then capture 200 normalized frames
 *   - ROTATE AND SHIFT YOUR HAND SLOWLY while it captures. This is the single
 *     highest-leverage thing in the whole pipeline. Frames that all look alike
 *     produce a model that only works when you hold perfectly still.
 *   - append to an in-memory array across letters, then download one JSON
 *
 * Do all 24 letters, then do NONE: hand at rest, hand half out of frame,
 * mid-transition garbage, you scratching your nose. Without NONE the model
 * emits confident random letters the entire time you're moving.
 *
 * File format (agreed in Phase 0 — merging two people's data must be trivial):
 *
 *   {
 *     "version": 1,
 *     "recordedBy": "mert",
 *     "samples": [{ "label": "A", "features": [ ...63 numbers ] }]
 *   }
 *
 * Save as data/<name>-<date>.json and commit it. train.js#mergeDatasets
 * already reads exactly this shape.
 */

import { CLASSES } from "../lib/contract";

const SAMPLES_PER_LETTER = 200;
const COUNTDOWN_SECONDS = 3;

export default function CollectPage() {
  return (
    <main className="phase0">
      <h1>collect</h1>
      <p className="meta">
        Phase 0 stub — Mert, M3. {CLASSES.length} classes ·{" "}
        {SAMPLES_PER_LETTER} frames each · {COUNTDOWN_SECONDS}s countdown.
      </p>
      <p className="meta">
        Build order: handTracker (M1) → normalize (M2) → wire them in here.
      </p>
    </main>
  );
}
