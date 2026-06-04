'use client';

import { FormEvent, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { OPPORTUNITY_STAGE_OPTIONS, OPPORTUNITY_STATUS_OPTIONS } from '@/lib/crm-options';
import { Opportunity, UserInfo } from '@/types';

type OpportunityFormState = {
  name: string;
  amount: string;
  stage: string;
  status: string;
  expected_close_date: string;
  owner_id: string;
  notes: string;
};

function buildForm(users: UserInfo[], opportunity?: Opportunity): OpportunityFormState {
  return {
    name: opportunity?.name || '',
    amount: opportunity?.amount != null ? String(opportunity.amount) : '',
    stage: opportunity?.stage || OPPORTUNITY_STAGE_OPTIONS[0],
    status: opportunity?.status || OPPORTUNITY_STATUS_OPTIONS[0],
    expected_close_date: opportunity?.expected_close_date || '',
    owner_id: String(opportunity?.owner_id || users[0]?.id || ''),
    notes: opportunity?.notes || '',
  };
}

export function OpportunityTab({
  customerId,
  opportunities,
  users,
  onSuccess,
}: {
  customerId: number;
  opportunities: Opportunity[];
  users: UserInfo[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<OpportunityFormState>(() => buildForm(users));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState<OpportunityFormState>(() => buildForm(users));
  const [submitting, setSubmitting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!form.owner_id && users.length) {
      setForm((prev) => ({ ...prev, owner_id: String(users[0].id) }));
    }
  }, [form.owner_id, users]);

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/customers/${customerId}/opportunities`, {
        ...form,
        amount: form.amount ? Number(form.amount) : null,
        owner_id: Number(form.owner_id),
        expected_close_date: form.expected_close_date || null,
      });
      setForm(buildForm(users));
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存商机失败');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: Opportunity) => {
    setEditingId(item.id);
    setEditingForm(buildForm(users, item));
    setError('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    setError('');
    try {
      await api.patch(`/opportunities/${editingId}`, {
        ...editingForm,
        amount: editingForm.amount ? Number(editingForm.amount) : null,
        owner_id: Number(editingForm.owner_id),
        expected_close_date: editingForm.expected_close_date || null,
      });
      setEditingId(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新商机失败');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form className="card" style={{ padding: 18 }} onSubmit={submitCreate}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增商机</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <input
            placeholder="商机名称"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            placeholder="商机金额"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
          <select value={form.stage} onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}>
            {OPPORTUNITY_STAGE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
            {OPPORTUNITY_STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
          />
          <select value={form.owner_id} onChange={(e) => setForm((prev) => ({ ...prev, owner_id: e.target.value }))}>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <textarea
            rows={4}
            placeholder="备注"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            style={{ gridColumn: '1 / -1' }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? '保存中...' : '保存商机'}
          </button>
        </div>
      </form>

      {error ? <div style={{ fontSize: 13, color: '#cf1322' }}>{error}</div> : null}

      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>商机列表</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {opportunities.length ? (
            opportunities.map((item) => {
              const editing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 10,
                    border: '1px solid var(--border-soft)',
                    padding: 14,
                    background: '#fafcff',
                  }}
                >
                  {editing ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        <input
                          value={editingForm.name}
                          onChange={(e) => setEditingForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        <input
                          value={editingForm.amount}
                          onChange={(e) => setEditingForm((prev) => ({ ...prev, amount: e.target.value }))}
                        />
                        <select
                          value={editingForm.stage}
                          onChange={(e) => setEditingForm((prev) => ({ ...prev, stage: e.target.value }))}
                        >
                          {OPPORTUNITY_STAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <select
                          value={editingForm.status}
                          onChange={(e) => setEditingForm((prev) => ({ ...prev, status: e.target.value }))}
                        >
                          {OPPORTUNITY_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={editingForm.expected_close_date}
                          onChange={(e) =>
                            setEditingForm((prev) => ({ ...prev, expected_close_date: e.target.value }))
                          }
                        />
                        <select
                          value={editingForm.owner_id}
                          onChange={(e) => setEditingForm((prev) => ({ ...prev, owner_id: e.target.value }))}
                        >
                          {users.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={3}
                        value={editingForm.notes}
                        onChange={(e) => setEditingForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="primary-btn" type="button" onClick={saveEdit} disabled={savingEdit}>
                          {savingEdit ? '保存中...' : '保存修改'}
                        </button>
                        <button className="secondary-btn" type="button" onClick={() => setEditingId(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.status}</div>
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            style={{
                              color: 'var(--blue)',
                              background: 'transparent',
                              border: 'none',
                              fontWeight: 600,
                            }}
                          >
                            编辑
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                        阶段：{item.stage}　负责人：{item.owner_name || '-'}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7 }}>
                        金额：{item.amount ?? '-'}　预计成交：{item.expected_close_date || '-'}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-normal)' }}>
                        {item.notes || '暂无备注'}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="muted">暂无商机</div>
          )}
        </div>
      </div>
    </div>
  );
}
