# ASL Fingerspelling Recognizer — Statement of Work

**Repo:** https://github.com/MertHamsioglu/ASLtranslator
**Mert:** vision + ML pipeline · **Aaron:** app shell + UI

The whole split rests on one function signature agreed up front. Aaron builds against a
fake recognizer that emits random letters *and* fake landmarks; Mert builds the real one
behind the same interface. Neither of you is ever blocked, and you never edit the same file.

Call it **fingerspelling recognition**, not ASL translation. ASL is a full language with
movement, two-hand signs, and grammatical facial expressions. A handshape classifier does
the alphabet. Claiming more is the thing Deaf users push back on — and the thing a judge
or reviewer will catch.

---

## The contract (frozen in Phase 0)

```
createRecognizer({ onPrediction }) -> Promise<{ attach(videoEl), stop() }>
```

`onPrediction` is called ~30×/sec with exactly this shape:

```js
{
  letter: one of LETTERS | null, // 24 static letters — no J, no Z. null when no hand
  confidence: 0..1,              // softmax score of the winning class
  landmarks: [{x, y, z}] | null  // 21 points, raw MediaPipe coords, normalized 0..1
}
```

`letter` is one of the 24 values in `LETTERS` from `contract.js`, never an arbitrary A–Z
character. Don't build a 26-slot UI.

Four rules that are part of the contract, not implementation details:

1. **`letter` is `null`** when there's no hand, or when the top class is `NONE`.
   Aaron never sees the string `"NONE"`.
2. **`landmarks` are RAW and UNMIRRORED** — straight from MediaPipe, x/y in 0..1 of the
   video frame. The video element is CSS-flipped for the user; the coordinates are not.
   If Aaron draws a skeleton overlay he flips x himself: `drawX = (1 - point.x) * width`.
   Writing this down now saves an hour of "why is the thumb on the wrong side."
3. **`landmarks` is non-null whenever a hand is detected**, even when `letter` is `null`.
   The overlay should keep drawing during transitions — that's most of what makes it feel alive.
4. **A camera failure must not stop the recognizer.** `createRecognizer` is called and
   `onPrediction` fires whether or not `getUserMedia` succeeded. **`attach()` is simply
   never called** when there's no video feed — so the real recognizer must not assume
   `attach()` always runs, and must not blow up if `stop()` arrives without it. Denied
   permission, no webcam, headless browser: the app still runs on the mock. This is what
   makes "never blocked" true in practice rather than on paper.

Changing this contract requires both of you to agree, in writing, in the same commit.

---

## Phase 0 — DONE ✅

Already committed. Everything below is the record of what exists and why, not a to-do.
Clone, `npm install`, `npm run dev`, and you should see a camera feed with random letters
appearing. Deny the camera prompt and you should *still* see random letters, plus an error
banner — that's rule 4 working. Either way you're ready to start your half.

The goal was that when you split up, **both of you can run the full app end to end** —
real camera, fake brain — with zero missing imports. That is the state of `main` now.

### 0.1 — Stack

Vite 8 + React 19, scaffolded at the repo root (not in a subdirectory) so Vercel and
Netlify find it without configuration. Plus `@mediapipe/tasks-vision` and
`@tensorflow/tfjs`. Lint is `oxlint`, which ships with the Vite React template.

```bash
npm install && npm run dev
```

### 0.2 — Every file both halves import already exists

A stub that returns nothing is not a blocker; a missing file is a red screen on the other
person's laptop. So all of these are on `main` already, stubbed where not yet built:

| File | State | Owner |
| --- | --- | --- |
| `src/lib/contract.js` | done — `LETTERS`, `NONE_LABEL`, `CLASSES`, `NUM_FEATURES`, `NUM_LANDMARKS`, `HAND_CONNECTIONS`, `TARGET_FPS` | **both, frozen** |
| `src/lib/mockRecognizer.js` | done — full working mock | Aaron |
| `src/lib/recognizer.js` | delegates to the mock | Mert |
| `src/lib/handTracker.js` | stub, throws — spec in the file header | Mert (M1) |
| `src/lib/normalize.js` | stub, throws — spec in the file header | Mert (M2) |
| `src/lib/train.js` | `mergeDatasets()` written; fit loop is M4 | Mert (M4) |
| `src/pages/CollectPage.jsx` | placeholder | Mert (M3) |
| `src/pages/TrainPage.jsx` | placeholder | Mert (M4) |
| `src/collect.jsx`, `src/train-page.jsx` | mount-only Vite entries | Mert |
| `collect.html`, `train.html` | Vite entries | Mert |
| `src/App.jsx` | throwaway Phase 0 scaffolding | Aaron |
| `src/index.css` | bare reset + `.phase0` styles to delete | Aaron |
| `src/components/`, `public/model/`, `data/` | empty, `.gitkeep`'d | per ownership map |

Two things in `contract.js` worth knowing about before you go looking for them:

- **`CLASSES`** is the model's output order. The argmax index is meaningless without it.
  Import it in both `train.js` and `recognizer.js`; never retype the list. This is the
  single most bug-prone thing in the project and the constant is the fix.
- **`HAND_CONNECTIONS`** is the 21-point topology as index pairs. Aaron draws the
  skeleton straight off it — no need to go find the landmark diagram.

### 0.3 — The mock is good enough to design against

Written in Phase 0 rather than left to Aaron's first day, because Mert's M5 has to match
its behavior and it's easier to match something that exists. It:

- emits every 33ms
- **holds each letter for 10–20 ticks before switching** — random-every-tick would let
  broken debounce logic pass, which defeats the point
- models **three** states, not two: `LETTER`, `TRANSITION` (hand visible, no letter), and
  `NO_HAND`. `TRANSITION` is the one people forget to simulate and exactly the state the
  commit-lockout logic has to survive.
- **always emits a plausible 21-point `landmarks` array** while a hand is visible, from a
  hardcoded pose with ±0.005 jitter and a small per-letter drift. Without this Aaron
  cannot build the skeleton overlay until Mert finishes M1 — and the overlay is the
  visual identity of the app.
- makes ~1 in 6 letters a low-confidence read, so the 0.7 threshold actually gets exercised

Measured over 15s of ticks: ~69% letter frames, ~24% transition, ~7% no-hand, letter runs
all within 10–20, zero contract violations. Tune the constants if you want a different
mix; keep the shape.

### 0.4 — Multi-page Vite, so Mert never touches `App.jsx`

This is what makes the ownership map airtight. `collect.html` and `train.html` sit at the
repo root as their own Vite entries, wired up in `vite.config.js` under
`build.rollupOptions.input`. Mert's tools live at `localhost:5173/collect.html` and
`/train.html`. Zero edits to `App.jsx`, ever.

The page components live in `src/pages/` and the `.jsx` entries only mount them — a file
that both defines and mounts a component loses fast refresh, and these are the pages Mert
will iterate on most.

### 0.5 — Branches

```bash
git push -u origin main && git push origin mert aaron
```

Add each other as collaborators on GitHub. Both clone. Mert works on `mert`, Aaron on
`aaron`, both PR into `main`.

**Phase 0 exit criterion, already met:** `npm run dev` shows a camera feed with random
letters appearing, `/collect.html` and `/train.html` load clean, `npm run build` emits all
three entries, `npm run lint` is silent.

---

## Phase 1 — Parallel. No coordination required.

### Mert — vision pipeline

**M1 · Landmarks flowing** — `src/lib/handTracker.js`

`getUserMedia({ video: true })`, then:

```js
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
);
const landmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numHands: 1,
});
```

`requestAnimationFrame` loop calling `landmarker.detectForVideo(video, performance.now())`.
You get `result.landmarks[0]` (21 points) and `result.handedness[0]`. Log until stable.

Wrap it as `createHandTracker({ onFrame })` where `onFrame({ landmarks, handedness })` —
same callback shape as the contract so M5 is a thin layer, not a rewrite.

> **The version in that CDN URL must match `package.json`** — currently `1.0.1`. The JS
> loader and the `.wasm` binary are a matched pair, and mixing versions fails at init
> with an error that doesn't mention versions. The header of `handTracker.js` has two
> ways to make this structural instead of remembered, including bundling the wasm through
> Vite so the CDN isn't in the path at all.
>
> `detectForVideo` throws if you pass a timestamp that isn't strictly increasing. Guard
> against duplicate rAF ticks on the same video frame.
>
> The result carries both `handedness` and a deprecated `handednesses`. Use
> `result.handedness[0]`; most tutorials online still show the old one.

**M2 · Normalize** — `src/lib/normalize.js` — 21 points → 63 numbers, position and scale invariant:

1. If handedness is `"Left"`, negate all x **first**
2. Subtract landmark 0 (wrist) from all 21 points
3. Divide every coordinate by the largest absolute value in the set

Step 1 before step 2 — one model handles both hands instead of you collecting double the data.

Test: hold one letter, walk toward and away from the camera. The 63 numbers should barely move.

**M3 · Collect mode** — `src/pages/CollectPage.jsx` — styling irrelevant, Aaron isn't
touching it:

- dropdown to pick a letter (from `CLASSES`, so `NONE` is in the list)
- 3-second countdown, then capture 200 normalized frames
- **rotate and shift your hand slowly during capture** — this is what makes the model
  tolerate real use, and it's the single highest-leverage thing in the whole pipeline
- append to an in-memory array, download as JSON

All 24 static letters, plus a 25th class **`NONE`**: doing nothing, hand resting,
mid-transition garbage, hand half out of frame. Without `NONE` the model confidently
reports random letters the entire time you're moving between signs.

JSON format — agree on it once so merging two people's data is `[].concat()`:

```json
{ "version": 1, "recordedBy": "mert", "samples": [{ "label": "A", "features": [63 numbers] }] }
```

Save as `data/mert-<date>.json` and commit it. Data in git is fine at this size and means
neither of you can lose it.

**M4 · Train** — `src/pages/TrainPage.jsx` + `src/lib/train.js`, in-browser with tfjs, no
Python:

```js
const model = tf.sequential({
  layers: [
    tf.layers.dense({ inputShape: [63], units: 64, activation: "relu" }),
    tf.layers.dropout({ rate: 0.2 }),
    tf.layers.dense({ units: 25, activation: "softmax" }),
  ],
});
model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });
await model.fit(xs, ys, { epochs: 60, validationSplit: 0.2, shuffle: true });
await model.save("downloads://asl-model");
```

Drop `asl-model.json` + `asl-model.weights.bin` into `public/model/`.

Watch **validation** accuracy, not training accuracy. If val is 0.99 you captured 200
near-identical frames and it will not generalize to Aaron's hand.

Also write down the label order you trained with — `CLASSES` from `contract.js`, in that
exact order. An argmax against a differently-ordered array is a silent, maddening bug.

**M5 · Real recognizer** — `src/lib/recognizer.js`:

landmarks → normalize → `model.predict` → argmax → `{ letter, confidence, landmarks }`,
with `letter: null` when the winner is `NONE`.

Keep the mock reachable behind an env flag so a bad model can never take down the demo:

```js
if (import.meta.env.VITE_USE_MOCK === "1") return createMockRecognizer({ onPrediction });
```

### Aaron — app shell + UI

**A1 · Mock first** — already written in Phase 0 and verified against the contract. Read
it before anything else; it's the spec for what your UI will receive. Refine the jitter,
the drift, and the state probabilities until it feels like a real hand entering and
leaving frame.

**A2 · Layout** — `src/App.jsx`, `src/components/*`:

- video preview, mirrored with `transform: scaleX(-1)`
- large live readout of the current letter
- confidence bar
- text output area
- buttons: Copy · Space · Backspace · Clear

Delete the Phase 0 scaffolding in `App.jsx` and the `.phase0` block in `index.css` as you
go — none of it is precious. The one thing worth preserving the shape of is that effect:
create the recognizer once, always `stop()` it in cleanup, and don't let a camera failure
prevent the recognizer from starting (contract rule 4). StrictMode mounts every effect
twice in dev, so an uncleaned recognizer means two intervals racing and a camera light
that won't go off.

**A3 · Commit logic** — this is the real work of your half, and it decides whether the
app feels good or terrible:

- ring buffer of the last 12 predictions
- commit a letter when **≥9 of the last 12 agree** and **mean confidence > 0.7**
- after committing, **lock that letter out** until you've seen `null` or a different
  letter for 6+ consecutive frames

Without the lockout, holding your hand still types `AAAAAAAA`. Everyone hits this. Build
it in from the start, not after you notice.

Put the four numbers (12, 9, 0.7, 6) in one exported config object. Phase 2 tunes them
live and you don't want to be hunting through JSX at that point.

**A4 · Copy** — `await navigator.clipboard.writeText(text)`, swap the label to "Copied"
for 1.5s, revert. Needs HTTPS or localhost — you have both.

**A5 · Design** — free rein, but avoid the default AI-app look (cream background, big
serif, warm orange accent). The subject hands you better material: hand landmark skeletons
are genuinely beautiful line art and the 21-point topology is a strong visual motif.
Build the identity out of that rather than decorating on top of a generic shell.

The mock emits landmarks from day one, so the overlay is buildable immediately. Remember
rule 2 of the contract: flip x yourself, `(1 - point.x) * width`.

**A6 · Deploy early, while it's still the mock.** Vercel or Netlify, connected to `main`.
Getting the camera permission prompt working over real HTTPS on a real domain *before you
have anything to lose* is far less stressful than debugging it on demo day.

---

## Phase 2 — Together again

1. **Mert merges the real `recognizer.js`.** Aaron changes nothing — same import, same
   callback shape. If Aaron has to change a line, the contract was violated.
2. **Both record data.** Two hands, two laptops, two lighting setups. Concatenate the JSON
   files, retrain on the combined set. This single step is the biggest accuracy jump
   available to you — bigger than any architecture change.
3. **Tune the A3 thresholds together against the real model.** The numbers above are
   starting points, not answers.
4. **Test on a third person's hand.** Whatever breaks tells you exactly what to record more of.

---

## Never-blocked rules

- **Merge `main` into your branch every morning.** Two minutes; prevents the week-five
  merge from hell.
- **Never edit a file you don't own.** Need something changed in the other person's file?
  Ask in chat — do not "just fix it."
- **`contract.js` changes require both of you, in one commit, with both names on it.**
- **Push small commits often.** With this split you should hit roughly zero merge conflicts.
- **If you're stuck for more than 30 minutes, switch to a task that isn't blocked.**
  There is always one; that's the entire point of this structure.

## Ownership map

| Path | Owner |
| --- | --- |
| `src/lib/handTracker.js`, `normalize.js`, `train.js` | Mert |
| `src/lib/recognizer.js` | Mert |
| `src/pages/CollectPage.jsx`, `src/pages/TrainPage.jsx` | Mert |
| `src/collect.jsx`, `src/train-page.jsx`, `collect.html`, `train.html` | Mert |
| `public/model/*` | Mert |
| `src/lib/mockRecognizer.js` | Aaron |
| `src/App.jsx`, `src/main.jsx`, `src/components/*`, `src/index.css` | Aaron |
| `index.html` | Aaron |
| `src/lib/contract.js`, `vite.config.js`, `SOW.md` | both, by agreement |
| `data/*.json` | both — additive only, one file each |

## Gotchas worth reading before you start

- **Mirroring.** CSS-flipping the video does not flip the landmark coordinates. Overlay
  drawing has to flip x manually or the skeleton is backwards.
- **M, N, S, T are nearly the same handshape.** They'll be your worst confusions. More
  training data on just those four helps more than more data overall.
- **J and Z need motion.** Ship 24 letters. Add these later by classifying a 15-frame
  sequence instead of a single frame.
- **`delegate: "GPU"` fails on some machines.** Catch it and fall back to `"CPU"` — slower
  but it runs. Better than a blank screen on someone else's laptop.
- **MediaPipe's JS and WASM versions must match.** The npm package is `1.0.1`; a CDN URL
  pinned to any other version fails at init without saying why. Bump both together.
- **Both MediaPipe assets come off a CDN** — 35MB of wasm and a 7MB `.task` model. First
  load on a cold cache is slow, and a dead network means a dead demo. If the venue's wifi
  is a question mark, vendor them before demo day rather than during it.
- **Camera permission is per-origin.** Localhost and your deploy URL prompt separately.
- **React StrictMode double-mounts effects in dev.** Any recognizer, rAF loop, or media
  stream you start in a `useEffect` must be torn down in its cleanup, or you'll get two
  of everything and blame the model for the jitter.
- **Label order.** The argmax index means nothing without the exact `CLASSES` order used
  in training. Import it from `contract.js` in both places; never retype it.
