'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { LEAD_STATUS_OPTIONS, isManagerOrAdmin } from '@/lib/crm-options';
import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { StatusChip } from '@/components/common/status-chip';
import { Lead, UserInfo } from '@/types';

export default function TeamLeadsPage() {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [managerId, setManagerId] = useState('');
  const [members, setMembers] = useState<UserInfo[]>([]);
  const [items, setItems] = useState<Lead[]>([]);
  const [memberId, setMemberId] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const managers = useMemo(
    () => allUsers.filter((item) => item.role === '销售经理'),
    [allUsers]
  );

  const regions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.region).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  useEffect(() => {
    if (!user || !isManagerOrAdmin(user.role)) return;
    api
      .get<{ items: UserInfo[] }>('/admin/users')
      .then((result) => setAllUsers(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载团队信息失败'));
  }, [user]);

  useEffect(() => {
    if (!user || !isManagerOrAdmin(user.role)) return;
    if (user.role === '销售经理') {
      setManagerId(String(user.id));
      return;
    }
    if (!managerId && managers.length) {
      setManagerId(String(managers[0].id));
    }
  }, [user, managers, managerId]);

  useEffect(() => {
    setMemberId('');
  }, [managerId]);

  useEffect(() => {
    if (!managerId) {
      setMembers([]);
      return;
    }
    api
      .get<{ items: UserInfo[] }>(`/team/members?manager_id=${encodeURIComponent(managerId)}`)
      .then((result) => setMembers(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载团队成员失败'));
  }, [managerId]);

  const loadData = async () => {
    if (!managerId) {
      setItems([]);
      return;
    }
    setError('');
    try {
      const params = new URLSearchParams({ manager_id: managerId });
      if (memberId) params.set('member_id', memberId);
      if (region) params.set('region', region);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const result = await api.get<{ items: Lead[] }>(`/team/leads?${params.toString()}`);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载团队线索失败');
    }
  };

  useEffect(() => {
    loadData();
  }, [managerId, memberId, region, status, search]); // eslint-disable-line react-hooks/exhaustive-deps

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
            gridTemplateColumns: '1.4fr 180px 180px 180px 180px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按公司、组织代码、联系人搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={user.role === '销售经理'}
          >
            <option value="">选择团队</option>
            {managers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} disabled={!members.length}>
            <option value="">全部成员</option>
            {members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">全部大区</option>
            {regions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {LEAD_STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button className="secondary-btn" onClick={loadData}>
              刷新
            </button>
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
