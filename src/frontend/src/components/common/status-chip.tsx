export function StatusChip({ status }: { status: string }) {
  const colorClass =
    status === '跟进中'
      ? 'chip-orange'
      : status === '已转客户'
        ? 'chip-green'
        : 'chip-red';

  return <span className={`chip ${colorClass}`}>{status}</span>;
}
