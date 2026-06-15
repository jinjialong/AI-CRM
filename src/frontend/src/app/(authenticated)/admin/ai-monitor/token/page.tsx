'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AuditActionDrawer } from '@/components/ai-monitor/audit-action-drawer';
import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { SideDrawer } from '@/components/common/side-drawer';
import { StatCard } from '@/components/common/stat-card';
import { StatusChip } from '@/components/common/status-chip';
import {
  getAuditActionDetail,
  getMonitorDateRange,
  getTokenCases,
  getTokenCapabilityDistribution,
  getTokenProcessingModes,
  getTokenSessionDetail,
  getTokenSummary,
  getTokenTopCost,
  getTokenTrend,
} from '@/lib/ai-monitor';
import { useAuth } from '@/lib/auth-context';
import type {
  AuditActionDetail,
  TokenCapabilityDistributionItem,
  TokenCaseItem,
  TokenMonitorSummary,
  TokenProcessingModeItem,
  TokenSessionDetail,
  TokenTopCost,
  TokenTrendPoint,
} from '@/types';

const RANGE_OPTIONS = [
  { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' },
];

const CAPABILITY_OPTIONS = [
  { value: '', label: '全部能力' },
  { value: 'create_lead', label: '创建线索' },
  { value: 'list_leads', label: '查询线索' },
  { value: 'list_public_pool', label: '查询公共池' },
  { value: 'list_customers', label: '查询客户' },
  { value: 'global_search', label: '综合查询' },
  { value: 'convert_lead', label: '转客户' },
  { value: 'draft_convert_lead', label: '发起转客户' },
];

const MODEL_OPTIONS = [
  { value: '', label: '全部模型' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
];

const RESULT_OPTIONS = [
  { value: '', label: '全部结果' },
  { value: 'lead_created', label: '创建成功' },
  { value: 'lead_list', label: '查询结果' },
  { value: 'customer_list', label: '客户列表' },
  { value: 'global_search', label: '综合查询' },
  { value: 'customer_created', label: '转客户成功' },
  { value: 'draft_action', label: '待确认' },
  { value: 'converted', label: '执行成功' },
  { value: 'message', label: '普通回复' },
];

const FALLBACK_OPTIONS = [
  { value: '', label: '全部兜底' },
  { value: 'true', label: '已兜底' },
  { value: 'false', label: '未兜底' },
];

function isAdmin(user: { role: string; roles?: string[] } | null) {
  return Boolean(user && (user.role === '系统管理员' || user.roles?.includes('系统管理员')));
}

function formatDateTime(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function formatNumber(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return String(Math.round(value));
}

function getResultLabel(value: string) {
  switch (value) {
    case 'lead_created':
      return '创建成功';
    case 'lead_list':
      return '查询结果';
    case 'customer_list':
      return '客户列表';
    case 'global_search':
      return '综合查询';
    case 'customer_created':
      return '转客户成功';
    case 'draft_action':
      return '待确认';
    case 'converted':
      return '执行成功';
    case 'message':
      return '普通回复';
    default:
      return value || '-';
  }
}

function getIntentLabel(value: string) {
  switch (value) {
    case 'create_lead':
      return '创建线索';
    case 'list_leads':
      return '查询线索';
    case 'list_public_pool':
      return '查询公共池';
    case 'list_customers':
      return '查询客户';
    case 'global_search':
      return '综合查询';
    case 'convert_lead':
      return '转客户';
    case 'draft_convert_lead':
      return '发起转客户';
    case 'confirm_action':
      return '确认执行';
    case 'show_config':
      return '查看配置';
    case 'chat':
      return '普通对话';
    case 'message':
      return '普通消息';
    case 'unknown':
      return '未识别意图';
    case 'error':
      return '异常失败';
    default:
      return value || '-';
  }
}

function getCapabilityLabel(item: Pick<TokenCaseItem, 'capability' | 'route_source' | 'result_kind'>) {
  if (item.capability === 'unknown') {
    if (item.route_source === 'fallback_after_unknown') return '模型未识别后补救';
    if (item.route_source === 'fallback_after_error') return '模型异常后补救';
  }
  if (item.capability === 'convert_lead' && item.result_kind === 'customer_created') return '确认转客户';
  return getIntentLabel(item.capability);
}

function getRouteLabel(value: string) {
  switch (value) {
    case 'openai_direct':
      return '模型直接命中';
    case 'fallback_after_unknown':
      return '模型未识别后补救';
    case 'fallback_after_error':
      return '模型异常后补救';
    case 'llm_skipped_no_api_key':
      return '未调用模型直接处理';
    case 'confirm_action':
      return '用户确认执行';
    case 'empty_message':
      return '空消息';
    default:
      return value || '-';
  }
}

function getModelLabel(value: string) {
  switch (value) {
    case 'deepseek-chat':
      return 'DeepSeek Chat';
    case 'gpt-4.1-mini':
      return 'GPT-4.1 mini';
    default:
      return value || '-';
  }
}

function getProcessingModeLabel(value: string) {
  switch (value) {
    case 'model_direct':
      return '模型直接处理';
    case 'model_unknown_recovery':
      return '模型未识别后补救';
    case 'model_error_recovery':
      return '模型异常后补救';
    case 'local_only':
      return '未调用模型直接处理';
    case 'pending_confirm':
      return '待确认动作';
    case 'confirmed_execution':
      return '用户确认后执行';
    default:
      return value || '-';
  }
}

function bucketColor(index: number) {
  const colors = ['#1677ff', '#fa8c16', '#52c41a', '#722ed1', '#eb2f96'];
  return colors[index % colors.length];
}

export default function AiMonitorTokenPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);

  const [range, setRange] = useState('7');
  const [capability, setCapability] = useState('');
  const [model, setModel] = useState('');
  const [resultKind, setResultKind] = useState('');
  const [fallbackUsed, setFallbackUsed] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('');

  const [summary, setSummary] = useState<TokenMonitorSummary | null>(null);
  const [trend, setTrend] = useState<TokenTrendPoint[]>([]);
  const [processingModes, setProcessingModes] = useState<TokenProcessingModeItem[]>([]);
  const [capabilityDistribution, setCapabilityDistribution] = useState<TokenCapabilityDistributionItem[]>([]);
  const [topCost, setTopCost] = useState<TokenTopCost | null>(null);
  const [cases, setCases] = useState<TokenCaseItem[]>([]);
  const [casesTotal, setCasesTotal] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<TokenSessionDetail | null>(null);
  const [detailWarning, setDetailWarning] = useState('');

  const [auditDetailOpen, setAuditDetailOpen] = useState(false);
  const [auditDetail, setAuditDetail] = useState<AuditActionDetail | null>(null);
  const [auditDetailWarning, setAuditDetailWarning] = useState('');
  const [auditWriteEffectOpen, setAuditWriteEffectOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [warning, setWarning] = useState('');

  const filters = useMemo(
    () => ({
      ...getMonitorDateRange(range),
      capability,
      model,
      result_kind: resultKind,
      fallback_used: fallbackUsed,
      search: appliedSearch,
      bucket: 'day',
      bucket_label: selectedBucket,
      page: 1,
      page_size: 20,
    }),
    [appliedSearch, capability, fallbackUsed, model, range, resultKind, selectedBucket],
  );

  const totalProcessingCount = useMemo(() => processingModes.reduce((total, item) => total + item.count, 0), [processingModes]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;

    async function loadDashboard() {
      setLoading(true);
      setTableLoading(true);
      const [summaryResult, trendResult, processingModesResult, capabilityDistributionResult, topCostResult, casesResult] = await Promise.all([
        getTokenSummary(filters),
        getTokenTrend(filters),
        getTokenProcessingModes(filters),
        getTokenCapabilityDistribution(filters),
        getTokenTopCost(filters),
        getTokenCases(filters),
      ]);
      if (!alive) return;
      setSummary(summaryResult.data);
      setTrend(trendResult.data);
      setProcessingModes(processingModesResult.data);
      setCapabilityDistribution(capabilityDistributionResult.data);
      setTopCost(topCostResult.data);
      setCases(casesResult.data.items);
      setCasesTotal(casesResult.data.total);
      setWarning(
        summaryResult.warning ||
          trendResult.warning ||
          processingModesResult.warning ||
          capabilityDistributionResult.warning ||
          topCostResult.warning ||
          casesResult.warning ||
          '',
      );
      setLoading(false);
      setTableLoading(false);
    }

    loadDashboard();
    return () => {
      alive = false;
    };
  }, [admin, filters]);

  useEffect(() => {
    if (!admin) return;
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (sessionId) openDetail(sessionId);
  }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (sessionId: string) => {
    setDetailOpen(true);
    setAuditDetailOpen(false);
    setAuditDetail(null);
    setAuditDetailWarning('');
    setDetail(null);
    setDetailWarning('');
    const result = await getTokenSessionDetail(sessionId);
    setDetail(result.data);
    setDetailWarning(result.warning || '');
  };

  const openAuditDetail = async (actionId: string) => {
    setAuditDetailOpen(true);
    setAuditDetail(null);
    setAuditDetailWarning('');
    setAuditWriteEffectOpen(false);
    const result = await getAuditActionDetail(actionId);
    setAuditDetail(result.data);
    setAuditDetailWarning(result.warning || '');
  };

  const closeTokenDetail = () => {
    setDetailOpen(false);
    setAuditDetailOpen(false);
    setAuditDetail(null);
    setAuditDetailWarning('');
  };

  if (!admin) {
    return <div className="card" style={{ padding: 24 }}>只有系统管理员可以查看 AI 助手 Token 监控页。</div>;
  }

  return (
    <div>
      <PageHeader
        title="AI 助手 Token 消耗监控"
        description="查看 Token 花费、调用效率、成本去向和请求明细。"
        actions={
          <Link href="/admin/ai-monitor/audit" className="secondary-btn">
            去看动作审计
          </Link>
        }
      />

      {warning ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: '#fffbe6', borderColor: '#ffe58f' }}>
          <div style={{ color: '#ad6800', fontSize: 13 }}>{warning}</div>
        </div>
      ) : null}

      <FilterCard>
        <div className="filter-grid-5">
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={capability} onChange={(event) => setCapability(event.target.value)}>
            {CAPABILITY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {MODEL_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={resultKind} onChange={(event) => setResultKind(event.target.value)}>
            {RESULT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto auto', gap: 12 }}>
            <select value={fallbackUsed} onChange={(event) => setFallbackUsed(event.target.value)}>
              {FALLBACK_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input placeholder="搜索会话 / 用例" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button
              className="primary-btn"
              onClick={() => {
                setAppliedSearch(search);
                setSelectedBucket('');
              }}
            >
              搜索
            </button>
            <button
              className="secondary-btn"
              onClick={() => {
                setRange('7');
                setCapability('');
                setModel('');
                setResultKind('');
                setFallbackUsed('');
                setSearch('');
                setAppliedSearch('');
                setSelectedBucket('');
              }}
            >
              重置
            </button>
          </div>
        </div>
      </FilterCard>

      <div className="grid-responsive-5" style={{ marginBottom: 20 }}>
        <StatCard label="总消耗量" value={loading ? '--' : formatNumber(summary?.total_tokens)} hint={`最近 ${range} 天 Token 总量`} color="#1677ff" />
        <StatCard label="总请求数" value={loading ? '--' : formatNumber(summary?.total_request_count)} hint="助手请求总数" color="#13c2c2" />
        <StatCard label="平均单次消耗" value={loading ? '--' : formatNumber(summary?.avg_total_tokens)} hint="按请求平均" color="#fa8c16" />
        <StatCard label="平均单会话消耗" value={loading ? '--' : formatNumber(summary?.avg_session_tokens)} hint="按会话聚合平均" color="#722ed1" />
        <StatCard label="平均耗时" value={loading || !summary ? '--' : `${Math.round(summary.avg_latency_ms)}ms`} hint="单次请求平均耗时" color="#52c41a" />
        <StatCard
          label="模型补救率"
          value={loading || !summary ? '--' : `${(summary.model_recovery_rate || 0).toFixed(1)}%`}
          hint="未识别/异常后的补救占比"
          color="#eb2f96"
        />
        <StatCard label="通过率" value={loading || !summary ? '--' : `${summary.pass_rate.toFixed(1)}%`} hint="按结果成功口径" color="#08979c" />
      </div>

      <div className="two-panel-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>总消耗趋势</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>点击日期可联动明细表</div>
          </div>
          {trend.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {trend.map((item, index) => {
                const max = Math.max(...trend.map((point) => point.total_tokens), 1);
                return (
                  <button
                    key={item.bucket_label}
                    type="button"
                    onClick={() => setSelectedBucket(item.bucket_label)}
                    style={{
                      border: selectedBucket === item.bucket_label ? '1px solid var(--blue)' : '1px solid var(--border-soft)',
                      borderRadius: 12,
                      background: selectedBucket === item.bucket_label ? '#f0f7ff' : '#fff',
                      padding: 12,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                      <span>{item.bucket_label}</span>
                      <strong>{item.total_tokens} Token</strong>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(4, (item.total_tokens / max) * 100)}%`, height: '100%', background: bucketColor(index) }} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前筛选条件下没有趋势数据。</div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>处理方式概览</div>
          {processingModes.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {processingModes.map((item, index) => (
                <div key={item.processing_mode}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span>{getProcessingModeLabel(item.processing_mode)}</span>
                    <span>{item.rate}% / {item.count} 条</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                    <div style={{ width: `${totalProcessingCount ? Math.max(4, (item.count / totalProcessingCount) * 100) : 0}%`, height: '100%', background: bucketColor(index) }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前筛选条件下没有处理方式数据。</div>
          )}
        </div>
      </div>

      <div className="two-panel-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>消耗去向</div>
          {capabilityDistribution.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {capabilityDistribution.map((item, index) => (
                <div key={item.capability} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: bucketColor(index), display: 'inline-block' }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-normal)' }}>{getIntentLabel(item.capability)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>平均 {formatNumber(item.avg_total_tokens)} / {item.request_count} 次</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {item.rate}% / {item.total_tokens} Token
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前筛选条件下没有消耗去向数据。</div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>高消耗请求 Top 5</div>
          {topCost?.top_cases?.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {topCost.top_cases.map((item, index) => (
                <button
                  key={item.case_id}
                  type="button"
                  onClick={() => openDetail(item.session_id)}
                  style={{
                    border: '1px solid var(--border-soft)',
                    borderRadius: 12,
                    background: '#fff',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>#{index + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-normal)' }}>{getIntentLabel(item.capability)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.case_id} / {item.latency_ms}ms</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{item.total_tokens}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前筛选条件下没有高消耗请求。</div>
          )}
        </div>
      </div>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>请求明细</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {selectedBucket ? `已按 ${selectedBucket} 联动筛选` : `共 ${casesTotal} 条`}
          </div>
        </div>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>用例</th>
              <th>能力</th>
              <th>时间</th>
              <th>模型</th>
              <th>输入消耗</th>
              <th>输出消耗</th>
              <th>总消耗</th>
              <th>耗时</th>
              <th>处理方式</th>
              <th>结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  正在刷新明细表...
                </td>
              </tr>
            ) : cases.length ? (
              cases.map((item) => (
                <tr key={item.case_id}>
                  <td>{item.case_id}</td>
                  <td>{getCapabilityLabel(item)}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{getModelLabel(item.model)}</td>
                  <td>{item.prompt_tokens}</td>
                  <td>{item.completion_tokens}</td>
                  <td>{item.total_tokens}</td>
                  <td>{item.latency_ms}ms</td>
                  <td>{getProcessingModeLabel(item.processing_mode || '')}</td>
                  <td>
                    <StatusChip status={getResultLabel(item.result_kind)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openDetail(item.session_id)}
                      style={{ border: 'none', background: 'transparent', color: 'var(--blue)', fontWeight: 600 }}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  当前筛选条件下没有运行明细。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SideDrawer
        open={detailOpen}
        title={detail?.session_id || '会话详情'}
        subtitle={detail ? `${getCapabilityLabel(detail)} / ${detail.user_name}` : '正在加载详情'}
        onClose={closeTokenDetail}
      >
        {detailWarning ? (
          <div className="card" style={{ padding: 12, marginBottom: 16, background: '#fffbe6', borderColor: '#ffe58f' }}>
            <div style={{ fontSize: 12, color: '#ad6800' }}>{detailWarning}</div>
          </div>
        ) : null}

        {!detail ? (
          <div style={{ color: 'var(--text-muted)' }}>正在加载详情...</div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ padding: 16, background: '#fafcff' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>基础信息</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div>结果：{getResultLabel(detail.result_kind)}</div>
                <div>处理方式：{getProcessingModeLabel(detail.processing_mode || '')}</div>
                <div>路由来源：{getRouteLabel(detail.route_source)}</div>
                <div>模型原始意图：{getIntentLabel(detail.llm_intent)}</div>
                <div>最终执行意图：{getIntentLabel(detail.final_intent)}</div>
              </div>
            </div>

            <div className="grid-responsive-4" style={{ gap: 12 }}>
              <div className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>输入消耗</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{detail.prompt_tokens}</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>输出消耗</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{detail.completion_tokens}</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>总消耗</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{detail.total_tokens}</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>调用耗时</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{detail.latency_ms}ms</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>轮次拆解</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {detail.turns.map((turn) => (
                  <div key={turn.turn_no} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>第 {turn.turn_no} 轮</div>
                    <div style={{ fontSize: 13, color: 'var(--text-normal)', marginBottom: 8 }}>{turn.input_excerpt}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                      {formatDateTime(turn.created_at)} / {turn.result_label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      输入 {turn.prompt_tokens} / 输出 {turn.completion_tokens} / 总消耗 {turn.total_tokens} / {turn.latency_ms}ms
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {detail.risk_notes.length ? (
              <div className="card" style={{ padding: 16, background: '#fff7e6', borderColor: '#ffd591' }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#ad6800' }}>风险提示</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {detail.risk_notes.map((note) => (
                    <div key={note} style={{ fontSize: 13, color: '#ad6800' }}>
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {detail.linked_actions.length ? (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>对应审计动作</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {detail.linked_actions.map((item) => (
                    <div key={item.action_id} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {getIntentLabel(item.action_type)} / {item.action_id}
                        </div>
                        <button type="button" className="secondary-btn" onClick={() => openAuditDetail(item.action_id)}>
                          查看审计详情
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatDateTime(item.created_at)} / 结果：{item.result} / 风险：{item.risk_level}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        是否写库：{item.write_applied ? '是' : '否'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : detail.linked_action_ids.length ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {detail.linked_action_ids.map((actionId) => (
                  <button key={actionId} type="button" className="secondary-btn" onClick={() => openAuditDetail(actionId)}>
                    查看审计 {actionId}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </SideDrawer>

      <AuditActionDrawer
        open={auditDetailOpen}
        detail={auditDetail}
        detailWarning={auditDetailWarning}
        onClose={() => setAuditDetailOpen(false)}
        onBack={() => setAuditDetailOpen(false)}
        writeEffectOpen={auditWriteEffectOpen}
        onToggleWriteEffect={() => setAuditWriteEffectOpen((prev) => !prev)}
        zIndex={1200}
      />
    </div>
  );
}
