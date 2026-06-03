export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 20,
      }}
    >
      <div>
        <div className="section-title">{title}</div>
        {description ? (
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-muted)' }}>{description}</div>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 10 }}>{actions}</div> : null}
    </div>
  );
}

