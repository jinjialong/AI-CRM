'use client';

import { FormEvent, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { LeadKeyEvent } from '@/types';

const EVENT_OPTIONS = ['拜访关键人', '方案演示', '报价已发', '进入采购', '发现内部支持者', '确认有竞品'];

export function LeadKeyEventPanel({
  leadId,
  items,
  onRefresh,
}: {
  leadId: number;
  items: LeadKeyEvent[];
  onRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({ event_type: EVENT_OPTIONS[0], note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/leads/${leadId}/key-events`, form);
      setForm({ event_type: EVENT_OPTIONS[0], note: '' });
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存关键事件失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>关键事件</div>

      <form onSubmit={submit} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
          <select value={form.event_type} onChange={(e) => setForm((prev) => ({ ...prev, event_type: e.target.value }))}>
            {EVENT_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <textarea
            rows={3}
            placeholder="补充该关键事件的上下文"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
        </div>
        <div>
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? '保存中...' : '新增关键事件'}
          </button>
        </div>
      </form>

      {error ? (
        <div style={{ marginTop: 12, fontSize: 13, color: '#cf1322' }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--border-soft)',
                borderRadius: 10,
                padding: 14,
                background: '#fafcff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{item.event_type}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(item.event_time).toLocaleString('zh-CN')}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>{item.note || '暂无备注'}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                记录人：{item.created_by_name || '-'}
              </div>
            </div>
          ))
        ) : (
          <div className="muted">暂无关键事件</div>
        )}
      </div>
    </div>
  );
}
