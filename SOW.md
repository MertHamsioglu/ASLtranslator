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
  letter: "A".."Z" | null,      // null when no hand in frame or class is NONE
  confidence: 0..1,              // softmax score of the winning class
  landmarks: [{x, y, z}] | null  // 21 points, raw MediaPipe coords, normalized 0..1
}
```

Three rules that are part of the contract, not implementation details:

1. **`letter` is `null`** when there's no hand, or when the top class is `NONE`.
   Aaron never sees the string `"NONE"`.
2. **`landmarks` are RAW and UNMIRRORED** — straight from MediaPipe, x/y in 0..1 of the
   video frame. The video element is CSS-flipped for the user; the coordinates are not.
   If Aaron draws a skeleton overlay he flips x himself: `drawX = (1 - point.x) * width`.
   Writing this down now saves an hour of "why is the thumb on the wrong side."
3. **`landmarks` is non-null whenever a hand is detected**, even when `letter` is `null`.
   The overlay should keep drawing during transitions — that's most of what makes it feel alive.

Changing this contract requires both of you to agree, in writing, in the same commit.

---

## Phase 0 — Together, ~40 min, one laptop

Do this side by side or on a screen share. It's the only synchronous part. The goal is
that when you split up, **both of you can run the full app end to end** — real camera,
fake brain — with zero missing imports.

### 0.1 — Scaffold in place

The repo already exists and is empty. Scaffold into it directly (note the `.`), so the
repo root is the app root. Vercel and Netlify both expect that.

```bash
cd ~/Desktop/ASLtranslator && npm create vite@latest . -- --template react
```

```bash
npm install && npm install @mediapipe/tasks-vision @tensorflow/tfjs
```

```bash
npm run dev
```

Confirm the default Vite page loads before going further.

### 0.2 — Create every file both halves will import

Create all of these now, even as one-line stubs. A stub that returns nothing is not a
blocker; a missing file is a red screen on the other person's laptop.

| File | Contents at end of Phase 0 | Owner from here on |
| --- | --- | --- |
| `src/lib/contract.js` | `LETTERS`, `NONE_LABEL`, `NUM_FEATURES` — **shared, frozen** | both (by agreement) |
| `src/lib/recognizer.js` | delegates to the mock | Mert |
| `src/lib/mockRecognizer.js` | real working mock (see 0.3) | Aaron |
| `src/lib/handTracker.js` | `export async function createHandTracker() {}` | Mert |
| `src/lib/normalize.js` | `export function normalizeLandmarks() {}` | Mert |
| `src/lib/train.js` | empty | Mert |
| `src/collect.jsx` + `collect.html` | Vite entry, renders "collect mode" | Mert |
| `src/train-page.jsx` + `train.html` | Vite entry, renders "train mode" | Mert |
| `src/components/.gitkeep` | empty | Aaron |
| `public/model/.gitkeep` | empty | Mert |
| `data/.gitkeep` | empty — captured JSON lands here | both |

`src/lib/contract.js`:

```js
export const LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split(""); // 24 — no J, no Z (they need motion)
export const NONE_LABEL = "NONE";
export const CLASSES = [...LETTERS, NONE_LABEL];             // 25 output units
export const NUM_FEATURES = 63;                              // 21 landmarks x (x,y,z)
```

`src/lib/recognizer.js`:

```js
import { createMockRecognizer } from "./mockRecognizer";

export async function createRecognizer({ onPrediction }) {
  return createMockRecognizer({ onPrediction });
}
```

### 0.3 — The mock has to be good enough to design against

Aaron writes this in Phase 0 while Mert watches, because Mert's M5 has to match its
behavior exactly. It must:

- emit at ~33ms via `setInterval`
- **hold each letter for 10–20 ticks before switching** — this is what Aaron's debounce
  logic gets tested against, and random-every-tick would let broken debounce logic pass
- occasionally emit `letter: null` for a stretch of ticks (hand out of frame)
- **always emit a plausible 21-point `landmarks` array** — hardcode one real hand pose
  and add ±0.005 of jitter per frame. Without this, Aaron cannot build the skeleton
  overlay until Mert finishes M1, and the overlay is the visual identity of the app.
- return `{ attach(videoEl) {}, stop() {} }` — `attach` is a no-op, `stop` clears the interval

Grab a real pose to hardcode by logging one frame from MediaPipe later, or just eyeball 21
points in a hand shape now. Either works; refine it when real data exists.

### 0.4 — Multi-page Vite, so Mert never touches `App.jsx`

This is the change that makes the ownership map airtight. Mert's collect and train tools
get their own entry points instead of living behind a route in Aaron's app.

`collect.html` and `train.html` at the repo root, each a copy of `index.html` pointing at
its own script:

```html
<!-- collect.html -->
<!doctype html>
<html><head><meta charset="UTF-8" /><title>collect</title></head>
<body><div id="root"></div><script type="module" src="/src/collect.jsx"></script></body></html>
```

Then in `vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        collect: resolve(__dirname, "collect.html"),
        train: resolve(__dirname, "train.html"),
      },
    },
  },
});
```

Mert's tools live at `localhost:5173/collect.html` and `/train.html`. Zero edits to
`App.jsx`, ever.

### 0.5 — Baseline commit and branches

```bash
git add -A && git commit -m "Phase 0: scaffold, contract, mock recognizer, multi-page entries"
```

```bash
git push -u origin main && git branch mert && git branch aaron && git push origin mert aaron
```

Add each other as collaborators on GitHub. Both clone. Mert works on `mert`, Aaron on
`aaron`, both PR into `main`.

**Phase 0 is done when:** on both laptops, `npm run dev` shows a live camera feed with
random letters appearing, and `/collect.html` loads without erroring.

---

## Phase 1 — Parallel. No coordination required.

### Mert — vision pipeline

**M1 · Landmarks flowing** — `src/lib/handTracker.js`

`getUserMedia({ video: true })`, then:

```js
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
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

> Gotcha: `detectForVideo` throws if you pass a timestamp that isn't strictly increasing.
> Guard against duplicate rAF ticks on the same video frame.

**M2 · Normalize** — `src/lib/normalize.js` — 21 points → 63 numbers, position and scale invariant:

1. If handedness is `"Left"`, negate all x **first**
2. Subtract landmark 0 (wrist) from all 21 points
3. Divide every coordinate by the largest absolute value in the set

Step 1 before step 2 — one model handles both hands instead of you collecting double the data.

Test: hold one letter, walk toward and away from the camera. The 63 numbers should barely move.

**M3 · Collect mode** — `src/collect.jsx` — styling irrelevant, Aaron isn't touching it:

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

**M4 · Train** — `src/train-page.jsx` + `src/lib/train.js`, in-browser with tfjs, no Python:

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

**A1 · Mock first** — already written in Phase 0. Refine the jitter and the null-stretches
until it feels like a real hand entering and leaving frame.

**A2 · Layout** — `src/App.jsx`, `src/components/*`:

- video preview, mirrored with `transform: scaleX(-1)`
- large live readout of the current letter
- confidence bar
- text output area
- buttons: Copy · Space · Backspace · Clear

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
| `src/collect.jsx`, `src/train-page.jsx`, `collect.html`, `train.html` | Mert |
| `src/lib/recognizer.js` | Mert |
| `public/model/*` | Mert |
| `src/lib/mockRecognizer.js` | Aaron |
| `src/App.jsx`, `src/components/*`, `src/index.css` | Aaron |
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
- **Camera permission is per-origin.** Localhost and your deploy URL prompt separately.
- **Label order.** The argmax index means nothing without the exact `CLASSES` order used
  in training. Import it from `contract.js` in both places; never retype it.
