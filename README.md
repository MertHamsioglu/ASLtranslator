# ASL Fingerspelling Recognizer

Real-time recognition of the 24 static ASL fingerspelling handshapes from a webcam, in the
browser. MediaPipe for hand landmarks, a small TensorFlow.js classifier on top. No server,
no upload — video never leaves the machine.

> **This is fingerspelling recognition, not ASL translation.** ASL is a full language with
> movement, two-hand signs, and grammatical facial expressions. A handshape classifier does
> the alphabet, and J and Z aren't even in it — they require motion. Calling it
> "ASL translation" overstates what it does, and that overstatement is the thing Deaf users
> push back on.

**Status:** working end to end. Both halves of Phase 1 are merged, and a trained
classifier ships in `public/model/` — the app reads letters out of the box.

That classifier scores **90.2% on held-out frames** but was trained entirely on one public
dataset, so **it has never been tested on a live webcam or a second person.** Those are the
two open questions, and they're the ones that decide whether this is actually good. See
[Accuracy](#accuracy). Nothing below marked ⬜ exists yet.

---

## Run it

```bash
npm install && npm run dev
```

| URL | What it is | Owner |
| --- | --- | --- |
| `/` | the app | Aaron |
| `/collect.html` | record your own training data | Mert |
| `/import.html` | convert a downloaded dataset instead | Mert |
| `/train.html` | in-browser model training | Mert |

Deny the camera prompt and the app still runs — you get the mock plus an error banner
rather than a dead page. That's deliberate; see contract rule 4 in [SOW.md](SOW.md).

```bash
npm test        # 66 tests — commit logic, normalization, import, training pipeline
npm run build   # tsc --noEmit, then all four entries
npm run lint    # oxlint
npm run phase2  # generate a synthetic set + model in .phase2/, then score it
```

Training in a browser tab you then switch away from is a trap — Chrome throttles
`requestAnimationFrame` to a crawl in background tabs and tfjs yields through it, so a
60-epoch fit can stall for an hour. Train headlessly instead and it takes about 40 seconds:

```bash
node scripts/train-node.mjs data/your-capture.json
```

---

## Features

Legend: ✅ built · 🔨 next up · ⬜ planned · 💭 after the first working version

### Recognition pipeline

| | Feature | Notes |
| --- | --- | --- |
| ✅ | **Frozen recognizer interface** | `createRecognizer({ onPrediction })` is the only thing crossing between the vision half and the UI half. Swapping the mock for the real model changes no UI code. |
| ✅ | **Mock recognizer** | Three-state model (letter held / hand-in-transition / no hand) emitting letters, confidences, and a jittering 21-point pose. Verified against the contract over 431 ticks with zero violations. |
| ✅ | **Live hand tracking** | MediaPipe `HandLandmarker`, single hand, 21 landmarks at ~30fps off `requestAnimationFrame`. |
| ✅ | **Landmark normalization** | 21 points → 63 numbers invariant to position and distance from camera. Left hands are mirrored into right-hand space so one model covers both. |
| ✅ | **24-letter classifier** | Dense 63 → 64 → dropout 0.2 → softmax 25. Shipped in `public/model/`. |
| ✅ | **`NONE` class** | A 25th class for resting hands and mid-transition garbage. Without it the model reports confident letters continuously while you move between signs. |
| ✅ | **Per-prediction confidence** | Raw softmax score, surfaced to the UI and used by the commit threshold. |
| ✅ | **GPU with CPU fallback** | `delegate: "GPU"` fails outright on some machines; catch and retry on CPU rather than showing a blank screen. |
| ✅ | **Mock escape hatch** | `VITE_USE_MOCK=1` forces the mock even after the model ships, so a bad retrain can't take down a demo. |

### Data collection and training

| | Feature | Notes |
| --- | --- | --- |
| ✅ | **Dataset merge** | `mergeDatasets()` combines captures from multiple people into one training set, validating labels and feature length so a truncated capture run fails loudly instead of silently skewing the model. |
| ✅ | **Versioned capture format** | `{ version, recordedBy, samples: [{ label, features }] }` — agreed up front so merging two laptops' data is one call. |
| ✅ | **Guided capture mode** | Pick a class, 3-second countdown, 200 frames. Prompts you to rotate and shift your hand while recording — the single highest-leverage thing for real-world accuracy. |
| ✅ | **JSON export** | Download a capture session, commit it to `data/`. Small enough that git is the right place for it. |
| ✅ | **In-browser training** | No Python, no separate toolchain. Load one or more capture files, fit, download the model into `public/model/`. |
| ✅ | **Per-class sample counts** | Shown before training starts. A class with 12 samples because a run got interrupted is invisible in the accuracy number and obvious in the counts. |
| ✅ | **Validation-accuracy tracking** | Plotted per epoch. `val_acc` of 0.99 means you captured 200 near-identical frames, not that the model is good. |
| ✅ | **Dataset importer** | `/import.html` converts a downloaded dataset — a folder of images or a raw-landmark CSV — into the same capture format, through the same normalization the live recognizer uses. |
| ✅ | **Padding cascade** | Public datasets crop tight, and MediaPipe's palm detector wants margin. Trying the raw crop, then a 1.8× pad, then 1.3× took detection on the Kaggle set from 53.7% to 89.2%; five classes were at *zero* on the raw crop alone. |
| ✅ | **Spread sampling** | Picks images evenly across each class's whole pool. Datasets are usually consecutive frames from one session, so taking the first N inflates `val_acc` by ~39 points against reality. |
| ✅ | **Synthetic `NONE`** | No image dataset can supply `NONE` — its "nothing" class is empty background, which yields no hand and no row. Blending pairs of letter rows at 25–75% approximates a mid-transition pose. |
| ✅ | **Headless training** | `scripts/train-node.mjs`, same `lib/train.js`. 40 seconds instead of stalling for an hour in a throttled background tab. |
| ✅ | **Run deletion** | Capture is grouped into runs — one press of Record. Delete a fumbled one, undo the last, or clear a whole class, without losing the session. |
| ✅ | **Session autosave** | Runs persist to `localStorage` after each take. A reload — including the hot reload Vite fires when a source file changes — no longer costs you the session. |
| ✅ | **Per-file dataset toggle** | `/train.html` keeps loaded files separate with a checkbox each, so "with or without Aaron's data?" is one click rather than a reload. |

### App and interface

| | Feature | Notes |
| --- | --- | --- |
| ✅ | **Graceful camera failure** | No webcam, denied permission, or a headless browser degrades to a banner. The recognizer still runs. |
| ✅ | **Mirrored video preview** | CSS-flipped so it behaves like a mirror. Landmark coordinates stay unmirrored — the overlay flips `x` itself. |
| ✅ | **Live letter readout** | Large, immediate, showing the current frame's best guess before anything is committed. |
| ✅ | **Confidence meter** | So a hesitant read is visibly different from a certain one. |
| ✅ | **Hand skeleton overlay** | Drawn from the 21-point topology in `contract.js`. Keeps drawing during transitions, when there's no letter to show. |
| ✅ | **Debounced letter commit** | Ring buffer of the last 12 predictions; commit when ≥9 agree and mean confidence clears 0.7. |
| ✅ | **Repeat lockout** | After committing, that letter is locked out until 6+ frames of a different letter or no hand. Without it, holding your hand still types `AAAAAAAA`. |
| ✅ | **Text buffer** | Accumulates committed letters into words. |
| ✅ | **Copy · Space · Backspace · Clear** | Copy swaps to "Copied" for 1.5s and reverts. |
| ✅ | **Visual identity from the topology** | Hand landmark skeletons are genuinely good line art. The design is built out of that rather than decorated on top of a generic shell. |
| 🔨 | **HTTPS deployment** | `vercel.json` and `netlify.toml` are in the repo. Connect the GitHub repo to Vercel or Netlify (camera permissions are per-origin). |

### Later

| | Feature | Notes |
| --- | --- | --- |
| 💭 | **J and Z** | Both require motion. Adding them means classifying a ~15-frame sequence rather than a single frame — a different model, not a bigger one. |
| 💭 | **M / N / S / T disambiguation** | Nearly identical handshapes and the expected worst confusions. More data on just those four beats more data overall. |
| 💭 | **Multi-recorder training set** | Two hands, two laptops, two lighting setups, then retrain on the union. Expected to be the largest single accuracy gain available. |
| 💭 | **Third-party hand testing** | Test on someone who recorded none of the data. Whatever breaks says exactly what to record more of. |
| 💭 | **Offline asset bundling** | MediaPipe pulls ~42MB (wasm + model) from CDNs. Vendoring them removes the network from the demo path. |
| 💭 | **Word suggestions** | Autocomplete over the committed buffer to paper over single-letter misreads. |

---

## Accuracy

The shipped model, trained on 6,500 rows imported from grassknoted/asl-alphabet — 250 per
letter spread across each class's 3,000 frames, plus 500 blended `NONE`:

| measurement | score |
| --- | --- |
| `val_acc` at epoch 60 | 0.944 |
| held-out split from the same import | 0.944 |
| **disjoint frames the import never touched** | **0.902** over 599 images |
| **a live webcam** | **not tested** |
| **a second person** | **not tested** |

Worst confusions are the ones the SOW predicted: U/V, M/N, T/`NONE`, Q/P.

**Only the third row is a real generalization number, and the last two are the ones that
matter.** An earlier version of this import took the first 250 images per class instead of
spreading them, and reported `val_acc` **0.965** while scoring **57.3%** on unseen frames —
V misread as K fifteen times out of fifteen. The dataset is consecutive frames from a
single recording session, so adjacent images are near-duplicates and `validationSplit`
was holding out copies of the training rows. A 39-point lie, invisible from inside the
training run.

Treat any accuracy figure here as provisional until someone points a camera at it.
If it struggles on your hand, a few minutes of your own `/collect.html` recording layered
on top is the fix — [PR #7](https://github.com/MertHamsioglu/ASLtranslator/pull/7)'s
per-file toggle exists to make that comparison one click.

---

## Non-goals

- **Not a translator.** No grammar, no syntax, no non-manual markers.
- **Not two-handed.** Single hand, `numHands: 1`.
- **Not a teaching tool.** It doesn't tell you whether your handshape is correct — only
  which of 24 shapes it most resembles.
- **No accounts, no backend, no telemetry.** Frames are processed and discarded in-page.

## Stack

Vite 8 · React 19 · TypeScript (app shell) · `@mediapipe/tasks-vision` 1.0.1 · `@tensorflow/tfjs` 4 · oxlint

## Layout

```
src/lib/contract.js       shared constants — CLASSES, HAND_CONNECTIONS. Frozen.
src/lib/recognizer.js     the interface between the two halves
src/lib/mockRecognizer.ts fake predictions that satisfy that interface
src/lib/handTracker.js    MediaPipe wrapper — video loop and still-image modes
src/lib/normalize.js      21 landmarks -> 63 invariant features
src/lib/train.js          dataset merge, shuffle, fit, confusion matrix
src/lib/importer.js       dataset conversion: labels, CSV, NONE synthesis, sampling
src/pages/                collect, import and train tools (own Vite entries)
src/components-mert/      charts for those tools — components/ is Aaron's
src/App.tsx               the app
scripts/train-node.mjs    headless training, writes public/model/
scripts/phase2-*.mjs      synthetic scoring harness (npm run phase2)
data/                     captured and imported training sets
public/model/             the trained model the app loads
.phase2/                  gitignored scratch — never let a stand-in model reach public/model/
```

## Working on it

**Read [SOW.md](SOW.md) first.** It carries the recognizer contract, the phase plan, the
ownership map, and the gotchas that will otherwise cost you an afternoon each. The short
version: `createRecognizer` is the only interface between the two halves of this project,
`contract.js` changes need both of us, and nobody edits the other person's files.

Then the build guide for your half:

- **[PHASE1-MERT.md](PHASE1-MERT.md)** — vision pipeline, M1 → M5: pipeline flowcharts,
  MediaPipe setup, normalization, data capture technique, training, and a per-milestone
  acceptance test for each.
