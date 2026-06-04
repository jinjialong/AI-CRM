'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { LEAD_STATUS_OPTIONS, isManagerOrAdmin } from '@/lib/crm-options';
import { useTeamScope } from '@/lib/team-filter';
import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { StatusChip } from '@/components/common/status-chip';
import { Lead, UserInfo } from '@/types';

type Filters = {
  managerId: string;
  memberId: string;
  region: string;
  status: string;
  search: string;
};

export default function TeamLeadsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Lead[]>([]);
  const [error, setError] = useState('');
  const { managers, members, defaultManagerId, loadMembers } = useTeamScope(user, setError);

  const [filters, setFilters] = useState<Filters>({
    managerId: '',
    memberId: '',
    region: '',
    status: '',
    search: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    managerId: '',
    memberId: '',
    region: '',
    status: '',
    search: '',
  });

  const regions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.region).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  useEffect(() => {
    if (!defaultManagerId) return;
    setFilters((prev) => {
      if (prev.managerId) return prev;
      return { ...prev, managerId: defaultManagerId };
    });
    setAppliedFilters((prev) => {
      if (prev.managerId) return prev;
      return { ...prev, managerId: defaultManagerId };
    });
  }, [defaultManagerId]);

  useEffect(() => {
    loadMembers(filters.managerId);
  }, [filters.managerId, loadMembers]);

  const loadData = async () => {
    if (!appliedFilters.managerId) {
      setItems([]);
      return;
    }
    setError('');
    try {
      const params = new URLSearchParams({ manager_id: appliedFilters.managerId });
      if (appliedFilters.memberId) params.set('member_id', appliedFilters.memberId);
      if (appliedFilters.region) params.set('region', appliedFilters.region);
      if (appliedFilters.status) params.set('status', appliedFilters.status);
      if (appliedFilters.search) params.set('search', appliedFilters.search);
      const result = await api.get<{ items: Lead[] }>(`/team/leads?${params.toString()}`);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载团队线索失败');
    }
  };

  useEffect(() => {
    loadData();
  }, [appliedFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    const nextFilters = {
      managerId: defaultManagerId,
      memberId: '',
      region: '',
      status: '',
      search: '',
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  if (!user || !isManagerOrAdmin(user.role)) {
    return (
      <div className="card" style={{ padding: 24 }}>
        无权访问团队线索。
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="团队线索" description="查看团队成员当前持有的线索。" />

      {error ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#cf1322' }}>
          {error}
        </div>
      ) : null}

      <FilterCard>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '280px 180px 180px 180px 180px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按公司、组织代码、联系人搜索"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <select
            value={filters.managerId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, managerId: e.target.value, memberId: '' }))
            }
            disabled={user.role === '销售经理'}
          >
            <option value="">选择团队</option>
            {managers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filters.memberId}
            onChange={(e) => setFilters((prev) => ({ ...prev, memberId: e.target.value }))}
            disabled={!members.length}
          >
            <option value="">全部成员</option>
            {members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filters.region}
            onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
          >
            <option value="">全部大区</option>
            {regions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">全部状态</option>
            {LEAD_STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
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
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>共 {items.length} 条</div>
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
              <th>主联系人</th>
              <th>状态</th>
              <th>负责人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.company_name}</td>
                <td>{item.region || '-'}</td>
                <td>{item.primary_contact_name || '-'}</td>
                <td>
                  <StatusChip status={item.status} />
                </td>
                <td>{item.owner_name || '-'}</td>
                <td>
                  <Link href={`/leads/${item.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    查看
                  </Link>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                  暂无符合条件的团队线索。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
