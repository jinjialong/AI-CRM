'use client';

export function ModalShell({
  open,
  title,
  onClose,
  children,
  maxWidth = 720,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid var(--border-soft)',
              background: '#fff',
              color: 'var(--text-muted)',
              fontSize: 20,
              lineHeight: '40px',
              textAlign: 'center',
              boxShadow: '0 6px 14px rgba(15, 23, 42, 0.06)',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 20 }}>{children}</div>
      </div>
    </div>
  );
}
