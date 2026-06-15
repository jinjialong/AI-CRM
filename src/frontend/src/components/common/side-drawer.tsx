'use client';

export function SideDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  width = 460,
  leading,
  zIndex = 1100,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  leading?: React.ReactNode;
  zIndex?: number;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.24)',
        zIndex,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: width,
          borderRadius: 0,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          boxShadow: '-18px 0 40px rgba(15, 23, 42, 0.12)',
          overflowY: 'auto',
          padding: 24,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {leading ? <div style={{ flexShrink: 0 }}>{leading}</div> : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{title}</div>
                {subtitle ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: '1px solid var(--border-soft)',
              background: '#fff',
              color: 'var(--text-muted)',
              fontSize: 20,
              lineHeight: '36px',
            }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
