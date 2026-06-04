'use client';

import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { CustomerDetailTabs } from '@/components/customers/customer-detail-tabs';
import { api, ApiError } from '@/lib/api';
import { CommunicationNote, Contact, Customer, Opportunity, UserInfo, VisitRecord } from '@/types';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customerId = Number(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [notes, setNotes] = useState<CommunicationNote[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
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
    setCustomer(null);
    try {
      const [result, userResult] = await Promise.all([
        api.get<{
          customer: Customer;
          contacts: Contact[];
          visits: VisitRecord[];
          notes: CommunicationNote[];
          opportunities: Opportunity[];
        }>(`/customers/${customerId}`),
        api.get<{ items: UserInfo[] }>('/admin/users'),
      ]);
      setCustomer(result.customer);
      setEditValues({
        customer_name: result.customer.customer_name,
        contact_name: result.customer.contact_name,
        phone: result.customer.phone,
        company_name: result.customer.company_name,
        notes: result.customer.notes,
      });
      setContacts(result.contacts);
      setVisits(result.visits);
      setNotes(result.notes);
      setOpportunities(result.opportunities);
      setUsers(userResult.items);
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
    if (!loading && !customer) {
      return (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>客户详情加载失败</div>
          <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>{message || '未获取到客户数据。'}</div>
        </div>
      );
    }
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
        description="客户详情支持维护联系人、拜访记录、沟通纪要和商机。"
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
            <input
              value={editValues.customer_name}
              onChange={(e) => setEditValues((prev) => ({ ...prev, customer_name: e.target.value }))}
            />
            <input
              value={editValues.contact_name}
              onChange={(e) => setEditValues((prev) => ({ ...prev, contact_name: e.target.value }))}
            />
            <input value={editValues.phone} onChange={(e) => setEditValues((prev) => ({ ...prev, phone: e.target.value }))} />
            <input
              value={editValues.company_name}
              onChange={(e) => setEditValues((prev) => ({ ...prev, company_name: e.target.value }))}
            />
            <textarea
              rows={4}
              value={editValues.notes}
              onChange={(e) => setEditValues((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="primary-btn"
                onClick={async () => {
                  try {
                    await api.patch(`/customers/${customerId}`, editValues);
                    setEditing(false);
                    await loadData();
                  } catch (error) {
                    setMessage(error instanceof ApiError ? error.message : '保存客户信息失败');
                  }
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

      <CustomerDetailTabs
        customerId={customerId}
        contacts={contacts}
        visits={visits}
        notes={notes}
        opportunities={opportunities}
        users={users}
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
