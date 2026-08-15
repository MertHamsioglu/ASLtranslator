/**
 * OWNER: Aaron — A3
 *
 * Letter commit + lockout. Tuned in Phase 2 against the real model;
 * keep every threshold in COMMIT_CONFIG so that pass is one file.
 */

import type { Prediction } from "../types";

export const COMMIT_CONFIG = Object.freeze({
  windowSize: 12,
  minAgreement: 9,
  minMeanConfidence: 0.7,
  lockoutFrames: 6,
});

export type CommitConfig = typeof COMMIT_CONFIG;

type Frame = {
  letter: string | null;
  confidence: number;
};

export type Committer = {
  ingest: (prediction: Prediction) => string | null;
};

export function createCommitter(config: CommitConfig = COMMIT_CONFIG): Committer {
  const buffer: Frame[] = [];
  let lockedLetter: string | null = null;
  let unlockStreak = 0;

  return {
    ingest(prediction) {
      const letter = prediction?.letter ?? null;
      const confidence = clamp01(prediction?.confidence ?? 0);

      if (lockedLetter !== null) {
        if (letter !== lockedLetter) {
          unlockStreak += 1;
          if (unlockStreak >= config.lockoutFrames) {
            lockedLetter = null;
            unlockStreak = 0;
          }
        } else {
          unlockStreak = 0;
        }
      }

      buffer.push({ letter, confidence });
      if (buffer.length > config.windowSize) buffer.shift();
      if (buffer.length < config.windowSize) return null;

      const counts = new Map<string, number>();
      for (const frame of buffer) {
        if (frame.letter == null) continue;
        counts.set(frame.letter, (counts.get(frame.letter) ?? 0) + 1);
      }

      let winner: string | null = null;
      let votes = 0;
      for (const [candidate, n] of counts) {
        if (n > votes) {
          winner = candidate;
          votes = n;
        }
      }

      if (winner == null || votes < config.minAgreement) return null;
      if (winner === lockedLetter) return null;

      const agreeing = buffer.filter((frame) => frame.letter === winner);
      const mean =
        agreeing.reduce((sum, frame) => sum + frame.confidence, 0) / agreeing.length;
      if (mean <= config.minMeanConfidence) return null;

      lockedLetter = winner;
      unlockStreak = 0;
      return winner;
    },
  };
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
