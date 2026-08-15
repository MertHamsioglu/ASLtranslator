export default function ConfidenceMeter({ value }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="meter"
      role="meter"
      aria-label="Prediction confidence"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
