'use client';

import { FormEvent, useState } from 'react';

import { ModalShell } from '@/components/common/modal-shell';
import { api, ApiError } from '@/lib/api';
import { LeadConversation } from '@/types';

type ConversationFormState = {
  source_type: string;
  content: string;
};

const initialForm: ConversationFormState = {
  source_type: '电话',
  content: '',
};

export function LeadConversationPanel({
  leadId,
  items,
  onRefresh,
}: {
  leadId: number;
  items: LeadConversation[];
  onRefresh: () => Promise<void>;
}) {
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState<ConversationFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const closeModal = () => {
    setOpenModal(false);
    setForm(initialForm);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/leads/${leadId}/conversations`, form);
      closeModal();
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存对话记录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteItem = async (item: LeadConversation) => {
    if (!window.confirm('确认删除这条对话记录吗？')) return;
    setDeletingId(item.id);
    setError('');
    try {
      await api.delete(`/leads/conversations/${item.id}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除对话记录失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>对话记录</div>
        <button className="primary-btn" type="button" onClick={() => setOpenModal(true)}>
          新增对话记录
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#fff1f0',
            color: '#cf1322',
            border: '1px solid #ffc1c2',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
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
                <div style={{ fontWeight: 700 }}>{item.source_type}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(item.conversation_time).toLocaleString('zh-CN')}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>{item.content}</div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>记录人：{item.created_by_name || '-'}</div>
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', color: '#cf1322', fontWeight: 600 }}
                  onClick={() => deleteItem(item)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">暂无对话记录</div>
        )}
      </div>

      <ModalShell open={openModal} title="新增对话记录" onClose={closeModal} maxWidth={760}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
            <select value={form.source_type} onChange={(e) => setForm((prev) => ({ ...prev, source_type: e.target.value }))}>
              <option value="电话">电话</option>
              <option value="微信">微信</option>
              <option value="面谈">面谈</option>
              <option value="会议">会议</option>
            </select>
            <textarea
              rows={5}
              placeholder="补充更接近原话的交流内容"
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="secondary-btn" onClick={closeModal}>
              取消
            </button>
            <button className="primary-btn" type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '保存对话记录'}
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
