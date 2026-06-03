'use client';

import { useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { CustomerDetailTabs } from '@/components/customers/customer-detail-tabs';
import { PageHeader } from '@/components/common/page-header';
import { FollowUpForm } from '@/components/leads/followup-form';
import {
  CommunicationNote,
  Contact,
  Customer,
  CustomerFollowUp,
  VisitRecord,
} from '@/types';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customerId = Number(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followups, setFollowups] = useState<CustomerFollowUp[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [notes, setNotes] = useState<CommunicationNote[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    customer_name: '',
    contact_name: '',
    phone: '',
    company_name: '',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.get<{
        customer: Customer;
        followups: CustomerFollowUp[];
        contacts: Contact[];
        visits: VisitRecord[];
        notes: CommunicationNote[];
        followup_methods: string[];
      }>(`/customers/${customerId}`);
      setCustomer(result.customer);
      setEditValues({
        customer_name: result.customer.customer_name,
        contact_name: result.customer.contact_name,
        phone: result.customer.phone,
        company_name: result.customer.company_name,
        notes: result.customer.notes,
      });
      setFollowups(result.followups);
      setContacts(result.contacts);
      setVisits(result.visits);
      setNotes(result.notes);
      setMethods(result.followup_methods);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '加载客户详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !customer) {
    return (
      <div className="card" style={{ padding: 24 }}>
        正在加载客户详情...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`客户详情：${customer.customer_name}`}
        description="客户详情支持持续跟进、联系人维护、拜访记录和沟通纪要。"
        actions={
          <button className="secondary-btn" onClick={() => setEditing((prev) => !prev)}>
            {editing ? '取消编辑' : '编辑客户'}
          </button>
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
        {editing ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 18,
              paddingBottom: 18,
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            <input value={editValues.customer_name} onChange={(e) => setEditValues((prev) => ({ ...prev, customer_name: e.target.value }))} />
            <input value={editValues.contact_name} onChange={(e) => setEditValues((prev) => ({ ...prev, contact_name: e.target.value }))} />
            <input value={editValues.phone} onChange={(e) => setEditValues((prev) => ({ ...prev, phone: e.target.value }))} />
            <input value={editValues.company_name} onChange={(e) => setEditValues((prev) => ({ ...prev, company_name: e.target.value }))} />
            <textarea rows={4} value={editValues.notes} onChange={(e) => setEditValues((prev) => ({ ...prev, notes: e.target.value }))} />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="primary-btn"
                onClick={async () => {
                  await api.patch(`/customers/${customerId}`, editValues);
                  setEditing(false);
                  loadData();
                }}
              >
                保存客户信息
              </button>
            </div>
          </div>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          <InfoItem label="客户名称" value={customer.customer_name} />
          <InfoItem label="主联系人" value={customer.contact_name} />
          <InfoItem label="手机号" value={customer.phone} />
          <InfoItem label="公司名称" value={customer.company_name || '-'} />
          <InfoItem label="负责人" value={customer.owner_name || '-'} />
          <InfoItem label="来源线索" value={`线索 #${customer.source_lead_id}`} />
          <InfoItem label="备注" value={customer.notes || '-'} />
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>新增客户跟进</div>
        <div style={{ marginTop: 14 }}>
          <FollowUpForm target="customer" targetId={customerId} methods={methods} onSuccess={loadData} />
        </div>
        <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
          {followups.length ? (
            followups.map((item) => (
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
            <div className="muted">暂无客户跟进记录</div>
          )}
        </div>
      </div>

      <CustomerDetailTabs
        customerId={customerId}
        contacts={contacts}
        visits={visits}
        notes={notes}
        onSuccess={loadData}
      />
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
