'use client';

import { LeadAnalysisCurrent } from '@/types';

export function LeadAnalysisDashboard({
  current,
  onRebuild,
  rebuilding,
}: {
  current: LeadAnalysisCurrent | null;
  onRebuild: () => Promise<void>;
  rebuilding: boolean;
}) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>销售分析仪表盘</div>
        <button className="secondary-btn" onClick={onRebuild} disabled={rebuilding}>
          {rebuilding ? '分析中...' : '重新分析'}
        </button>
      </div>

      {!current ? (
        <div className="muted" style={{ marginTop: 14 }}>
          暂无分析结果，先录入对话记录或关键事件后再分析。
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 16,
              padding: '18px 20px',
              borderRadius: 12,
              background: '#f3f9ff',
              display: 'flex',
              gap: 28,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#1677ff', lineHeight: 1 }}>
                {current.score}
              </span>
              <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>/100</span>
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-strong)' }}>
              完成度 {current.completed_dimension_count}/{current.total_dimension_count}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              上次分析 {new Date(current.analyzed_at).toLocaleString('zh-CN')}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {current.dimensions.map((item) => (
              <div
                key={item.code}
                style={{
                  border: item.matched ? '1px solid #91caff' : '1px solid var(--border-soft)',
                  borderRadius: 10,
                  padding: 14,
                  background: item.matched ? '#f6fbff' : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: item.matched ? '#1677ff' : 'var(--text-muted)' }}>
                    {item.evidence_count} 条
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  {item.evidences[0] || '暂无证据'}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 8,
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              color: '#ad6800',
              fontSize: 13,
            }}
          >
            Next Best Action：{current.next_best_action}
          </div>
        </>
      )}
    </div>
  );
}
