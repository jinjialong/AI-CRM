'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { FilterCard } from '@/components/common/filter-card';
import { PageHeader } from '@/components/common/page-header';
import { SideDrawer } from '@/components/common/side-drawer';
import { StatCard } from '@/components/common/stat-card';
import { StatusChip } from '@/components/common/status-chip';
import {
  AI_MONITOR_OPTIONS,
  getMonitorDateRange,
  getAuditActionDetail,
  getAuditActions,
  getAuditObjectActions,
  getAuditSummary,
} from '@/lib/ai-monitor';
import { useAuth } from '@/lib/auth-context';
import type { AuditActionDetail, AuditActionItem, AuditSummary } from '@/types';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function resultLabel(value: string) {
  switch (value) {
    case '成功':
      return '成功';
    case '待确认':
      return '待确认';
    case '失败':
      return '失败';
    case '拒绝':
      return '拒绝';
    default:
      return value || '-';
  }
}

function riskColor(level: string) {
  if (level === '高') return '#cf1322';
  if (level === '中') return '#d46b08';
  return '#1677ff';
}

function getAuditIntentLabel(value: string) {
  switch (value) {
    case 'create_lead':
      return '创建线索';
    case 'list_leads':
      return '查询线索';
    case 'list_public_pool':
      return '查询公共线索池';
    case 'list_customers':
      return '查询客户';
    case 'global_search':
      return '综合查询';
    case 'convert_lead':
      return '转客户';
    case 'draft_convert_lead':
      return '发起转客户';
    case 'show_config':
      return '查看配置';
    case 'confirm_action':
      return '确认执行';
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

function getAuditRouteLabel(value: string) {
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

function getEntrypointLabel(value: string) {
  switch (value) {
    case '/assistant/message':
      return 'AI 助手主入口';
    default:
      return value || '-';
  }
}

function getPageContextLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text === 'assistant') return '助手面板';
  if (text === 'lead_list') return '线索列表页';
  if (text === 'lead_detail') return '线索详情页';
  return text
    .replace(/^Lead#/i, '线索#')
    .replace(/^Customer#/i, '客户#')
    .replace(/^Contact#/i, '联系人#');
}

function getConfirmStatusLabel(value: string) {
  switch (value) {
    case 'not_required':
      return '无需确认';
    case 'pending':
      return '待确认';
    case 'confirmed':
      return '已确认';
    default:
      return value || '-';
  }
}

function getObjectTypeLabel(value: string) {
  switch (value) {
    case 'Lead':
      return '线索';
    case 'Customer':
      return '客户';
    case 'Contact':
      return '联系人';
    default:
      return value || '-';
  }
}

function getChangeTypeLabel(value: string) {
  switch (value) {
    case 'create':
      return '新增';
    case 'update':
      return '更新';
    case 'delete':
      return '删除';
    default:
      return value || '-';
  }
}

function getTargetLabelDisplay(value: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text
    .replace(/^Lead#/i, '线索#')
    .replace(/^Customer#/i, '客户#')
    .replace(/^Contact#/i, '联系人#');
}

export default function AiMonitorAuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [range, setRange] = useState('7');
  const [capability, setCapability] = useState('');
  const [actionType, setActionType] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [result, setResult] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [actions, setActions] = useState<AuditActionItem[]>([]);
  const [detail, setDetail] = useState<AuditActionDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [writeEffectOpen, setWriteEffectOpen] = useState(false);
  const [objectTraceTarget, setObjectTraceTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [detailWarning, setDetailWarning] = useState('');

  const filters = useMemo(
    () => {
      const dateRange = getMonitorDateRange(range);
      return {
        ...dateRange,
        capability,
        action_type: actionType,
        risk_level: riskLevel,
        result,
        search: appliedSearch,
        page: 1,
        page_size: 20,
      };
    },
    [actionType, appliedSearch, capability, range, result, riskLevel],
  );

  const loadAudit = async () => {
    setLoading(true);
    const [summaryResult, actionsResult] = await Promise.all([getAuditSummary(filters), getAuditActions(filters)]);
    setSummary(summaryResult.data);
    setActions(actionsResult.data.items);
    setWarning(summaryResult.warning || actionsResult.warning || '');
    setLoading(false);
  };

  const updateUrlParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const traceObject = async (objectType: string, objectId: string, label: string) => {
    setLoading(true);
    setObjectTraceTarget({ type: objectType, id: objectId, label });
    updateUrlParams({
      object_type: objectType,
      object_id: objectId,
      object_label: label,
      action_id: null,
    });
    const dateRange = getMonitorDateRange(range);
    const [summaryResult, actionsResult] = await Promise.all([
      getAuditSummary({
        ...dateRange,
        capability,
        action_type: actionType,
        risk_level: riskLevel,
        result,
        search: appliedSearch,
        page: 1,
        page_size: 20,
      }),
      getAuditObjectActions({
        object_type: objectType,
        object_id: objectId,
        date_from: dateRange.date_from,
        date_to: dateRange.date_to,
        page: 1,
        page_size: 20,
      }),
    ]);
    setSummary(summaryResult.data);
    setActions(actionsResult.data.items);
    setWarning(summaryResult.warning || actionsResult.warning || '');
    setLoading(false);
    setDetailOpen(false);
  };

  const openDetail = async (actionId: string) => {
    setDetailOpen(true);
    setWriteEffectOpen(false);
    setDetail(null);
    setDetailWarning('');
    updateUrlParams({ action_id: actionId });
    const result = await getAuditActionDetail(actionId);
    setDetail(result.data);
    setDetailWarning(result.warning || '');
  };

  useEffect(() => {
    if (user?.role !== '系统管理员') return;
    loadAudit();
  }, [user, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.role !== '系统管理员') return;
    const actionId = new URLSearchParams(window.location.search).get('action_id');
    if (!actionId) return;
    openDetail(actionId);
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.role !== '系统管理员') return;
    const params = new URLSearchParams(window.location.search);
    const objectType = params.get('object_type');
    const objectId = params.get('object_id');
    const objectLabel = params.get('object_label') || '';
    if (!objectType || !objectId) return;
    if (objectTraceTarget?.type === objectType && objectTraceTarget?.id === objectId) return;
    traceObject(objectType, objectId, objectLabel || `${objectType}#${objectId}`);
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== '系统管理员') {
    return (
      <div className="card" style={{ padding: 24 }}>
        只有系统管理员可以查看 AI 动作审计页。
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI 动作审计"
        description="追查 AI 每一次判断、每一个待确认动作、每一次正式写库和失败原因。"
        actions={
          <Link href="/admin/ai-monitor/token" className="secondary-btn">
            去看 Token 监控
          </Link>
        }
      />

      {warning ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: '#fffbe6', borderColor: '#ffe58f' }}>
          <div style={{ color: '#ad6800', fontSize: 13 }}>{warning}</div>
        </div>
      ) : null}

      <FilterCard>
        <div className="filter-grid-8">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {AI_MONITOR_OPTIONS.range.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            {AI_MONITOR_OPTIONS.capability.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {AI_MONITOR_OPTIONS.actionType.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
            {AI_MONITOR_OPTIONS.risk.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            {AI_MONITOR_OPTIONS.auditResult.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            placeholder="搜索会话 / 对象 / 输入摘要"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="primary-btn" onClick={() => setAppliedSearch(search)}>
            搜索
          </button>
          <button
            className="secondary-btn"
            onClick={() => {
              setRange('7');
              setCapability('');
              setActionType('');
              setRiskLevel('');
              setResult('');
              setSearch('');
              setAppliedSearch('');
              setObjectTraceTarget(null);
              updateUrlParams({
                object_type: null,
                object_id: null,
                object_label: null,
                action_id: null,
              });
            }}
          >
            重置
          </button>
          {objectTraceTarget ? (
            <button
              className="secondary-btn"
              onClick={() => {
                setObjectTraceTarget(null);
                updateUrlParams({
                  object_type: null,
                  object_id: null,
                  object_label: null,
                });
                loadAudit();
              }}
            >
              退出对象追查
            </button>
          ) : null}
        </div>
      </FilterCard>

      <div className="grid-responsive-5" style={{ marginBottom: 20 }}>
        <StatCard
          label="总动作数"
          value={loading || !summary ? '--' : String(summary.total_action_count)}
          hint={loading || !summary ? '加载中' : 'AI 执行链路总数'}
          color="#1677ff"
        />
        <StatCard
          label="写入动作数"
          value={loading || !summary ? '--' : String(summary.write_action_count)}
          hint={loading || !summary ? '加载中' : '真实业务写库'}
          color="#52c41a"
        />
        <StatCard
          label="高风险动作数"
          value={loading || !summary ? '--' : String(summary.high_risk_action_count)}
          hint={loading || !summary ? '加载中' : '转客户等高风险动作'}
          color="#cf1322"
        />
        <StatCard
          label="待确认动作数"
          value={loading || !summary ? '--' : String(summary.pending_confirm_count)}
          hint={loading || !summary ? '加载中' : '等待用户确认'}
          color="#fa8c16"
        />
        <StatCard
          label="失败动作数"
          value={loading || !summary ? '--' : String(summary.failed_action_count)}
          hint={loading || !summary ? '加载中' : '权限/对象/校验失败'}
          color="#722ed1"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>动作类型分布</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {(summary?.action_type_breakdown || []).map((item, index) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>{getAuditIntentLabel(item.label)}</span>
                  <span>{item.count}</span>
                </div>
                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${Math.max(12, Math.min(100, item.count / 12))}%`,
                      height: '100%',
                      background: ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2'][index % 5],
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>风险预警区</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {(summary?.risk_alerts || []).map((item) => (
              <div
                key={item}
                style={{
                  border: '1px solid #ffd591',
                  background: '#fff7e6',
                  color: '#ad6800',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 13,
                }}
              >
                {item}
              </div>
            ))}
            {!summary?.risk_alerts?.length ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前暂无风险预警。</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>动作审计主表</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {objectTraceTarget ? `按对象追查中：${getTargetLabelDisplay(objectTraceTarget.label)}` : '当前为全局动作视图'}
          </div>
        </div>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>时间</th>
              <th>会话编号</th>
              <th>用户</th>
              <th>原始输入摘要</th>
              <th>AI 判断意图</th>
              <th>实际执行动作</th>
              <th>目标对象</th>
              <th>风险</th>
              <th>结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {actions.length ? (
              actions.map((item) => (
                <tr key={item.action_id}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.session_id}</td>
                  <td>{item.user_name}</td>
                  <td>{item.input_excerpt}</td>
                  <td>{getAuditIntentLabel(item.llm_intent)}</td>
                  <td>{getAuditIntentLabel(item.executed_action)}</td>
                  <td>{getTargetLabelDisplay(item.target_label)}</td>
                  <td>
                    <span
                      className="chip"
                      style={{
                        background: `${riskColor(item.risk_level)}18`,
                        color: riskColor(item.risk_level),
                      }}
                    >
                      {item.risk_level}
                    </span>
                  </td>
                  <td>
                    <StatusChip status={resultLabel(item.result)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openDetail(item.action_id)}
                      style={{ border: 'none', background: 'transparent', color: 'var(--blue)', fontWeight: 600 }}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  当前筛选条件下没有审计动作。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SideDrawer
        open={detailOpen}
        title={detail?.action_id || '动作详情'}
        subtitle={detail ? `${getAuditIntentLabel(detail.action_type)} / ${detail.user_name}` : '正在加载详情'}
        onClose={() => {
          setDetailOpen(false);
          updateUrlParams({ action_id: null });
        }}
        width={520}
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
                <div>时间：{formatDateTime(detail.created_at)}</div>
                <div>会话编号：{detail.session_id}</div>
                <div>入口：{getEntrypointLabel(detail.entrypoint)}</div>
                <div>页面上下文：{getPageContextLabel(detail.page_context)}</div>
                <div>原始输入：{detail.input_excerpt}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>AI 判断</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div>模型原始意图：{getAuditIntentLabel(detail.llm_intent)}</div>
                <div>最终执行意图：{getAuditIntentLabel(detail.final_intent)}</div>
                <div>路由来源：{getAuditRouteLabel(detail.route_source)}</div>
                <div>是否走兜底：{detail.fallback_used ? '是' : '否'}</div>
                <div>风险等级：{detail.risk_level}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>执行动作</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div>动作类型：{getAuditIntentLabel(detail.action_type)}</div>
                <div>是否写库：{detail.write_applied ? '是' : '否'}</div>
                <div>是否需要确认：{detail.confirm_required ? '是' : '否'}</div>
                <div>确认状态：{getConfirmStatusLabel(detail.confirm_status)}</div>
                <div>当前结果：{detail.result}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>链路时间线</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {detail.timeline.map((item) => (
                  <div key={`${item.label}-${item.detail}`} style={{ borderLeft: '3px solid var(--blue)', paddingLeft: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>相关对象</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {detail.target_objects.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => traceObject(item.type, item.id, item.label)}
                    style={{
                      border: '1px solid var(--border-soft)',
                      background: '#fafcff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-normal)',
                    }}
                  >
                    {getObjectTypeLabel(item.type)} #{item.id} / {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>相关消耗</div>
              <div className="grid-responsive-4" style={{ gap: 10 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    输入
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.prompt_tokens}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    输出
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.completion_tokens}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    总消耗
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.total_tokens}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    耗时
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.latency_ms}ms</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="secondary-btn" onClick={() => setWriteEffectOpen((prev) => !prev)}>
                {writeEffectOpen ? '收起写库影响' : '查看写库影响'}
              </button>
              <Link href={`/admin/ai-monitor/token?session_id=${encodeURIComponent(detail.session_id)}`} className="secondary-btn">
                查看同会话 Token 详情
              </Link>
            </div>

            {writeEffectOpen ? (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>写库影响明细</div>
                {detail.write_effect.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {detail.write_effect.map((item) => (
                      <div key={`${item.object_type}-${item.object_id}`} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, padding: 14 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                          {getObjectTypeLabel(item.object_type)} #{item.object_id} / {item.object_label}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                          变更类型：{getChangeTypeLabel(item.change_type)}
                        </div>
                        <div style={{ fontSize: 13 }}>变更前：{item.before_summary}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>变更后：{item.after_summary}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                          是否写审计日志：{item.audit_written ? '是' : '否'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>当前动作没有实际写库影响。</div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
