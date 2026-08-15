import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMMIT_CONFIG, createCommitter } from "./commit.js";

function fill(committer, letter, n, confidence = 0.9) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(committer.ingest({ letter, confidence }));
  }
  return out;
}

describe("createCommitter", () => {
  it("exports the four Phase-1 knobs", () => {
    assert.equal(COMMIT_CONFIG.windowSize, 12);
    assert.equal(COMMIT_CONFIG.minAgreement, 9);
    assert.equal(COMMIT_CONFIG.minMeanConfidence, 0.7);
    assert.equal(COMMIT_CONFIG.lockoutFrames, 6);
  });

  it("commits when nine of twelve frames agree above 0.7 mean confidence", () => {
    const c = createCommitter();
    const emitted = [];
    for (let i = 0; i < 9; i++) emitted.push(c.ingest({ letter: "A", confidence: 0.85 }));
    for (let i = 0; i < 3; i++) emitted.push(c.ingest({ letter: null, confidence: 0.2 }));
    assert.equal(emitted.filter(Boolean).length, 1);
    assert.equal(emitted.find(Boolean), "A");
  });

  it("does not commit when agreeing-frame mean confidence is 0.7 or below", () => {
    const c = createCommitter();
    const emitted = fill(c, "B", 12, 0.69);
    assert.equal(emitted.filter(Boolean).length, 0);
  });

  it("locks the committed letter until six frames of null or a different letter", () => {
    const c = createCommitter();
    assert.equal(fill(c, "C", 12, 0.95).filter(Boolean).length, 1);
    assert.equal(fill(c, "C", 20, 0.95).filter(Boolean).length, 0);

    fill(c, null, 5, 0);
    assert.equal(fill(c, "C", 12, 0.95).filter(Boolean).length, 0, "five frames is not enough to unlock");

    fill(c, null, 6, 0);
    assert.equal(fill(c, "C", 12, 0.95).filter(Boolean).length, 1);
  });

  it("unlocks after six frames of a different letter", () => {
    const c = createCommitter();
    fill(c, "D", 12, 0.9);
    fill(c, "E", 6, 0.9);
    const next = fill(c, "E", 12, 0.9);
    assert.equal(next.filter(Boolean).length, 1);
    assert.equal(next.find(Boolean), "E");
  });
});
