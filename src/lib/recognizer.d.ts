import type { Prediction, Recognizer } from "../types";

export function createRecognizer(opts: {
  onPrediction: (prediction: Prediction) => void;
}): Promise<Recognizer>;
