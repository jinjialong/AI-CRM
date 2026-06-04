'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { LEAD_STATUS_OPTIONS, isManagerOrAdmin } from '@/lib/crm-options';
import { ModalShell } from '@/components/common/modal-shell';
import { LeadAnalysisDashboard } from '@/components/leads/lead-analysis-dashboard';
import { LeadAnalysisTrend } from '@/components/leads/lead-analysis-trend';
import { LeadConversationPanel } from '@/components/leads/lead-conversation-panel';
import { FollowUpForm } from '@/components/leads/followup-form';
import { LeadKeyEventPanel } from '@/components/leads/lead-key-event-panel';
import { StatusChip } from '@/components/common/status-chip';
import {
  Lead,
  LeadAnalysisCurrent,
  LeadAnalysisTrendPoint,
  LeadConversation,
  LeadContact,
  LeadFollowUp,
  LeadKeyEvent,
} from '@/types';

type ContactFormState = {
  name: string;
  job_title: string;
  phone: string;
  wechat: string;
  is_primary: boolean;
};

function buildContactPayload(existingContacts: LeadContact[], draft: ContactFormState) {
  const nextContacts = [
    ...existingContacts.map((item) => ({
      name: (item.name || '').trim(),
      job_title: (item.job_title || '').trim(),
      phone: (item.phone || '').trim(),
      wechat: (item.wechat || '').trim(),
      is_primary: Boolean(item.is_primary),
    })),
    {
      name: draft.name.trim(),
      job_title: draft.job_title.trim(),
      phone: draft.phone.trim(),
      wechat: draft.wechat.trim(),
      is_primary: draft.is_primary,
    },
  ];
  if (draft.is_primary) {
    return nextContacts.map((item, index) => ({
      ...item,
      is_primary: index === nextContacts.length - 1,
    }));
  }
  if (!nextContacts.some((item) => item.is_primary) && nextContacts.length) {
    nextContacts[0].is_primary = true;
  }
  return nextContacts;
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const leadId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [followups, setFollowups] = useState<LeadFollowUp[]>([]);
  const [analysis, setAnalysis] = useState<LeadAnalysisCurrent | null>(null);
  const [trend, setTrend] = useState<LeadAnalysisTrendPoint[]>([]);
  const [conversations, setConversations] = useState<LeadConversation[]>([]);
  const [keyEvents, setKeyEvents] = useState<LeadKeyEvent[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [statusDraft, setStatusDraft] = useState<(typeof LEAD_STATUS_OPTIONS)[number]>(LEAD_STATUS_OPTIONS[0]);
  const [savingStatus, setSavingStatus] = useState(false);
  const [openContactModal, setOpenContactModal] = useState(false);
  const [openFollowupModal, setOpenFollowupModal] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>({
    name: '',
    job_title: '',
    phone: '',
    wechat: '',
    is_primary: true,
  });
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  const isConverted = Boolean(lead?.is_converted || lead?.converted_customer_id);

  const loadDetail = async () => {
    setLoading(true);
    setLead(null);
    try {
      const [detail, analysisResult, trendResult, conversationResult, keyEventResult] = await Promise.all([
        api.get<{
          lead: Lead;
          followups: LeadFollowUp[];
          followup_methods: string[];
        }>(`/leads/${leadId}`),
        api.get<{ current: LeadAnalysisCurrent | null }>(`/leads/${leadId}/analysis`),
        api.get<{ items: LeadAnalysisTrendPoint[] }>(`/leads/${leadId}/analysis/trend`),
        api.get<{ items: LeadConversation[] }>(`/leads/${leadId}/conversations`),
        api.get<{ items: LeadKeyEvent[] }>(`/leads/${leadId}/key-events`),
      ]);
      setLead(detail.lead);
      setStatusDraft((detail.lead.status as (typeof LEAD_STATUS_OPTIONS)[number]) || LEAD_STATUS_OPTIONS[0]);
      setFollowups(detail.followups);
      setMethods(detail.followup_methods);
      setAnalysis(analysisResult.current);
      setTrend(trendResult.items);
      setConversations(conversationResult.items);
      setKeyEvents(keyEventResult.items);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '加载线索详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReturnToPool = async () => {
    try {
      await api.post(`/leads/${leadId}/return-to-pool`);
      router.push('/public-pool');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '退回公共池失败');
    }
  };

  const handleBackToLeads = () => {
    router.push('/leads');
  };

  const handleConvert = async () => {
    if (!window.confirm('确认将该线索转为客户吗？')) return;
    try {
      await api.post(`/leads/${leadId}/convert`, { confirm: true });
      router.push('/customers');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '转客户失败');
    }
  };

  const handleMarkLost = async () => {
    if (!window.confirm('确认将该线索标记为已丢弃吗？')) return;
    try {
      const updatedLead = await api.post<Lead>(`/leads/${leadId}/mark-lost`);
      setLead(updatedLead);
      setStatusDraft('已丢弃');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '标记已丢弃失败');
    }
  };

  const handleForceReclaim = async () => {
    if (!window.confirm('确认强制收回该线索到公共线索池吗？')) return;
    try {
      await api.post(`/leads/${leadId}/force-reclaim`);
      router.push('/public-pool');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '强制收回失败');
    }
  };

  const handleRebuildAnalysis = async () => {
    setRebuilding(true);
    try {
      await api.post(`/leads/${leadId}/analysis/rebuild`);
      await loadDetail();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '重新分析失败');
    } finally {
      setRebuilding(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!lead || statusDraft === lead.status) return;
    setSavingStatus(true);
    try {
      const updatedLead = await api.patch<Lead>(`/leads/${leadId}`, { status: statusDraft });
      setLead(updatedLead);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '更新线索状态失败');
    } finally {
      setSavingStatus(false);
    }
  };

  const openCreateContact = () => {
    setContactForm({
      name: '',
      job_title: '',
      phone: '',
      wechat: '',
      is_primary: !lead?.contacts.length,
    });
    setContactError('');
    setOpenContactModal(true);
  };

  const handleCreateContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!lead) return;
    setSavingContact(true);
    setContactError('');
    try {
      await api.patch(`/leads/${leadId}`, {
        contacts: buildContactPayload(lead.contacts, contactForm),
      });
      setOpenContactModal(false);
      await loadDetail();
    } catch (error) {
      setContactError(error instanceof ApiError ? error.message : '新增联系人失败');
    } finally {
      setSavingContact(false);
    }
  };

  if (loading || !lead) {
    if (!loading && !lead) {
      return (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>线索详情加载失败</div>
          <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>{message || '未获取到线索数据。'}</div>
          <button type="button" className="secondary-btn" style={{ marginTop: 16 }} onClick={handleBackToLeads}>
            返回我的线索
          </button>
        </div>
      );
    }
    return (
      <div className="card" style={{ padding: 24 }}>
        正在加载线索详情...
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          aria-label="返回我的线索"
          onClick={handleBackToLeads}
          style={{
            width: 40,
            height: 40,
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            background: '#fff',
            color: 'var(--text-strong)',
            fontSize: 20,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'<'}
        </button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="secondary-btn"
            onClick={handleMarkLost}
            disabled={lead.status === '已丢弃' || isConverted}
          >
            标记已丢弃
          </button>
          <button className="secondary-btn" onClick={handleReturnToPool}>
            退回公共池
          </button>
          {isManagerOrAdmin(user?.role) ? (
            <button className="danger-btn" onClick={handleForceReclaim}>
              强制收回
            </button>
          ) : null}
          <button
            className="primary-btn"
            onClick={handleConvert}
            disabled={isConverted || lead.status === '已丢弃'}
          >
            转客户
          </button>
        </div>
      </div>

      {message ? (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            background: '#fff1f0',
            border: '1px solid #ffc1c2',
            color: '#cf1322',
          }}
        >
          {message}
        </div>
      ) : null}

      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          <InfoItem label="公司名称" value={lead.company_name} />
          <InfoItem label="组织机构代码" value={lead.organization_code || '-'} />
          <InfoItem label="大区" value={lead.region || '-'} />
          <InfoItem label="来源" value={lead.source} />
          <InfoItem label="负责人" value={lead.owner_name || '-'} />
          <InfoItem label="当前状态" value={<StatusChip status={lead.status} />} />
          <InfoItem label="主联系人" value={lead.primary_contact_name || '-'} />
          <InfoItem label="主联系人手机号" value={lead.primary_contact_phone || '-'} />
          <InfoItem label="主联系人职务" value={lead.primary_contact_job_title || '-'} />
          <InfoItem label="联系人数量" value={String(lead.contact_count)} />
          <InfoItem label="备注" value={lead.notes || '-'} />
          <InfoItem
            label="转客户状态"
            value={
              lead.converted_customer_id
                ? `已转客户 #${lead.converted_customer_id}`
                : lead.is_converted
                  ? '已转客户（历史数据）'
                  : '未转客户'
            }
          />
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 18,
            borderTop: '1px solid var(--border-soft)',
            display: 'grid',
            gridTemplateColumns: '260px auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>线索状态管理</div>
            <select
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as (typeof LEAD_STATUS_OPTIONS)[number])}
              disabled={isConverted}
            >
              {LEAD_STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="secondary-btn"
              onClick={handleSaveStatus}
              disabled={savingStatus || statusDraft === lead.status || isConverted}
            >
              {savingStatus ? '保存中...' : '保存状态'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isConverted
                ? '已转客户线索不再允许修改状态。'
                : '统一状态仅在当前详情页维护。'}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>联系人列表</div>
          <button className="primary-btn" type="button" onClick={openCreateContact}>
            新增联系人
          </button>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {lead.contacts.length ? (
            lead.contacts.map((contact, index) => (
              <div
                key={`${contact.phone}-${index}`}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  padding: 14,
                  background: '#fafcff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {contact.name || '-'} {contact.is_primary ? '（主联系人）' : ''}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {contact.job_title || '未填写职务'}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>
                  手机号：{contact.phone || '-'}　微信号：{contact.wechat || '-'}
                </div>
              </div>
            ))
          ) : (
            <div className="muted">暂无联系人</div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>跟进记录</div>
          <button className="primary-btn" type="button" onClick={() => setOpenFollowupModal(true)}>
            新增跟进
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>历史跟进</div>
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {followups.length ? (
            followups.map((item) => (
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
                  <div style={{ fontWeight: 700 }}>{item.method}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {new Date(item.follow_up_time).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>{item.content}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  记录人：{item.created_by_name || '-'}
                </div>
              </div>
            ))
          ) : (
            <div className="muted">暂无跟进记录</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <LeadAnalysisDashboard current={analysis} onRebuild={handleRebuildAnalysis} rebuilding={rebuilding} />
        <LeadConversationPanel leadId={leadId} items={conversations} onRefresh={loadDetail} />
        <LeadAnalysisTrend items={trend} />
        <LeadKeyEventPanel leadId={leadId} items={keyEvents} onRefresh={loadDetail} />
      </div>

      <ModalShell
        open={openContactModal}
        title="新增联系人"
        onClose={() => {
          setOpenContactModal(false);
          setContactError('');
        }}
        maxWidth={760}
      >
        <form onSubmit={handleCreateContact} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <input
              placeholder="姓名"
              value={contactForm.name}
              onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              placeholder="手机号"
              value={contactForm.phone}
              onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
              required
            />
            <input
              placeholder="职务"
              value={contactForm.job_title}
              onChange={(e) => setContactForm((prev) => ({ ...prev, job_title: e.target.value }))}
            />
            <input
              placeholder="微信号"
              value={contactForm.wechat}
              onChange={(e) => setContactForm((prev) => ({ ...prev, wechat: e.target.value }))}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={contactForm.is_primary}
              onChange={(e) => setContactForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            设为主联系人
          </label>
          {contactError ? (
            <div
              style={{
                padding: '10px 12px',
                background: '#fff1f0',
                color: '#cf1322',
                border: '1px solid #ffc1c2',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {contactError}
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="secondary-btn" onClick={() => setOpenContactModal(false)}>
              取消
            </button>
            <button className="primary-btn" type="submit" disabled={savingContact}>
              {savingContact ? '保存中...' : '保存联系人'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={openFollowupModal}
        title="新增跟进"
        onClose={() => setOpenFollowupModal(false)}
        maxWidth={980}
      >
        <FollowUpForm
          target="lead"
          targetId={leadId}
          methods={methods}
          onSuccess={async () => {
            setOpenFollowupModal(false);
            await loadDetail();
          }}
        />
      </ModalShell>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  );
}
