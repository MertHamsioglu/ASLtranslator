/**
 * OWNER: Aaron
 *
 * A fake recognizer that satisfies the contract exactly, so the UI can be
 * built and tuned before the real model exists. Mert's recognizer.js must
 * behave the same way from the caller's point of view.
 *
 * It is deliberately not "random letter every frame" — that would let broken
 * debounce logic pass. It holds a letter for 10-20 ticks, then either switches
 * or drops the hand, which is what real use looks like.
 */

import { LETTERS, TARGET_FPS } from "./contract";

const TICK_MS = Math.round(1000 / TARGET_FPS);

/**
 * One plausible open-hand pose in MediaPipe's coordinate space:
 * x/y normalized 0..1 against the video frame, y=0 at the TOP.
 * Replace with a real logged frame once M1 is running if you want it exact.
 */
const BASE_POSE = [
  { x: 0.50, y: 0.88, z: 0.000 }, // 0  wrist
  { x: 0.42, y: 0.84, z: -0.010 }, // 1  thumb CMC
  { x: 0.36, y: 0.76, z: -0.018 }, // 2  thumb MCP
  { x: 0.32, y: 0.69, z: -0.024 }, // 3  thumb IP
  { x: 0.29, y: 0.62, z: -0.030 }, // 4  thumb TIP
  { x: 0.44, y: 0.62, z: -0.008 }, // 5  index MCP
  { x: 0.42, y: 0.52, z: -0.016 }, // 6  index PIP
  { x: 0.41, y: 0.46, z: -0.022 }, // 7  index DIP
  { x: 0.40, y: 0.40, z: -0.028 }, // 8  index TIP
  { x: 0.51, y: 0.60, z: -0.006 }, // 9  middle MCP
  { x: 0.51, y: 0.49, z: -0.014 }, // 10 middle PIP
  { x: 0.51, y: 0.42, z: -0.020 }, // 11 middle DIP
  { x: 0.51, y: 0.36, z: -0.026 }, // 12 middle TIP
  { x: 0.58, y: 0.61, z: -0.006 }, // 13 ring MCP
  { x: 0.59, y: 0.51, z: -0.014 }, // 14 ring PIP
  { x: 0.60, y: 0.45, z: -0.020 }, // 15 ring DIP
  { x: 0.60, y: 0.39, z: -0.026 }, // 16 ring TIP
  { x: 0.64, y: 0.65, z: -0.004 }, // 17 pinky MCP
  { x: 0.66, y: 0.57, z: -0.010 }, // 18 pinky PIP
  { x: 0.67, y: 0.52, z: -0.016 }, // 19 pinky DIP
  { x: 0.68, y: 0.47, z: -0.022 }, // 20 pinky TIP
];

const JITTER = 0.005;
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Three states, matching what the real pipeline produces:
 *
 *   LETTER      hand present, model confident   -> letter + landmarks
 *   TRANSITION  hand present, class is NONE     -> null letter, landmarks STILL SET
 *   NO_HAND     nothing in frame                -> null letter, null landmarks
 *
 * TRANSITION is the one people forget to simulate, and it's exactly the state
 * the commit-lockout logic has to handle. Keep it.
 */
const STATES = { LETTER: "LETTER", TRANSITION: "TRANSITION", NO_HAND: "NO_HAND" };

function jitterPose(driftX, driftY) {
  return BASE_POSE.map((p) => ({
    x: p.x + driftX + (Math.random() - 0.5) * 2 * JITTER,
    y: p.y + driftY + (Math.random() - 0.5) * 2 * JITTER,
    z: p.z + (Math.random() - 0.5) * 2 * JITTER,
  }));
}

export function createMockRecognizer({ onPrediction }) {
  let state = STATES.LETTER;
  let ticksLeft = randInt(10, 20);
  let letter = pick(LETTERS);
  let baseConfidence = 0.75 + Math.random() * 0.23;
  let driftX = 0;
  let driftY = 0;

  function nextState() {
    if (state === STATES.LETTER) {
      // Most letters are followed by a brief transition; now and then the hand
      // leaves frame. Keep the no-hand stretches short — you want roughly 15%
      // dead frames, enough to exercise the empty state without making the UI
      // unpleasant to develop against.
      if (Math.random() < 0.12) {
        state = STATES.NO_HAND;
        ticksLeft = randInt(10, 25);
      } else {
        state = STATES.TRANSITION;
        ticksLeft = randInt(3, 8);
      }
    } else {
      state = STATES.LETTER;
      ticksLeft = randInt(10, 20);
      letter = pick(LETTERS);
      // ~1 in 6 letters is a low-confidence read, so the 0.7 threshold gets exercised.
      baseConfidence =
        Math.random() < 0.17 ? 0.45 + Math.random() * 0.25 : 0.75 + Math.random() * 0.23;
      driftX = (Math.random() - 0.5) * 0.06;
      driftY = (Math.random() - 0.5) * 0.06;
    }
  }

  function tick() {
    if (--ticksLeft <= 0) nextState();

    if (state === STATES.NO_HAND) {
      onPrediction({ letter: null, confidence: 0, landmarks: null });
      return;
    }

    const landmarks = jitterPose(driftX, driftY);

    if (state === STATES.TRANSITION) {
      // Contract rule 3: landmarks stay non-null while the hand is visible,
      // even though there's no letter to report.
      onPrediction({ letter: null, confidence: 0.2 + Math.random() * 0.2, landmarks });
      return;
    }

    onPrediction({
      letter,
      confidence: Math.min(1, Math.max(0, baseConfidence + (Math.random() - 0.5) * 0.06)),
      landmarks,
    });
  }

  let timer = setInterval(tick, TICK_MS);

  return {
    /** No-op — the mock ignores the video element. Present to match the contract. */
    attach(_videoEl) {},
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
