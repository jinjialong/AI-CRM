'use client';

import { useEffect, useMemo, useState } from 'react';

import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TEAM_REPORT_COMPLETION_OPTIONS, isManagerOrAdmin } from '@/lib/crm-options';
import { UserInfo } from '@/types';

type TeamReportRow = {
  member: UserInfo;
  completed: boolean;
  report: {
    report_date: string;
    today_work: string;
    progress_result: string;
    issues: string;
    tomorrow_plan: string;
    created_at?: string;
    updated_at?: string;
  } | null;
};

type Filters = {
  reportDate: string;
  managerId: string;
  memberId: string;
  completionStatus: string;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

export default function TeamReportsPage() {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [members, setMembers] = useState<UserInfo[]>([]);
  const [items, setItems] = useState<TeamReportRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const managers = useMemo(() => allUsers.filter((item) => item.role === '销售经理'), [allUsers]);

  const defaultManagerId = useMemo(() => {
    if (!user || !isManagerOrAdmin(user.role)) return '';
    if (user.role === '销售经理') return String(user.id);
    return managers.length ? String(managers[0].id) : '';
  }, [user, managers]);

  const [filters, setFilters] = useState<Filters>({
    reportDate: todayString(),
    managerId: '',
    memberId: '',
    completionStatus: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    reportDate: todayString(),
    managerId: '',
    memberId: '',
    completionStatus: '',
  });

  useEffect(() => {
    if (!user || !isManagerOrAdmin(user.role)) return;
    api
      .get<{ items: UserInfo[] }>('/admin/users')
      .then((result) => setAllUsers(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载团队成员失败'));
  }, [user]);

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
    if (!filters.managerId) {
      setMembers([]);
      return;
    }
    api
      .get<{ items: UserInfo[] }>(`/team/members?manager_id=${encodeURIComponent(filters.managerId)}`)
      .then((result) => setMembers(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载团队成员失败'));
  }, [filters.managerId]);

  useEffect(() => {
    if (!appliedFilters.managerId) {
      setItems([]);
      return;
    }
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          report_date: appliedFilters.reportDate,
          manager_id: appliedFilters.managerId,
        });
        if (appliedFilters.memberId) params.set('member_id', appliedFilters.memberId);
        if (appliedFilters.completionStatus) params.set('completion_status', appliedFilters.completionStatus);
        const result = await api.get<{ items: TeamReportRow[] }>(`/team/daily-reports?${params.toString()}`);
        setItems(result.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载团队日报失败');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [appliedFilters]);

  const handleSearch = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    const nextFilters = {
      reportDate: todayString(),
      managerId: defaultManagerId,
      memberId: '',
      completionStatus: '',
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  if (!user || !isManagerOrAdmin(user.role)) {
    return (
      <div className="card" style={{ padding: 24 }}>
        无权访问团队日报。
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="团队日报" description="保留团队筛选，从列表视角查看成员日报提交和内容情况。" />

      {error ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#cf1322' }}>
          {error}
        </div>
      ) : null}

      <FilterCard>
        <div className="filter-grid-5">
          <input
            type="date"
            value={filters.reportDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, reportDate: e.target.value }))}
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
            value={filters.completionStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, completionStatus: e.target.value }))}
          >
            {TEAM_REPORT_COMPLETION_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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
              <th>成员</th>
              <th>角色</th>
              <th>提交状态</th>
              <th>日报日期</th>
              <th>提交时间</th>
              <th>今日工作</th>
              <th>今日进展</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((item) => (
                <tr key={`${item.member.id}-${item.report?.report_date || appliedFilters.reportDate}`}>
                  <td>{item.member.name}</td>
                  <td>{item.member.role}</td>
                  <td style={{ color: item.completed ? '#389e0d' : '#cf1322', fontWeight: 700 }}>
                    {item.completed ? '已提交' : '未提交'}
                  </td>
                  <td>{item.report?.report_date || appliedFilters.reportDate}</td>
                  <td>{formatDateTime(item.report?.updated_at || item.report?.created_at)}</td>
                  <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {item.report?.today_work || '暂无日报内容'}
                  </td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {item.report?.progress_result || '-'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? '正在加载团队日报...' : '暂无符合条件的团队日报。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
