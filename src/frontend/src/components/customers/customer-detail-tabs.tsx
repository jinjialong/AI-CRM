'use client';

import { FormEvent, useMemo, useState } from 'react';

import { ModalShell } from '@/components/common/modal-shell';
import { api, ApiError } from '@/lib/api';
import { OPPORTUNITY_STAGE_OPTIONS, OPPORTUNITY_STATUS_OPTIONS } from '@/lib/crm-options';
import { CommunicationNote, Contact, Opportunity, UserInfo, VisitRecord } from '@/types';

type TabKey = 'contacts' | 'visits' | 'notes' | 'opportunities';

type ContactFormState = {
  name: string;
  phone: string;
  job_title: string;
  wechat: string;
  email: string;
  is_primary: boolean;
  notes: string;
};

type VisitFormState = {
  visit_time: string;
  visit_method: string;
  opportunity_id: string;
  participants: string;
  content: string;
  conclusion: string;
  next_plan: string;
};

type NoteFormState = {
  communication_time: string;
  method: string;
  opportunity_id: string;
  counterpart: string;
  content: string;
  todo_items: string;
};

type OpportunityFormState = {
  name: string;
  amount: string;
  stage: string;
  status: string;
  expected_close_date: string;
  owner_id: string;
  notes: string;
};

type ModalState =
  | { kind: 'contacts'; item?: Contact | null }
  | { kind: 'visits'; item?: VisitRecord | null }
  | { kind: 'notes'; item?: CommunicationNote | null }
  | { kind: 'opportunities'; item?: Opportunity | null }
  | null;

const VISIT_METHOD_OPTIONS = ['上门', '线上', '电话', '其他'];
const NOTE_METHOD_OPTIONS = ['电话', '微信', '面谈', '其他'];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toApiDateTimeValue(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function buildContactForm(item?: Contact | null): ContactFormState {
  return {
    name: item?.name || '',
    phone: item?.phone || '',
    job_title: item?.job_title || '',
    wechat: item?.wechat || '',
    email: item?.email || '',
    is_primary: item?.is_primary ?? true,
    notes: item?.notes || '',
  };
}

function buildVisitForm(item?: VisitRecord | null): VisitFormState {
  return {
    visit_time: toDateTimeLocalValue(item?.visit_time),
    visit_method: item?.visit_method || VISIT_METHOD_OPTIONS[0],
    opportunity_id: item?.opportunity_id ? String(item.opportunity_id) : '',
    participants: item?.participants || '',
    content: item?.content || '',
    conclusion: item?.conclusion || '',
    next_plan: item?.next_plan || '',
  };
}

function buildNoteForm(item?: CommunicationNote | null): NoteFormState {
  return {
    communication_time: toDateTimeLocalValue(item?.communication_time),
    method: item?.method || NOTE_METHOD_OPTIONS[0],
    opportunity_id: item?.opportunity_id ? String(item.opportunity_id) : '',
    counterpart: item?.counterpart || '',
    content: item?.content || '',
    todo_items: item?.todo_items || '',
  };
}

function buildOpportunityForm(users: UserInfo[], item?: Opportunity | null): OpportunityFormState {
  return {
    name: item?.name || '',
    amount: item?.amount != null ? String(item.amount) : '',
    stage: item?.stage || OPPORTUNITY_STAGE_OPTIONS[0],
    status: item?.status || OPPORTUNITY_STATUS_OPTIONS[0],
    expected_close_date: item?.expected_close_date || '',
    owner_id: String(item?.owner_id || users[0]?.id || ''),
    notes: item?.notes || '',
  };
}

export function CustomerDetailTabs({
  customerId,
  contacts,
  visits,
  notes,
  opportunities,
  users,
  onSuccess,
}: {
  customerId: number;
  contacts: Contact[];
  visits: VisitRecord[];
  notes: CommunicationNote[];
  opportunities: Opportunity[];
  users: UserInfo[];
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('contacts');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>(buildContactForm());
  const [visitForm, setVisitForm] = useState<VisitFormState>(buildVisitForm());
  const [noteForm, setNoteForm] = useState<NoteFormState>(buildNoteForm());
  const [opportunityForm, setOpportunityForm] = useState<OpportunityFormState>(() => buildOpportunityForm(users));
  const [submitting, setSubmitting] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [error, setError] = useState('');

  const tabs = useMemo<Array<{ key: TabKey; label: string; createLabel: string }>>(
    () => [
      { key: 'contacts', label: '联系人', createLabel: '新建联系人' },
      { key: 'visits', label: '拜访记录', createLabel: '新建拜访记录' },
      { key: 'notes', label: '沟通纪要', createLabel: '新建沟通纪要' },
      { key: 'opportunities', label: '商机', createLabel: '新建商机' },
    ],
    []
  );

  const activeTabMeta = tabs.find((item) => item.key === activeTab) || tabs[0];

  const openCreate = () => {
    setError('');
    if (activeTab === 'contacts') {
      setContactForm(buildContactForm());
      setModalState({ kind: 'contacts', item: null });
      return;
    }
    if (activeTab === 'visits') {
      setVisitForm(buildVisitForm());
      setModalState({ kind: 'visits', item: null });
      return;
    }
    if (activeTab === 'notes') {
      setNoteForm(buildNoteForm());
      setModalState({ kind: 'notes', item: null });
      return;
    }
    setOpportunityForm(buildOpportunityForm(users));
    setModalState({ kind: 'opportunities', item: null });
  };

  const openEdit = (kind: TabKey, item: Contact | VisitRecord | CommunicationNote | Opportunity) => {
    setError('');
    if (kind === 'contacts') {
      setContactForm(buildContactForm(item as Contact));
      setModalState({ kind, item: item as Contact });
      return;
    }
    if (kind === 'visits') {
      setVisitForm(buildVisitForm(item as VisitRecord));
      setModalState({ kind, item: item as VisitRecord });
      return;
    }
    if (kind === 'notes') {
      setNoteForm(buildNoteForm(item as CommunicationNote));
      setModalState({ kind, item: item as CommunicationNote });
      return;
    }
    setOpportunityForm(buildOpportunityForm(users, item as Opportunity));
    setModalState({ kind, item: item as Opportunity });
  };

  const closeModal = () => {
    setModalState(null);
    setError('');
  };

  const submitContact = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (modalState?.item) {
        await api.patch(`/contacts/${modalState.item.id}`, contactForm);
      } else {
        await api.post(`/customers/${customerId}/contacts`, contactForm);
      }
      closeModal();
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存联系人失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitVisit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...visitForm,
        visit_time: toApiDateTimeValue(visitForm.visit_time),
        opportunity_id: visitForm.opportunity_id ? Number(visitForm.opportunity_id) : null,
      };
      if (modalState?.item) {
        await api.patch(`/visits/${modalState.item.id}`, payload);
      } else {
        await api.post(`/customers/${customerId}/visits`, payload);
      }
      closeModal();
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存拜访记录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...noteForm,
        communication_time: toApiDateTimeValue(noteForm.communication_time),
        opportunity_id: noteForm.opportunity_id ? Number(noteForm.opportunity_id) : null,
      };
      if (modalState?.item) {
        await api.patch(`/notes/${modalState.item.id}`, payload);
      } else {
        await api.post(`/customers/${customerId}/notes`, payload);
      }
      closeModal();
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存沟通纪要失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitOpportunity = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...opportunityForm,
        amount: opportunityForm.amount ? Number(opportunityForm.amount) : null,
        owner_id: Number(opportunityForm.owner_id),
        expected_close_date: opportunityForm.expected_close_date || null,
      };
      if (modalState?.item) {
        await api.patch(`/opportunities/${modalState.item.id}`, payload);
      } else {
        await api.post(`/customers/${customerId}/opportunities`, payload);
      }
      closeModal();
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存商机失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteItem = async (kind: TabKey, id: number, title: string) => {
    const confirmed = window.confirm(`确认删除“${title}”吗？`);
    if (!confirmed) return;
    const deletingId = `${kind}-${id}`;
    setDeletingKey(deletingId);
    setError('');
    try {
      if (kind === 'contacts') {
        await api.delete(`/contacts/${id}`);
      }
      if (kind === 'visits') {
        await api.delete(`/visits/${id}`);
      }
      if (kind === 'notes') {
        await api.delete(`/notes/${id}`);
      }
      if (kind === 'opportunities') {
        await api.delete(`/opportunities/${id}`);
      }
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败');
    } finally {
      setDeletingKey('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                className={active ? 'primary-btn' : 'secondary-btn'}
                style={active ? undefined : { color: 'var(--text-normal)' }}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button className="primary-btn" type="button" onClick={openCreate}>
          {activeTabMeta.createLabel}
        </button>
      </div>

      {activeTab === 'contacts' ? (
        <EntityListCard
          title="联系人列表"
          items={contacts.map((item) => ({
            id: item.id,
            title: `${item.name}${item.is_primary ? '（主联系人）' : ''}`,
            subtitle: `${item.phone}${item.job_title ? ` / ${item.job_title}` : ''}`,
            content: [item.wechat ? `微信：${item.wechat}` : '', item.email ? `邮箱：${item.email}` : '', item.notes ? `备注：${item.notes}` : '']
              .filter(Boolean)
              .join('  '),
            createdAt: item.created_at,
          }))}
          onEdit={(id) => {
            const item = contacts.find((entry) => entry.id === id);
            if (item) openEdit('contacts', item);
          }}
          onDelete={(id) => {
            const item = contacts.find((entry) => entry.id === id);
            if (item) deleteItem('contacts', id, item.name);
          }}
          deletingKey={deletingKey}
          deletePrefix="contacts"
        />
      ) : null}

      {activeTab === 'visits' ? (
        <EntityListCard
          title="拜访记录"
          items={visits.map((item) => ({
            id: item.id,
            title: `${item.visit_method} / ${formatDateTime(item.visit_time)}`,
            subtitle: item.participants || '未填写参与人',
            content: [item.content, item.conclusion ? `结论：${item.conclusion}` : '', item.next_plan ? `下一步：${item.next_plan}` : '']
              .filter(Boolean)
              .join('  '),
            createdAt: item.created_at,
          }))}
          onEdit={(id) => {
            const item = visits.find((entry) => entry.id === id);
            if (item) openEdit('visits', item);
          }}
          onDelete={(id) => {
            const item = visits.find((entry) => entry.id === id);
            if (item) deleteItem('visits', id, `${item.visit_method} ${formatDateTime(item.visit_time)}`);
          }}
          deletingKey={deletingKey}
          deletePrefix="visits"
        />
      ) : null}

      {activeTab === 'notes' ? (
        <EntityListCard
          title="沟通纪要"
          items={notes.map((item) => ({
            id: item.id,
            title: `${item.method} / ${item.counterpart}`,
            subtitle: formatDateTime(item.communication_time),
            content: [item.content, item.todo_items ? `待办：${item.todo_items}` : ''].filter(Boolean).join('  '),
            createdAt: item.created_at,
          }))}
          onEdit={(id) => {
            const item = notes.find((entry) => entry.id === id);
            if (item) openEdit('notes', item);
          }}
          onDelete={(id) => {
            const item = notes.find((entry) => entry.id === id);
            if (item) deleteItem('notes', id, `${item.method} ${item.counterpart}`);
          }}
          deletingKey={deletingKey}
          deletePrefix="notes"
        />
      ) : null}

      {activeTab === 'opportunities' ? (
        <EntityListCard
          title="商机列表"
          items={opportunities.map((item) => ({
            id: item.id,
            title: item.name,
            subtitle: `${item.stage} / ${item.status} / 负责人：${item.owner_name || '-'}`,
            content: [`金额：${item.amount ?? '-'}`, `预计成交：${item.expected_close_date || '-'}`, item.notes || '']
              .filter(Boolean)
              .join('  '),
            createdAt: item.created_at,
          }))}
          onEdit={(id) => {
            const item = opportunities.find((entry) => entry.id === id);
            if (item) openEdit('opportunities', item);
          }}
          onDelete={(id) => {
            const item = opportunities.find((entry) => entry.id === id);
            if (item) deleteItem('opportunities', id, item.name);
          }}
          deletingKey={deletingKey}
          deletePrefix="opportunities"
        />
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 8,
            background: '#fff1f0',
            border: '1px solid #ffc1c2',
            color: '#cf1322',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <ModalShell
        open={modalState?.kind === 'contacts'}
        title={modalState?.item ? '编辑联系人' : '新建联系人'}
        onClose={closeModal}
      >
        <form onSubmit={submitContact} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <input placeholder="姓名" value={contactForm.name} onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <input placeholder="手机号" value={contactForm.phone} onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))} required />
            <input placeholder="职务" value={contactForm.job_title} onChange={(e) => setContactForm((prev) => ({ ...prev, job_title: e.target.value }))} />
            <input placeholder="微信号" value={contactForm.wechat} onChange={(e) => setContactForm((prev) => ({ ...prev, wechat: e.target.value }))} />
            <input placeholder="邮箱" value={contactForm.email} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={contactForm.is_primary}
                onChange={(e) => setContactForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              设为主联系人
            </label>
          </div>
          <textarea rows={4} placeholder="备注" value={contactForm.notes} onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <ModalActions submitting={submitting} onCancel={closeModal} submitText="保存联系人" />
        </form>
      </ModalShell>

      <ModalShell
        open={modalState?.kind === 'visits'}
        title={modalState?.item ? '编辑拜访记录' : '新建拜访记录'}
        onClose={closeModal}
        maxWidth={760}
      >
        <form onSubmit={submitVisit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <select value={visitForm.visit_method} onChange={(e) => setVisitForm((prev) => ({ ...prev, visit_method: e.target.value }))}>
              {VISIT_METHOD_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={visitForm.visit_time}
              onChange={(e) => setVisitForm((prev) => ({ ...prev, visit_time: e.target.value }))}
            />
            <select value={visitForm.opportunity_id} onChange={(e) => setVisitForm((prev) => ({ ...prev, opportunity_id: e.target.value }))}>
              <option value="">不关联商机</option>
              {opportunities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              placeholder="参与人"
              value={visitForm.participants}
              onChange={(e) => setVisitForm((prev) => ({ ...prev, participants: e.target.value }))}
            />
          </div>
          <textarea rows={4} placeholder="拜访内容" value={visitForm.content} onChange={(e) => setVisitForm((prev) => ({ ...prev, content: e.target.value }))} required />
          <textarea rows={3} placeholder="拜访结论" value={visitForm.conclusion} onChange={(e) => setVisitForm((prev) => ({ ...prev, conclusion: e.target.value }))} />
          <textarea rows={3} placeholder="下一步计划" value={visitForm.next_plan} onChange={(e) => setVisitForm((prev) => ({ ...prev, next_plan: e.target.value }))} />
          <ModalActions submitting={submitting} onCancel={closeModal} submitText="保存拜访记录" />
        </form>
      </ModalShell>

      <ModalShell
        open={modalState?.kind === 'notes'}
        title={modalState?.item ? '编辑沟通纪要' : '新建沟通纪要'}
        onClose={closeModal}
        maxWidth={760}
      >
        <form onSubmit={submitNote} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <select value={noteForm.method} onChange={(e) => setNoteForm((prev) => ({ ...prev, method: e.target.value }))}>
              {NOTE_METHOD_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={noteForm.communication_time}
              onChange={(e) => setNoteForm((prev) => ({ ...prev, communication_time: e.target.value }))}
            />
            <select value={noteForm.opportunity_id} onChange={(e) => setNoteForm((prev) => ({ ...prev, opportunity_id: e.target.value }))}>
              <option value="">不关联商机</option>
              {opportunities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              placeholder="沟通对象"
              value={noteForm.counterpart}
              onChange={(e) => setNoteForm((prev) => ({ ...prev, counterpart: e.target.value }))}
              required
            />
          </div>
          <textarea rows={4} placeholder="纪要内容" value={noteForm.content} onChange={(e) => setNoteForm((prev) => ({ ...prev, content: e.target.value }))} required />
          <textarea rows={3} placeholder="待办事项" value={noteForm.todo_items} onChange={(e) => setNoteForm((prev) => ({ ...prev, todo_items: e.target.value }))} />
          <ModalActions submitting={submitting} onCancel={closeModal} submitText="保存沟通纪要" />
        </form>
      </ModalShell>

      <ModalShell
        open={modalState?.kind === 'opportunities'}
        title={modalState?.item ? '编辑商机' : '新建商机'}
        onClose={closeModal}
        maxWidth={820}
      >
        <form onSubmit={submitOpportunity} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <input placeholder="商机名称" value={opportunityForm.name} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <input placeholder="商机金额" value={opportunityForm.amount} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, amount: e.target.value }))} />
            <select value={opportunityForm.stage} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, stage: e.target.value }))}>
              {OPPORTUNITY_STAGE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={opportunityForm.status} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, status: e.target.value }))}>
              {OPPORTUNITY_STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={opportunityForm.expected_close_date}
              onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
            />
            <select value={opportunityForm.owner_id} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, owner_id: e.target.value }))}>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <textarea rows={4} placeholder="备注" value={opportunityForm.notes} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <ModalActions submitting={submitting} onCancel={closeModal} submitText="保存商机" />
        </form>
      </ModalShell>
    </div>
  );
}

function EntityListCard({
  title,
  items,
  onEdit,
  onDelete,
  deletingKey,
  deletePrefix,
}: {
  title: string;
  items: Array<{ id: number; title: string; subtitle: string; content: string; createdAt: string }>;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  deletingKey: string;
  deletePrefix: string;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.length ? (
          items.map((item) => {
            const deleting = deletingKey === `${deletePrefix}-${item.id}`;
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
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.title}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{item.subtitle}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      style={{ color: '#0958d9', background: 'transparent', border: 'none', fontWeight: 600 }}
                      onClick={() => onEdit(item.id)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      style={{ color: '#cf1322', background: 'transparent', border: 'none', fontWeight: 600 }}
                      onClick={() => onDelete(item.id)}
                      disabled={deleting}
                    >
                      {deleting ? '删除中...' : '删除'}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7 }}>{item.content || '暂无补充内容'}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  创建时间：{formatDateTime(item.createdAt)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="muted">暂无数据</div>
        )}
      </div>
    </div>
  );
}

function ModalActions({
  submitting,
  onCancel,
  submitText,
}: {
  submitting: boolean;
  onCancel: () => void;
  submitText: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
      <button type="button" className="secondary-btn" onClick={onCancel}>
        取消
      </button>
      <button className="primary-btn" type="submit" disabled={submitting}>
        {submitting ? '保存中...' : submitText}
      </button>
    </div>
  );
}
