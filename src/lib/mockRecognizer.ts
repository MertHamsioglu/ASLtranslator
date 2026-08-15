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
import type { Landmark, Prediction, Recognizer } from "../types";

const TICK_MS = Math.round(1000 / TARGET_FPS);

const BASE_POSE: Landmark[] = [
  { x: 0.50, y: 0.88, z: 0.000 },
  { x: 0.42, y: 0.84, z: -0.010 },
  { x: 0.36, y: 0.76, z: -0.018 },
  { x: 0.32, y: 0.69, z: -0.024 },
  { x: 0.29, y: 0.62, z: -0.030 },
  { x: 0.44, y: 0.62, z: -0.008 },
  { x: 0.42, y: 0.52, z: -0.016 },
  { x: 0.41, y: 0.46, z: -0.022 },
  { x: 0.40, y: 0.40, z: -0.028 },
  { x: 0.51, y: 0.60, z: -0.006 },
  { x: 0.51, y: 0.49, z: -0.014 },
  { x: 0.51, y: 0.42, z: -0.020 },
  { x: 0.51, y: 0.36, z: -0.026 },
  { x: 0.58, y: 0.61, z: -0.006 },
  { x: 0.59, y: 0.51, z: -0.014 },
  { x: 0.60, y: 0.45, z: -0.020 },
  { x: 0.60, y: 0.39, z: -0.026 },
  { x: 0.64, y: 0.65, z: -0.004 },
  { x: 0.66, y: 0.57, z: -0.010 },
  { x: 0.67, y: 0.52, z: -0.016 },
  { x: 0.68, y: 0.47, z: -0.022 },
];

const JITTER = 0.005;
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("pick() on empty array");
  return item;
}

const STATES = { LETTER: "LETTER", TRANSITION: "TRANSITION", NO_HAND: "NO_HAND" } as const;
type MockState = (typeof STATES)[keyof typeof STATES];

function jitterPose(driftX: number, driftY: number): Landmark[] {
  return BASE_POSE.map((p) => ({
    x: p.x + driftX + (Math.random() - 0.5) * 2 * JITTER,
    y: p.y + driftY + (Math.random() - 0.5) * 2 * JITTER,
    z: p.z + (Math.random() - 0.5) * 2 * JITTER,
  }));
}

export function createMockRecognizer({
  onPrediction,
}: {
  onPrediction: (prediction: Prediction) => void;
}): Recognizer {
  let state: MockState = STATES.LETTER;
  let ticksLeft = randInt(10, 20);
  let letter = pick(LETTERS as string[]);
  let baseConfidence = 0.75 + Math.random() * 0.23;
  let driftX = 0;
  let driftY = 0;

  function nextState() {
    if (state === STATES.LETTER) {
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
      letter = pick(LETTERS as string[]);
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
      onPrediction({ letter: null, confidence: 0.2 + Math.random() * 0.2, landmarks });
      return;
    }

    onPrediction({
      letter,
      confidence: Math.min(1, Math.max(0, baseConfidence + (Math.random() - 0.5) * 0.06)),
      landmarks,
    });
  }

  let timer: ReturnType<typeof setInterval> | null = setInterval(tick, TICK_MS);

  return {
    attach(_videoEl: HTMLVideoElement) {},
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
