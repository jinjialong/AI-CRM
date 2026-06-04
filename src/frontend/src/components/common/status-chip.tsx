export function StatusChip({ status }: { status: string }) {
  const colorClass =
    status === '跟进中'
      ? 'chip-orange'
      : status === '必胜'
        ? 'chip-green'
        : status === '大概率'
          ? 'chip-blue'
          : status === '高风险'
            ? 'chip-red'
            : status === '已丢弃'
              ? 'chip-red'
              : status === '已转客户'
                ? 'chip-green'
                : status === '无效'
          ? 'chip-red'
          : 'chip-blue';

  return <span className={`chip ${colorClass}`}>{status}</span>;
}
