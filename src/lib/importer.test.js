import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLASSES, NONE_LABEL, NUM_FEATURES, NUM_LANDMARKS } from "./contract.js";
import {
  capPerClass,
  labelFromPath,
  naturalCompare,
  spreadPick,
  looksPreNormalized,
  parseLandmarkCsv,
  synthesizeNone,
  tally,
} from "./importer.js";

describe("labelFromPath", () => {
  it("reads the class from the parent folder, the usual dataset layout", () => {
    assert.equal(labelFromPath("asl_alphabet_train/A/A1.jpg"), "A");
    assert.equal(labelFromPath("train/Y/Y2431.jpg"), "Y");
  });

  it("falls back to the filename for flat datasets", () => {
    assert.equal(labelFromPath("R.png"), "R");
    assert.equal(labelFromPath("dataset/W.jpeg"), "W");
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(labelFromPath("train/ b /b_17.jpg"), "B");
  });

  it("skips J and Z", () => {
    // They are motion letters and not in CLASSES. A dataset's J is a static
    // frame of the start pose, which is just I — importing it poisons I.
    assert.equal(labelFromPath("train/J/J1.jpg"), null);
    assert.equal(labelFromPath("train/Z/Z1.jpg"), null);
  });

  it("skips the classes we do not model", () => {
    for (const folder of ["nothing", "space", "del", "delete", "blank"]) {
      assert.equal(labelFromPath(`train/${folder}/x.jpg`), null, folder);
    }
  });

  it("accepts an explicit NONE folder", () => {
    assert.equal(labelFromPath("train/NONE/x.jpg"), NONE_LABEL);
  });

  it("returns null for anything unrecognised", () => {
    assert.equal(labelFromPath("train/hello/photo01.jpg"), null);
    assert.equal(labelFromPath("train/hello/"), null);
    assert.equal(labelFromPath(""), null);
  });

  it("prefers the parent folder over the filename", () => {
    // Real datasets name files after their class, so the two usually agree.
    // When they disagree the folder is the more reliable signal.
    assert.equal(labelFromPath("train/B/A1.jpg"), "B");
  });

  it("documents the filename fallback's blind spot", () => {
    // An unrecognised parent plus a letter-shaped filename resolves to that
    // letter. Indistinguishable from a genuine flat layout by path alone, so
    // it is accepted deliberately — the import report's per-class counts are
    // what catch a misread layout. Change this test only with that in mind.
    assert.equal(labelFromPath("train/hello/x.jpg"), "X");
  });
});

describe("parseLandmarkCsv", () => {
  const row3 = (label, base) =>
    [label, ...Array.from({ length: NUM_LANDMARKS * 3 }, (_, i) => base + i * 0.001)].join(",");
  const header3 = ["label", ...Array.from({ length: NUM_LANDMARKS * 3 }, (_, i) => `c${i}`)].join(",");

  it("parses a 63-column x,y,z file", () => {
    const { rows, dims } = parseLandmarkCsv([header3, row3("A", 0.1), row3("B", 0.2)].join("\n"));
    assert.equal(dims, 3);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].landmarks.length, NUM_LANDMARKS);
    assert.equal(rows[0].label, "A");
  });

  it("parses a 42-column x,y file and fills z with 0", () => {
    const header2 = ["label", ...Array.from({ length: NUM_LANDMARKS * 2 }, (_, i) => `c${i}`)].join(",");
    const row2 = ["C", ...Array.from({ length: NUM_LANDMARKS * 2 }, (_, i) => i * 0.01)].join(",");
    const { rows, dims } = parseLandmarkCsv([header2, row2].join("\n"));
    assert.equal(dims, 2);
    assert.ok(rows[0].landmarks.every((p) => p.z === 0));
  });

  it("finds the label column under any of its usual names", () => {
    for (const name of ["label", "class", "letter", "target"]) {
      const h = [name, ...Array.from({ length: NUM_LANDMARKS * 3 }, (_, i) => `c${i}`)].join(",");
      assert.doesNotThrow(() => parseLandmarkCsv([h, row3("A", 0.1)].join("\n")), name);
    }
  });

  it("refuses a file with no label column", () => {
    const h = Array.from({ length: NUM_LANDMARKS * 3 + 1 }, (_, i) => `c${i}`).join(",");
    assert.throws(() => parseLandmarkCsv([h, row3("A", 0.1)].join("\n")), /no label column/);
  });

  it("refuses a coordinate count that is not 21 points", () => {
    const h = ["label", "a", "b", "c"].join(",");
    assert.throws(() => parseLandmarkCsv([h, "A,1,2,3"].join("\n")), /coordinate columns/);
  });

  it("skips bad rows by line number instead of failing the file", () => {
    const bad = ["A", ...Array.from({ length: NUM_LANDMARKS * 3 }, () => "oops")].join(",");
    const { rows, skipped } = parseLandmarkCsv([header3, row3("A", 0.1), bad, row3("J", 0.3)].join("\n"));
    assert.equal(rows.length, 1);
    assert.equal(skipped.length, 2); // the non-numeric row and the J row
    assert.ok(skipped.every((s) => typeof s.line === "number" && s.why));
  });
});

describe("looksPreNormalized", () => {
  const at = (x, y) => ({
    landmarks: Array.from({ length: NUM_LANDMARKS }, () => ({ x, y, z: 0 })),
  });

  it("flags data whose wrist already sits at the origin", () => {
    // Our own normalize puts the wrist at exactly (0,0,0). A dataset that has
    // done the same used some other centering and scaling rule, and mixing the
    // two trains fine then fails on camera.
    assert.equal(looksPreNormalized(Array.from({ length: 20 }, () => at(0, 0))), true);
  });

  it("passes raw image-space landmarks", () => {
    assert.equal(looksPreNormalized(Array.from({ length: 20 }, () => at(0.5, 0.6))), false);
  });

  it("is not fooled by a single centred row", () => {
    const rows = [at(0, 0), ...Array.from({ length: 19 }, () => at(0.4, 0.4))];
    assert.equal(looksPreNormalized(rows), false);
  });
});

describe("synthesizeNone", () => {
  const letters = ["A", "B", "C"].map((label, k) => ({
    label,
    features: Array.from({ length: NUM_FEATURES }, (_, i) => (k + 1) * 0.1 + i * 0.001),
  }));

  it("produces the requested number of NONE rows", () => {
    const none = synthesizeNone(letters, 50);
    assert.equal(none.length, 50);
    assert.ok(none.every((s) => s.label === NONE_LABEL));
    assert.ok(none.every((s) => s.features.length === NUM_FEATURES));
    assert.ok(none.every((s) => s.features.every(Number.isFinite)));
  });

  it("never reproduces one of the source letters", () => {
    // A blend that lands on an endpoint would directly contradict that
    // letter's own training rows. Ratios are clamped to [0.25, 0.75].
    const none = synthesizeNone(letters, 200);
    for (const row of none) {
      for (const letter of letters) {
        const identical = row.features.every((v, i) => Math.abs(v - letter.features[i]) < 1e-9);
        assert.equal(identical, false, `blend collapsed onto ${letter.label}`);
      }
    }
  });

  it("stays inside the range spanned by the two endpoints", () => {
    const none = synthesizeNone(letters, 100);
    const lo = Math.min(...letters.flatMap((l) => l.features));
    const hi = Math.max(...letters.flatMap((l) => l.features));
    assert.ok(none.every((s) => s.features.every((v) => v >= lo - 1e-9 && v <= hi + 1e-9)));
  });

  it("is deterministic with an injected rng", () => {
    const seeded = () => {
      let s = 42;
      return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    };
    const a = synthesizeNone(letters, 20, seeded());
    const b = synthesizeNone(letters, 20, seeded());
    assert.deepEqual(a, b);
  });

  it("refuses when there is nothing to blend", () => {
    assert.throws(() => synthesizeNone([], 10), /at least two/);
    assert.throws(() => synthesizeNone([letters[0]], 10), /at least two/);
    // One class repeated is still one class — every pair would be a self-blend.
    const oneClass = [letters[0], { ...letters[0] }];
    assert.throws(() => synthesizeNone(oneClass, 10), /too few distinct classes/);
  });
});

describe("capPerClass", () => {
  const make = (label, n) => Array.from({ length: n }, () => ({ label, features: [] }));

  it("limits each class independently", () => {
    const capped = capPerClass([...make("A", 10), ...make("B", 3)], 5);
    const counts = tally(capped);
    assert.equal(counts.A, 5);
    assert.equal(counts.B, 3);
  });

  it("passes everything through when the cap is zero or absent", () => {
    const all = [...make("A", 10), ...make("B", 3)];
    assert.equal(capPerClass(all, 0).length, 13);
    assert.equal(capPerClass(all, undefined).length, 13);
  });
});

describe("tally", () => {
  it("reports every class, including the empty ones", () => {
    const counts = tally([{ label: "A", features: [] }]);
    assert.equal(Object.keys(counts).length, CLASSES.length);
    assert.equal(counts.A, 1);
    assert.equal(counts.B, 0);
  });
});

describe("naturalCompare", () => {
  it("orders A9 before A10, unlike a plain string sort", () => {
    const files = ["A10.jpg", "A9.jpg", "A100.jpg", "A1.jpg"];
    assert.deepEqual(files.slice().sort(naturalCompare), ["A1.jpg", "A9.jpg", "A10.jpg", "A100.jpg"]);
    // The plain sort is what makes "spread across the session" meaningless.
    assert.notDeepEqual(files.slice().sort(), files.slice().sort(naturalCompare));
  });
});

describe("spreadPick", () => {
  const pool = Array.from({ length: 3000 }, (_, i) => i);

  it("returns everything when the pool is already small enough", () => {
    assert.deepEqual(spreadPick([1, 2, 3], 10), [1, 2, 3]);
    assert.deepEqual(spreadPick([1, 2, 3], 0), [1, 2, 3]);
  });

  it("returns exactly max items", () => {
    assert.equal(spreadPick(pool, 250).length, 250);
  });

  it("reaches the far end of the pool, which taking the first N never does", () => {
    // The whole point: 3000 images per class are consecutive frames of one
    // session, and the first 250 are a couple of seconds of it.
    const picked = spreadPick(pool, 250);
    assert.ok(picked.at(-1) > 2900, `last pick was ${picked.at(-1)}`);
    assert.equal(picked[0], 0);
  });

  it("spaces picks evenly", () => {
    const picked = spreadPick(pool, 250);
    const gaps = picked.slice(1).map((v, i) => v - picked[i]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, "gaps should be uniform");
  });

  it("keeps the pool's order", () => {
    const picked = spreadPick(pool, 100);
    assert.deepEqual(picked, picked.slice().sort((a, b) => a - b));
  });
});
