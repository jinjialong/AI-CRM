'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { StatusChip } from '@/components/common/status-chip';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { LEAD_STATUS_OPTIONS, isManagerOrAdmin } from '@/lib/crm-options';
import { useTeamScope } from '@/lib/team-filter';
import { Lead, UserInfo } from '@/types';

type TeamOverviewLeadRow = Lead & {
  probability: number;
  latest_activity_at: string;
};

type TeamOverviewMemberSummary = {
  member: UserInfo;
  lead_count: number;
  report_completed: boolean;
  average_probability: number;
  potential_amount: number;
  latest_activity_at: string | null;
};

type Overview = {
  team_manager_id: number;
  team_member_count: number;
  lead_count: number;
  status_counts: Record<string, number>;
  report_done_count: number;
  report_pending_count: number;
  lead_rows: TeamOverviewLeadRow[];
  member_summaries: TeamOverviewMemberSummary[];
};

type ViewMode = 'lead' | 'member';

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function formatAmount(value: number) {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const [managerId, setManagerId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('lead');
  const [activeStatus, setActiveStatus] = useState('');
  const { managers, defaultManagerId } = useTeamScope(user, setError);

  useEffect(() => {
    if (!defaultManagerId) return;
    if (!managerId) {
      setManagerId(defaultManagerId);
    }
  }, [defaultManagerId, managerId]);

  const loadData = async () => {
    if (!managerId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.get<Overview>(`/team/overview?manager_id=${encodeURIComponent(managerId)}`);
      setData(result);
      setActiveStatus('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载团队概览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [managerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLeadRows = useMemo(() => {
    if (!data) return [];
    if (!activeStatus) return data.lead_rows;
    return data.lead_rows.filter((item) => item.status === activeStatus);
  }, [data, activeStatus]);

  const handleReset = () => {
    setManagerId(defaultManagerId);
    setViewMode('lead');
    setActiveStatus('');
  };

  if (!user || !isManagerOrAdmin(user.role)) {
    return (
      <div className="card" style={{ padding: 24 }}>
        无权访问团队概览。
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="团队概览" description="从线索状态分布和团队情况两个角度查看团队盘子、状态分布与执行情况。" />

      {error ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#cf1322' }}>
          {error}
        </div>
      ) : null}

      <FilterCard>
        <div className="filter-grid-2">
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={loadData}>
                搜索
              </button>
              <button className="secondary-btn" onClick={handleReset}>
                重置
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {data ? `团队成员 ${data.team_member_count} 人` : '请选择团队'}
            </div>
          </div>
        </div>
      </FilterCard>

      {!data ? (
        <div className="card" style={{ padding: 20 }}>
          {loading ? '正在加载团队概览...' : '请选择团队后查看概览。'}
        </div>
      ) : (
        <>
          <div
            className="grid-responsive-4"
            style={{
              marginBottom: 20,
            }}
          >
            <StatCard label="团队成员" value={String(data.team_member_count)} hint="当前直属销售人数" color="#1677ff" />
            <StatCard label="团队线索" value={String(data.lead_count)} hint="当前成员名下线索" color="#fa8c16" />
            <StatCard label="今日日报已交" value={String(data.report_done_count)} hint="日报完成数" color="#52c41a" />
            <StatCard label="今日日报未交" value={String(data.report_pending_count)} hint="待补日报人数" color="#cf1322" />
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>线索状态分布</div>
            <div className="grid-responsive-5">
              {LEAD_STATUS_OPTIONS.map((status) => {
                const selected = activeStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setViewMode('lead');
                      setActiveStatus((prev) => (prev === status ? '' : status));
                    }}
                    style={{
                      textAlign: 'left',
                      border: selected ? '1px solid #91caff' : '1px solid var(--border-soft)',
                      borderRadius: 10,
                      padding: 14,
                      background: selected ? '#f0f7ff' : '#fafcff',
                      boxShadow: selected ? '0 8px 18px rgba(24, 144, 255, 0.12)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{status}</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>{data.status_counts[status] || 0}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className={viewMode === 'lead' ? 'primary-btn' : 'secondary-btn'}
                  onClick={() => setViewMode('lead')}
                >
                  线索列表
                </button>
                <button
                  type="button"
                  className={viewMode === 'member' ? 'primary-btn' : 'secondary-btn'}
                  onClick={() => setViewMode('member')}
                >
                  团队情况
                </button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {viewMode === 'lead'
                  ? activeStatus
                    ? `当前筛选：${activeStatus}，共 ${filteredLeadRows.length} 条`
                    : `点击上方状态分布可筛选线索，当前共 ${filteredLeadRows.length} 条`
                  : `成员列表，共 ${data.member_summaries.length} 人`}
              </div>
            </div>

            {viewMode === 'lead' ? (
              <div className="table-wrap" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>公司名称</th>
                      <th>负责人</th>
                      <th>状态</th>
                      <th>概率</th>
                      <th>最近活动</th>
                      <th>联系人</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeadRows.length ? (
                      filteredLeadRows.map((item) => (
                        <tr key={item.id}>
                          <td>{item.company_name}</td>
                          <td>{item.owner_name || '-'}</td>
                          <td>
                            <StatusChip status={item.status} />
                          </td>
                          <td>{item.probability}%</td>
                          <td>{formatDateTime(item.latest_activity_at)}</td>
                          <td>{item.primary_contact_name || '-'}</td>
                          <td>
                            <Link href={`/leads/${item.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                              查看
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                          暂无符合条件的线索。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-wrap" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>角色</th>
                      <th>线索数</th>
                      <th>平均概率</th>
                      <th>潜在总金额</th>
                      <th>最近活动</th>
                      <th>日报状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.member_summaries.length ? (
                      data.member_summaries.map((item) => (
                        <tr key={item.member.id}>
                          <td>{item.member.name}</td>
                          <td>{item.member.role}</td>
                          <td>{item.lead_count}</td>
                          <td>{item.average_probability}%</td>
                          <td>{formatAmount(item.potential_amount)}</td>
                          <td>{formatDateTime(item.latest_activity_at)}</td>
                          <td style={{ color: item.report_completed ? '#389e0d' : '#cf1322', fontWeight: 700 }}>
                            {item.report_completed ? '今日已提交' : '今日未提交'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                          当前团队暂无成员。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
