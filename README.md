# ASL Fingerspelling Recognizer

Real-time recognition of the 24 static ASL fingerspelling handshapes from a webcam, in the
browser. MediaPipe for hand landmarks, a small tfjs classifier on top, no server.

This is **fingerspelling recognition, not ASL translation**. ASL is a full language with
movement, two-hand signs, and grammatical facial expressions. A handshape classifier does
the alphabet, and J and Z aren't in it — they require motion.

## Run it

```bash
npm install && npm run dev
```

| URL | What it is | Owner |
| --- | --- | --- |
| `/` | the app | Aaron |
| `/collect.html` | training-data capture | Mert |
| `/train.html` | in-browser model training | Mert |

Currently running on a mock recognizer that emits random letters and a jittering hand
pose. It satisfies the real contract exactly, so the UI can be built and tuned before the
model exists. The app runs with no camera too — you get the mock and an error banner
instead of a dead page.

## Working on it

**Read [SOW.md](SOW.md) first.** It has the recognizer contract, the phase plan, the
ownership map, and the gotchas. The short version: `createRecognizer` is the only
interface between the two halves of this project, and nobody edits the other person's
files.

```bash
npm run build   # all three entries
npm run lint    # oxlint
```
