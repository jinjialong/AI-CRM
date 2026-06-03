'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/common/page-header';
import { FollowUpForm } from '@/components/leads/followup-form';
import { StatusChip } from '@/components/common/status-chip';
import { Lead, LeadFollowUp } from '@/types';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const leadId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [followups, setFollowups] = useState<LeadFollowUp[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const result = await api.get<{
        lead: Lead;
        followups: LeadFollowUp[];
        followup_methods: string[];
      }>(`/leads/${leadId}`);
      setLead(result.lead);
      setFollowups(result.followups);
      setMethods(result.followup_methods);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '加载线索失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReturnToPool = async () => {
    await api.post(`/leads/${leadId}/return-to-pool`);
    router.push('/public-pool');
  };

  const handleConvert = async () => {
    if (!window.confirm('确认将该线索转为客户吗？')) return;
    await api.post(`/leads/${leadId}/convert`, { confirm: true });
    router.push('/customers');
  };

  const handleForceReclaim = async () => {
    if (!window.confirm('确认强制收回该线索到公共线索池吗？')) return;
    await api.post(`/leads/${leadId}/force-reclaim`);
    router.push('/public-pool');
  };

  if (loading || !lead) {
    return (
      <div className="card" style={{ padding: 24 }}>
        正在加载线索详情...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`线索详情：${lead.company_name}`}
        description="在线索阶段记录沟通历史，维护公司资料和多联系人，并在满足条件时执行转客户。"
        actions={
          <>
            <button className="secondary-btn" onClick={handleReturnToPool}>
              退回公共池
            </button>
            {user?.role === '销售经理' || user?.role === '系统管理员' ? (
              <button className="danger-btn" onClick={handleForceReclaim}>
                强制收回
              </button>
            ) : null}
            <button className="primary-btn" onClick={handleConvert} disabled={lead.status === '已转客户'}>
              转客户
            </button>
          </>
        }
      />

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
          <InfoItem label="状态" value={<StatusChip status={lead.status} />} />
          <InfoItem label="主联系人" value={lead.primary_contact_name || '-'} />
          <InfoItem label="主联系人手机号" value={lead.primary_contact_phone || '-'} />
          <InfoItem label="主联系人职务" value={lead.primary_contact_job_title || '-'} />
          <InfoItem label="联系人数量" value={String(lead.contact_count)} />
          <InfoItem label="备注" value={lead.notes || '-'} />
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>联系人列表</div>
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
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>新增跟进</div>
        <div style={{ marginTop: 14 }}>
          <FollowUpForm target="lead" targetId={leadId} methods={methods} onSuccess={loadDetail} />
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
