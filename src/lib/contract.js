/**
 * SHARED CONTRACT — owned by Mert and Aaron jointly.
 *
 * Changing anything in this file requires both of you to agree, in one commit,
 * with both names on it. Everything else in src/lib is single-owner.
 *
 * See SOW.md for the full contract and the reasoning behind each rule.
 */

/** The 24 static letters. J and Z are excluded — they require motion. */
export const LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split("");

/**
 * The 25th class: no hand, resting hand, mid-transition garbage.
 * Without it the model confidently reports random letters while you move
 * between signs. This label never crosses the recognizer boundary — when
 * NONE wins, the recognizer emits `letter: null`.
 */
export const NONE_LABEL = "NONE";

/**
 * Model output order. The argmax index is meaningless without this exact
 * ordering, so both train.js and recognizer.js import it from here rather
 * than retyping the list. This is the single most bug-prone thing in the
 * project and this constant is the fix.
 */
export const CLASSES = [...LETTERS, NONE_LABEL];

/** 21 landmarks x (x, y, z) = the model's input width. */
export const NUM_FEATURES = 63;

/** MediaPipe always returns exactly this many points per hand. */
export const NUM_LANDMARKS = 21;

/**
 * The 21-point topology, as index pairs. Aaron draws the skeleton overlay
 * from this; Mert gets it for free in debug views.
 *
 * Landmark indices:
 *   0        wrist
 *   1-4      thumb   (CMC, MCP, IP, TIP)
 *   5-8      index   (MCP, PIP, DIP, TIP)
 *   9-12     middle  (MCP, PIP, DIP, TIP)
 *   13-16    ring    (MCP, PIP, DIP, TIP)
 *   17-20    pinky   (MCP, PIP, DIP, TIP)
 */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],           // index
  [5, 9], [9, 10], [10, 11], [11, 12],      // middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [0, 17],                                  // palm base
];

/**
 * Target callback rate, in Hz. Both the mock and the real recognizer aim for
 * this. Aaron's ring-buffer sizes are expressed in frames, so this is what
 * turns them into wall-clock time (12 frames ~= 400ms).
 */
export const TARGET_FPS = 30;
