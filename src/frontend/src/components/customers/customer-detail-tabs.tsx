'use client';

import { FormEvent, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { CommunicationNote, Contact, VisitRecord } from '@/types';

type TabKey = 'contacts' | 'visits' | 'notes';

export function CustomerDetailTabs({
  customerId,
  contacts,
  visits,
  notes,
  onSuccess,
}: {
  customerId: number;
  contacts: Contact[];
  visits: VisitRecord[];
  notes: CommunicationNote[];
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('contacts');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    job_title: '',
    wechat: '',
    email: '',
    is_primary: true,
    notes: '',
  });
  const [visitForm, setVisitForm] = useState({
    visit_method: '上门',
    participants: '',
    content: '',
    conclusion: '',
    next_plan: '',
  });
  const [noteForm, setNoteForm] = useState({
    method: '电话',
    counterpart: '',
    content: '',
    todo_items: '',
  });

  const submit = async (event: FormEvent, kind: TabKey) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (kind === 'contacts') {
        await api.post(`/customers/${customerId}/contacts`, contactForm);
        setContactForm({
          name: '',
          phone: '',
          job_title: '',
          wechat: '',
          email: '',
          is_primary: true,
          notes: '',
        });
      }
      if (kind === 'visits') {
        await api.post(`/customers/${customerId}/visits`, visitForm);
        setVisitForm({
          visit_method: '上门',
          participants: '',
          content: '',
          conclusion: '',
          next_plan: '',
        });
      }
      if (kind === 'notes') {
        await api.post(`/customers/${customerId}/notes`, noteForm);
        setNoteForm({
          method: '电话',
          counterpart: '',
          content: '',
          todo_items: '',
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'contacts', label: '联系人' },
    { key: 'visits', label: '拜访记录' },
    { key: 'notes', label: '沟通纪要' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
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

      {activeTab === 'contacts' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <form className="card" style={{ padding: 18 }} onSubmit={(event) => submit(event, 'contacts')}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增联系人</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <input placeholder="姓名" value={contactForm.name} onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <input placeholder="手机号" value={contactForm.phone} onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))} required />
              <input placeholder="职务" value={contactForm.job_title} onChange={(e) => setContactForm((prev) => ({ ...prev, job_title: e.target.value }))} />
              <input placeholder="微信号" value={contactForm.wechat} onChange={(e) => setContactForm((prev) => ({ ...prev, wechat: e.target.value }))} />
              <input placeholder="邮箱" value={contactForm.email} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} />
              <textarea rows={3} placeholder="备注" value={contactForm.notes} onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="primary-btn" type="submit" disabled={submitting}>
                {submitting ? '保存中...' : '保存联系人'}
              </button>
            </div>
          </form>

          <ListCard
            title="联系人列表"
            items={contacts.map((item) => ({
              title: `${item.name}${item.is_primary ? '（主联系人）' : ''}`,
              subtitle: `${item.phone} / ${item.job_title || '未填写职务'}`,
              content: `${item.wechat ? `微信：${item.wechat}` : ''}${item.email ? `  邮箱：${item.email}` : ''}${item.notes ? `  备注：${item.notes}` : ''}`,
            }))}
          />
        </div>
      ) : null}

      {activeTab === 'visits' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <form className="card" style={{ padding: 18 }} onSubmit={(event) => submit(event, 'visits')}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增拜访记录</div>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 12 }}>
              <select value={visitForm.visit_method} onChange={(e) => setVisitForm((prev) => ({ ...prev, visit_method: e.target.value }))}>
                <option value="上门">上门</option>
                <option value="线上">线上</option>
                <option value="电话">电话</option>
                <option value="其他">其他</option>
              </select>
              <input placeholder="参与人" value={visitForm.participants} onChange={(e) => setVisitForm((prev) => ({ ...prev, participants: e.target.value }))} />
              <input placeholder="拜访结论" value={visitForm.conclusion} onChange={(e) => setVisitForm((prev) => ({ ...prev, conclusion: e.target.value }))} />
              <textarea rows={4} placeholder="拜访内容" value={visitForm.content} onChange={(e) => setVisitForm((prev) => ({ ...prev, content: e.target.value }))} required />
              <textarea rows={4} placeholder="下步计划" value={visitForm.next_plan} onChange={(e) => setVisitForm((prev) => ({ ...prev, next_plan: e.target.value }))} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="primary-btn" type="submit" disabled={submitting}>
                {submitting ? '保存中...' : '保存拜访记录'}
              </button>
            </div>
          </form>

          <ListCard
            title="拜访记录"
            items={visits.map((item) => ({
              title: `${item.visit_method} / ${new Date(item.visit_time).toLocaleString('zh-CN')}`,
              subtitle: item.participants || '未填写参与人',
              content: `${item.content}${item.conclusion ? `  结论：${item.conclusion}` : ''}${item.next_plan ? `  下步计划：${item.next_plan}` : ''}`,
            }))}
          />
        </div>
      ) : null}

      {activeTab === 'notes' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <form className="card" style={{ padding: 18 }} onSubmit={(event) => submit(event, 'notes')}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增沟通纪要</div>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
              <select value={noteForm.method} onChange={(e) => setNoteForm((prev) => ({ ...prev, method: e.target.value }))}>
                <option value="电话">电话</option>
                <option value="微信">微信</option>
                <option value="面谈">面谈</option>
                <option value="其他">其他</option>
              </select>
              <input placeholder="沟通对象" value={noteForm.counterpart} onChange={(e) => setNoteForm((prev) => ({ ...prev, counterpart: e.target.value }))} required />
              <textarea rows={4} placeholder="纪要内容" value={noteForm.content} onChange={(e) => setNoteForm((prev) => ({ ...prev, content: e.target.value }))} required />
              <textarea rows={4} placeholder="待办事项" value={noteForm.todo_items} onChange={(e) => setNoteForm((prev) => ({ ...prev, todo_items: e.target.value }))} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="primary-btn" type="submit" disabled={submitting}>
                {submitting ? '保存中...' : '保存沟通纪要'}
              </button>
            </div>
          </form>

          <ListCard
            title="沟通纪要"
            items={notes.map((item) => ({
              title: `${item.method} / ${item.counterpart}`,
              subtitle: new Date(item.communication_time).toLocaleString('zh-CN'),
              content: `${item.content}${item.todo_items ? `  待办：${item.todo_items}` : ''}`,
            }))}
          />
        </div>
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
    </div>
  );
}

function ListCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; subtitle: string; content: string }>;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              style={{
                borderRadius: 10,
                border: '1px solid var(--border-soft)',
                padding: 14,
                background: '#fafcff',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.title}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{item.subtitle}</div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7 }}>{item.content || '暂无补充内容'}</div>
            </div>
          ))
        ) : (
          <div className="muted">暂无数据</div>
        )}
      </div>
    </div>
  );
}

