'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/common/page-header';
import { FilterCard } from '@/components/common/filter-card';
import { LeadFormModal } from '@/components/leads/lead-form-modal';
import { StatusChip } from '@/components/common/status-chip';
import { Lead, UserInfo } from '@/types';

type Filters = {
  search: string;
  status: string;
};

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [filters, setFilters] = useState<Filters>({ search: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ search: '', status: '' });

  const loadData = async () => {
    const [leadResult, userResult] = await Promise.all([
      api.get<{ items: Lead[] }>(
        `/leads?search=${encodeURIComponent(appliedFilters.search)}&status=${encodeURIComponent(appliedFilters.status)}`
      ),
      api.get<{ items: UserInfo[] }>('/admin/users'),
    ]);
    setLeads(leadResult.items);
    setUsers(userResult.items);
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => {
      loadData();
    };
    window.addEventListener('ai-crm-refresh', refresh);
    return () => window.removeEventListener('ai-crm-refresh', refresh);
  }, [appliedFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    const nextFilters = { search: '', status: '' };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader
        title="我的线索"
        description="这里承接第一期最核心的公司级线索录入、联系人维护和转客户入口。"
        actions={
          <button
            className="primary-btn"
            onClick={() => {
              setEditingLead(null);
              setOpenForm(true);
            }}
          >
            新建线索
          </button>
        }
      />

      <FilterCard>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 180px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按公司名称、组织机构代码、联系人或手机号搜索"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">全部状态</option>
            <option value="跟进中">跟进中</option>
            <option value="必胜">必胜</option>
            <option value="大概率">大概率</option>
            <option value="高风险">高风险</option>
            <option value="已丢弃">已丢弃</option>
          </select>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={handleSearch}>
                搜索
              </button>
              <button className="secondary-btn" onClick={handleReset}>
                重置
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              共 {leads.length} 条
            </div>
          </div>
        </div>
      </FilterCard>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>公司名称</th>
              <th>组织机构代码</th>
              <th>大区</th>
              <th>来源</th>
              <th>主联系人</th>
              <th>手机号</th>
              <th>状态</th>
              <th>负责人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.id}</td>
                <td>{lead.company_name}</td>
                <td>{lead.organization_code || '-'}</td>
                <td>{lead.region || '-'}</td>
                <td>{lead.source}</td>
                <td>{lead.primary_contact_name || '-'}</td>
                <td>{lead.primary_contact_phone || '-'}</td>
                <td>
                  <StatusChip status={lead.status} />
                </td>
                <td>{lead.owner_name || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link href={`/leads/${lead.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                      查看
                    </Link>
                    <button
                      type="button"
                      style={{ color: '#0958d9', background: 'transparent', border: 'none', fontWeight: 600 }}
                      onClick={() => {
                        setEditingLead(lead);
                        setOpenForm(true);
                      }}
                    >
                      编辑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadFormModal
        open={openForm}
        onClose={() => setOpenForm(false)}
        onSuccess={loadData}
        users={users}
        lead={editingLead}
      />
    </div>
  );
}
