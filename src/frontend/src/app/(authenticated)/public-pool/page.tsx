'use client';

import { useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/common/page-header';
import { FilterCard } from '@/components/common/filter-card';
import { StatusChip } from '@/components/common/status-chip';
import { Lead, UserInfo } from '@/types';

export default function PublicPoolPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [assigningLeadId, setAssigningLeadId] = useState<number | null>(null);
  const [targetOwnerId, setTargetOwnerId] = useState('');

  const loadData = async () => {
    try {
      const [leadResult, userResult] = await Promise.all([
        api.get<{ items: Lead[] }>(`/leads/public-pool?search=${encodeURIComponent(search)}`),
        api.get<{ items: UserInfo[] }>('/admin/users'),
      ]);
      setLeads(leadResult.items);
      setUsers(userResult.items.filter((item) => item.role !== '系统管理员'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载公共线索池失败');
    }
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const claimLead = async (leadId: number) => {
    await api.post(`/leads/${leadId}/claim`);
    loadData();
  };

  const assignLead = async (leadId: number) => {
    if (!targetOwnerId) return;
    await api.post(`/leads/${leadId}/assign`, { owner_id: Number(targetOwnerId) });
    setAssigningLeadId(null);
    setTargetOwnerId('');
    loadData();
  };

  const canManage = user?.role === '销售经理' || user?.role === '系统管理员';

  return (
    <div>
      <PageHeader
        title="公共线索池"
        description="同时支持销售自由领取和销售经理定向分配两种流转方式。"
      />

      {error ? (
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
          {error}
        </div>
      ) : null}

      <FilterCard>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 160px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按公司名称、联系人或手机号搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary-btn" onClick={loadData}>
            刷新
          </button>
          <div style={{ justifySelf: 'end', fontSize: 13, color: 'var(--text-muted)' }}>
            当前公共线索 {leads.length} 条
          </div>
        </div>
      </FilterCard>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>公司名称</th>
              <th>大区</th>
              <th>来源</th>
              <th>主联系人</th>
              <th>手机号</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.id}</td>
                <td>{lead.company_name}</td>
                <td>{lead.region || '-'}</td>
                <td>{lead.source}</td>
                <td>{lead.primary_contact_name || '-'}</td>
                <td>{lead.primary_contact_phone || '-'}</td>
                <td>
                  <StatusChip status={lead.status} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button className="primary-btn" style={{ padding: '8px 12px' }} onClick={() => claimLead(lead.id)}>
                      领取
                    </button>
                    {canManage ? (
                      <>
                        {assigningLeadId === lead.id ? (
                          <>
                            <select value={targetOwnerId} onChange={(e) => setTargetOwnerId(e.target.value)} style={{ width: 200 }}>
                              <option value="">选择销售人员</option>
                              {users.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <button className="secondary-btn" onClick={() => assignLead(lead.id)}>
                              确认分配
                            </button>
                          </>
                        ) : (
                          <button
                            className="secondary-btn"
                            onClick={() => {
                              setAssigningLeadId(lead.id);
                              setTargetOwnerId('');
                            }}
                          >
                            分配
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
