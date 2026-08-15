/**
 * OWNER: Aaron
 * Typed view of the frozen recognizer contract. Values still come from
 * contract.js; this is the shape the UI is allowed to see.
 */

export type Landmark = {
  x: number;
  y: number;
  z: number;
};

export type Prediction = {
  letter: string | null;
  confidence: number;
  landmarks: Landmark[] | null;
};

export type Recognizer = {
  attach: (videoEl: HTMLVideoElement) => void;
  stop: () => void;
};
