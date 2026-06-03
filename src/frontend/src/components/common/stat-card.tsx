export function StatCard({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="metric-tile" style={{ background: color }}>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{hint}</div>
    </div>
  );
}

