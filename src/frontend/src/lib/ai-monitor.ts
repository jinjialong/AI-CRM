'use client';

import { api, ApiError } from '@/lib/api';
import type {
  AuditActionDetail,
  AuditActionItem,
  AuditSummary,
  MonitorLoadResult,
  TokenCapabilityDistributionItem,
  TokenCaseItem,
  TokenFallbackBreakdownItem,
  TokenProcessingModeItem,
  TokenRouteSourceItem,
  TokenMonitorSummary,
  TokenSessionDetail,
  TokenTopCost,
  TokenTrendPoint,
} from '@/types';

type TokenFilters = {
  date_from?: string;
  date_to?: string;
  capability?: string;
  model?: string;
  result_kind?: string;
  fallback_used?: string;
  search?: string;
  page?: number;
  page_size?: number;
  bucket?: string;
  bucket_label?: string;
};

type AuditFilters = {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  capability?: string;
  action_type?: string;
  risk_level?: string;
  result?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMonitorDateRange(days: string) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(Number(days || 7) - 1, 0));
  return {
    date_from: toDateInputValue(start),
    date_to: toDateInputValue(end),
  };
}

function asErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

const demoTokenSummary: TokenMonitorSummary = {
  total_tokens: 15600,
  total_request_count: 12486,
  avg_total_tokens: 1248,
  avg_session_tokens: 1862,
  avg_latency_ms: 1420,
  fallback_rate: 8.6,
  model_recovery_rate: 3.2,
  pass_rate: 94.2,
  avg_prompt_tokens: 910,
  avg_completion_tokens: 338,
};

const demoTokenTrend: TokenTrendPoint[] = [
  { bucket_label: '06-08', total_tokens: 1080, prompt_tokens: 790, completion_tokens: 290, avg_latency_ms: 1310 },
  { bucket_label: '06-09', total_tokens: 1160, prompt_tokens: 838, completion_tokens: 322, avg_latency_ms: 1375 },
  { bucket_label: '06-10', total_tokens: 1224, prompt_tokens: 896, completion_tokens: 328, avg_latency_ms: 1402 },
  { bucket_label: '06-11', total_tokens: 1348, prompt_tokens: 978, completion_tokens: 370, avg_latency_ms: 1490 },
  { bucket_label: '06-12', total_tokens: 1286, prompt_tokens: 932, completion_tokens: 354, avg_latency_ms: 1433 },
];

const demoTokenRouteSources: TokenRouteSourceItem[] = [
  { route_source: 'openai_direct', count: 68, rate: 68 },
  { route_source: 'fallback_after_unknown', count: 17, rate: 17 },
  { route_source: 'confirm_action', count: 7, rate: 7 },
  { route_source: 'fallback_after_error', count: 6, rate: 6 },
  { route_source: 'empty_message', count: 2, rate: 2 },
];

const demoTokenFallbackBreakdown: TokenFallbackBreakdownItem[] = [
  { reason: 'high_risk_guardrail', count: 9, rate_in_fallback: 52.94 },
  { reason: 'model_unknown_recovery', count: 6, rate_in_fallback: 35.29 },
  { reason: 'model_error_recovery', count: 2, rate_in_fallback: 11.77 },
];

const demoTokenProcessingModes: TokenProcessingModeItem[] = [
  { processing_mode: 'model_direct', count: 80, rate: 80 },
  { processing_mode: 'pending_confirm', count: 10, rate: 10 },
  { processing_mode: 'confirmed_execution', count: 5, rate: 5 },
  { processing_mode: 'model_unknown_recovery', count: 3, rate: 3 },
  { processing_mode: 'model_error_recovery', count: 2, rate: 2 },
];

const demoTokenCapabilityDistribution: TokenCapabilityDistributionItem[] = [
  { capability: 'create_lead', total_tokens: 6800, request_count: 5, rate: 43.59, avg_total_tokens: 1360 },
  { capability: 'list_leads', total_tokens: 3100, request_count: 4, rate: 19.87, avg_total_tokens: 775 },
  { capability: 'list_customers', total_tokens: 2100, request_count: 3, rate: 13.46, avg_total_tokens: 700 },
  { capability: 'convert_lead', total_tokens: 1600, request_count: 4, rate: 10.26, avg_total_tokens: 400 },
];

const demoTokenTopCost: TokenTopCost = {
  top_capabilities: demoTokenCapabilityDistribution,
  top_cases: [
    {
      case_id: 'AI-1001',
      session_id: 'S-20260612-001',
      capability: 'create_lead',
      total_tokens: 1230,
      latency_ms: 1180,
      created_at: '2026-06-12T10:02:00+08:00',
    },
  ],
  top_sessions: [
    {
      session_id: 'S-20260612-002',
      capability: 'create_lead',
      total_tokens: 1860,
      request_count: 2,
    },
  ],
};

const demoTokenCases: TokenCaseItem[] = [
  {
    case_id: 'CL-01',
    capability: 'create_lead',
    created_at: '2026-06-12T10:02:00+08:00',
    model: 'gpt-4.1-mini',
    prompt_tokens: 920,
    completion_tokens: 310,
    total_tokens: 1230,
    latency_ms: 1180,
    route_source: 'openai_direct',
    result_kind: 'lead_created',
    session_id: 'S-20260612-001',
    user_name: 'sales01',
    fallback_used: false,
    processing_mode: 'model_direct',
    llm_intent: 'create_lead',
    final_intent: 'create_lead',
  },
  {
    case_id: 'CL-02',
    capability: 'create_lead',
    created_at: '2026-06-12T10:05:00+08:00',
    model: 'gpt-4.1-mini',
    prompt_tokens: 840,
    completion_tokens: 420,
    total_tokens: 1260,
    latency_ms: 1430,
    route_source: 'fallback_after_unknown',
    result_kind: 'lead_created',
    session_id: 'S-20260612-002',
    user_name: 'sales01',
    fallback_used: true,
    processing_mode: 'model_unknown_recovery',
    llm_intent: 'unknown',
    final_intent: 'create_lead',
  },
  {
    case_id: 'LL-01',
    capability: 'list_leads',
    created_at: '2026-06-12T10:06:00+08:00',
    model: 'gpt-4.1-mini',
    prompt_tokens: 610,
    completion_tokens: 180,
    total_tokens: 790,
    latency_ms: 820,
    route_source: 'openai_direct',
    result_kind: 'lead_list',
    session_id: 'S-20260612-003',
    user_name: 'sales02',
    fallback_used: false,
    processing_mode: 'model_direct',
    llm_intent: 'list_leads',
    final_intent: 'list_leads',
  },
  {
    case_id: 'CV-02',
    capability: 'convert_lead',
    created_at: '2026-06-12T10:10:00+08:00',
    model: 'gpt-4.1-mini',
    prompt_tokens: 760,
    completion_tokens: 260,
    total_tokens: 1020,
    latency_ms: 1540,
    route_source: 'fallback_after_unknown',
    result_kind: 'draft_action',
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    fallback_used: true,
    processing_mode: 'pending_confirm',
    llm_intent: 'unknown',
    final_intent: 'convert_lead',
  },
];

const demoTokenSessionDetails: Record<string, TokenSessionDetail> = {
  'S-20260612-001': {
    session_id: 'S-20260612-001',
    user_name: 'sales01',
    capability: 'create_lead',
    model: 'gpt-4.1-mini',
    result_kind: 'lead_created',
    route_source: 'openai_direct',
    fallback_used: false,
    processing_mode: 'model_direct',
    prompt_tokens: 920,
    completion_tokens: 310,
    total_tokens: 1230,
    latency_ms: 1180,
    llm_intent: 'create_lead',
    final_intent: 'create_lead',
    risk_notes: ['一次完整创建，未触发兜底'],
    linked_action_ids: ['A-20260612-1001'],
    linked_actions: [
      {
        action_id: 'A-20260612-1001',
        created_at: '2026-06-12T10:02:14+08:00',
        action_type: 'create_lead',
        result: '成功',
        risk_level: '中',
        write_applied: true,
      },
    ],
    turns: [
      {
        turn_no: 1,
        created_at: '2026-06-12T10:02:00+08:00',
        input_excerpt: '帮我建个线索，公司叫华北科技，联系人张三，手机号138****0001',
        result_label: '创建成功',
        prompt_tokens: 920,
        completion_tokens: 310,
        total_tokens: 1230,
        latency_ms: 1180,
      },
    ],
  },
  'S-20260612-002': {
    session_id: 'S-20260612-002',
    user_name: 'sales01',
    capability: 'create_lead',
    model: 'gpt-4.1-mini',
    result_kind: 'lead_created',
    route_source: 'fallback_after_unknown',
    fallback_used: true,
    processing_mode: 'model_unknown_recovery',
    prompt_tokens: 840,
    completion_tokens: 420,
    total_tokens: 1260,
    latency_ms: 1430,
    llm_intent: 'unknown',
    final_intent: 'create_lead',
    risk_notes: ['最近 5 次运行里有 2 次走兜底', '最大总消耗量比中位数高 1.9 倍'],
    linked_action_ids: ['A-20260612-1002'],
    linked_actions: [
      {
        action_id: 'A-20260612-1002',
        created_at: '2026-06-12T10:05:00+08:00',
        action_type: 'create_lead',
        result: '成功',
        risk_level: '中',
        write_applied: true,
      },
    ],
    turns: [
      {
        turn_no: 1,
        created_at: '2026-06-12T10:04:18+08:00',
        input_excerpt: '帮我建个线索，公司叫华东制造',
        result_label: '缺字段',
        prompt_tokens: 420,
        completion_tokens: 220,
        total_tokens: 640,
        latency_ms: 710,
      },
      {
        turn_no: 2,
        created_at: '2026-06-12T10:05:00+08:00',
        input_excerpt: '联系人李四，手机号139****0022',
        result_label: '创建成功',
        prompt_tokens: 420,
        completion_tokens: 200,
        total_tokens: 620,
        latency_ms: 720,
      },
    ],
  },
  'S-20260612-003': {
    session_id: 'S-20260612-003',
    user_name: 'sales02',
    capability: 'list_leads',
    model: 'gpt-4.1-mini',
    result_kind: 'lead_list',
    route_source: 'openai_direct',
    fallback_used: false,
    processing_mode: 'model_direct',
    prompt_tokens: 610,
    completion_tokens: 180,
    total_tokens: 790,
    latency_ms: 820,
    llm_intent: 'list_leads',
    final_intent: 'list_leads',
    risk_notes: [],
    linked_action_ids: ['A-20260612-1003'],
    linked_actions: [
      {
        action_id: 'A-20260612-1003',
        created_at: '2026-06-12T10:06:00+08:00',
        action_type: 'list_leads',
        result: '成功',
        risk_level: '低',
        write_applied: false,
      },
    ],
    turns: [
      {
        turn_no: 1,
        created_at: '2026-06-12T10:06:00+08:00',
        input_excerpt: '帮我查我的线索',
        result_label: '查询成功',
        prompt_tokens: 610,
        completion_tokens: 180,
        total_tokens: 790,
        latency_ms: 820,
      },
    ],
  },
  'S-20260612-004': {
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    capability: 'convert_lead',
    model: 'gpt-4.1-mini',
    result_kind: 'draft_action',
    route_source: 'fallback_after_unknown',
    fallback_used: true,
    processing_mode: 'pending_confirm',
    prompt_tokens: 760,
    completion_tokens: 260,
    total_tokens: 1020,
    latency_ms: 1540,
    llm_intent: 'unknown',
    final_intent: 'convert_lead',
    risk_notes: ['详情页上下文转客户通过率偏低'],
    linked_action_ids: ['A-20260612-1004', 'A-20260612-1005'],
    linked_actions: [
      {
        action_id: 'A-20260612-1004',
        created_at: '2026-06-12T10:10:12+08:00',
        action_type: 'draft_convert_lead',
        result: '待确认',
        risk_level: '高',
        write_applied: false,
      },
      {
        action_id: 'A-20260612-1005',
        created_at: '2026-06-12T10:11:02+08:00',
        action_type: 'convert_lead',
        result: '成功',
        risk_level: '高',
        write_applied: true,
      },
    ],
    turns: [
      {
        turn_no: 1,
        created_at: '2026-06-12T10:10:00+08:00',
        input_excerpt: '把这条线索转成客户',
        result_label: '待确认',
        prompt_tokens: 760,
        completion_tokens: 260,
        total_tokens: 1020,
        latency_ms: 1540,
      },
    ],
  },
};

const demoAuditSummary: AuditSummary = {
  total_action_count: 3286,
  write_action_count: 1420,
  high_risk_action_count: 218,
  pending_confirm_count: 164,
  failed_action_count: 73,
  action_type_breakdown: [
    { label: 'create_lead', count: 860 },
    { label: 'list_leads', count: 1120 },
    { label: 'convert_lead', count: 164 },
    { label: 'list_customers', count: 540 },
    { label: 'show_config', count: 92 },
  ],
  risk_alerts: ['高风险动作今日 218 次', '转客户失败率偏高', '12 条动作在补救后仍执行了写库'],
};

const demoAuditActions: AuditActionItem[] = [
  {
    action_id: 'A-20260612-1001',
    created_at: '2026-06-12T10:02:14+08:00',
    session_id: 'S-20260612-001',
    user_name: 'sales01',
    input_excerpt: '帮我建线索，公司叫华北科技',
    llm_intent: 'create_lead',
    executed_action: 'create_lead',
    target_label: 'Lead#318',
    risk_level: '中',
    result: '成功',
    route_source: 'openai_direct',
    fallback_used: false,
    source_page: 'assistant',
  },
  {
    action_id: 'A-20260612-1004',
    created_at: '2026-06-12T10:10:12+08:00',
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    input_excerpt: '把这条线索转成客户',
    llm_intent: 'unknown',
    executed_action: 'draft_convert_lead',
    target_label: 'Lead#3',
    risk_level: '高',
    result: '待确认',
    route_source: 'fallback_after_unknown',
    fallback_used: true,
    source_page: 'lead_detail',
  },
  {
    action_id: 'A-20260612-1005',
    created_at: '2026-06-12T10:11:02+08:00',
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    input_excerpt: '确认执行',
    llm_intent: 'confirm_action',
    executed_action: 'convert_lead',
    target_label: 'Customer#121',
    risk_level: '高',
    result: '成功',
    route_source: 'confirm_action',
    fallback_used: false,
    source_page: 'lead_detail',
  },
];

const demoAuditDetails: Record<string, AuditActionDetail> = {
  'A-20260612-1001': {
    action_id: 'A-20260612-1001',
    created_at: '2026-06-12T10:02:14+08:00',
    session_id: 'S-20260612-001',
    user_name: 'sales01',
    entrypoint: '/assistant/message',
    page_context: 'lead_list',
    input_excerpt: '帮我建线索，公司叫华北科技，联系人张三，手机号138****0001',
    llm_intent: 'create_lead',
    final_intent: 'create_lead',
    route_source: 'openai_direct',
    fallback_used: false,
    risk_level: '中',
    action_type: 'create_lead',
    target_objects: [
      { type: 'Lead', id: '318', label: 'Lead#318 华北科技' },
      { type: 'Contact', id: '88', label: 'Contact#88 张三' },
    ],
    write_applied: true,
    confirm_required: false,
    confirm_status: 'not_required',
    result: '成功',
    timeline: [
      { label: '用户发消息', detail: '创建线索请求', status: 'done' },
      { label: 'AI 路由判断', detail: '识别为创建线索', status: 'done' },
      { label: '写库执行', detail: '创建线索与主联系人', status: 'done' },
    ],
    usage_meta: {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      prompt_tokens: 920,
      completion_tokens: 310,
      total_tokens: 1230,
      latency_ms: 1180,
      llm_called: true,
      route_source: 'openai_direct',
      fallback_used: false,
      result_kind: 'lead_created',
      llm_intent: 'create_lead',
      final_intent: 'create_lead',
    },
    write_effect: [
      {
        object_type: 'Lead',
        object_id: '318',
        object_label: '华北科技',
        change_type: 'create',
        before_summary: '不存在',
        after_summary: '已创建',
        audit_written: true,
      },
      {
        object_type: 'Contact',
        object_id: '88',
        object_label: '张三',
        change_type: 'create',
        before_summary: '不存在',
        after_summary: '已创建为主联系人',
        audit_written: true,
      },
    ],
  },
  'A-20260612-1004': {
    action_id: 'A-20260612-1004',
    created_at: '2026-06-12T10:10:12+08:00',
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    entrypoint: '/assistant/message',
    page_context: 'Lead#3',
    input_excerpt: '把这条线索转成客户',
    llm_intent: 'unknown',
    final_intent: 'convert_lead',
    route_source: 'fallback_after_unknown',
    fallback_used: true,
    risk_level: '高',
    action_type: 'draft_convert_lead',
    target_objects: [{ type: 'Lead', id: '3', label: 'Lead#3 华北科技' }],
    write_applied: false,
    confirm_required: true,
    confirm_status: 'pending',
    result: '待确认',
    timeline: [
      { label: '用户发消息', detail: '详情页上下文转客户', status: 'done' },
      { label: 'AI 路由判断', detail: '模型未识别，后续补救为转客户', status: 'warning' },
      { label: '返回待确认动作', detail: '等待用户确认', status: 'done' },
    ],
    usage_meta: {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      prompt_tokens: 760,
      completion_tokens: 260,
      total_tokens: 1020,
      latency_ms: 1540,
      llm_called: true,
      route_source: 'fallback_after_unknown',
      fallback_used: true,
      result_kind: 'draft_action',
      llm_intent: 'unknown',
      final_intent: 'convert_lead',
    },
    write_effect: [],
  },
  'A-20260612-1005': {
    action_id: 'A-20260612-1005',
    created_at: '2026-06-12T10:11:02+08:00',
    session_id: 'S-20260612-004',
    user_name: 'sales03',
    entrypoint: '/assistant/message',
    page_context: 'Lead#3',
    input_excerpt: '确认执行',
    llm_intent: 'confirm_action',
    final_intent: 'convert_lead',
    route_source: 'confirm_action',
    fallback_used: false,
    risk_level: '高',
    action_type: 'convert_lead',
    target_objects: [
      { type: 'Lead', id: '3', label: 'Lead#3 华北科技' },
      { type: 'Customer', id: '121', label: 'Customer#121 华北科技' },
    ],
    write_applied: true,
    confirm_required: true,
    confirm_status: 'confirmed',
    result: '成功',
    timeline: [
      { label: '用户确认', detail: '点击确认执行', status: 'done' },
      { label: '后端执行真实动作', detail: '转客户成功', status: 'done' },
      { label: '写库影响记录', detail: '已记录到写库影响明细', status: 'done' },
    ],
    usage_meta: {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      prompt_tokens: 120,
      completion_tokens: 80,
      total_tokens: 200,
      latency_ms: 320,
      llm_called: false,
      route_source: 'confirm_action',
      fallback_used: false,
      result_kind: 'converted',
      llm_intent: 'confirm_action',
      final_intent: 'convert_lead',
    },
    write_effect: [
      {
        object_type: 'Lead',
        object_id: '3',
        object_label: 'Lead#3 华北科技',
        change_type: 'update',
        before_summary: 'converted_customer_id 为空',
        after_summary: 'converted_customer_id = 121',
        audit_written: true,
      },
      {
        object_type: 'Customer',
        object_id: '121',
        object_label: 'Customer#121 华北科技',
        change_type: 'create',
        before_summary: '不存在',
        after_summary: '已创建',
        audit_written: true,
      },
    ],
  },
};

async function tryApi<T>(loader: () => Promise<T>, fallback: T, fallbackMessage: string): Promise<MonitorLoadResult<T>> {
  try {
    return {
      data: await loader(),
      source: 'api',
    };
  } catch (error) {
    return {
      data: fallback,
      source: 'demo',
      warning: asErrorMessage(error, fallbackMessage),
    };
  }
}

export async function getTokenSummary(filters: TokenFilters) {
  return tryApi(
    () => api.get<TokenMonitorSummary>(`/admin/ai-monitor/token/summary${buildQuery(filters)}`),
    demoTokenSummary,
    'Token 汇总接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenTrend(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ points: TokenTrendPoint[] }>(`/admin/ai-monitor/token/trend${buildQuery(filters)}`);
      return result.points;
    },
    demoTokenTrend,
    'Token 趋势接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenRouteSources(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: TokenRouteSourceItem[] }>(
        `/admin/ai-monitor/token/route-sources${buildQuery(filters)}`,
      );
      return result.items;
    },
    demoTokenRouteSources,
    '路由来源分布接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenFallbackBreakdown(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: TokenFallbackBreakdownItem[] }>(
        `/admin/ai-monitor/token/fallback-breakdown${buildQuery(filters)}`,
      );
      return result.items;
    },
    demoTokenFallbackBreakdown,
    '兜底原因拆分接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenProcessingModes(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: TokenProcessingModeItem[] }>(
        `/admin/ai-monitor/token/processing-modes${buildQuery(filters)}`,
      );
      return result.items;
    },
    demoTokenProcessingModes,
    '处理方式分布接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenCapabilityDistribution(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: TokenCapabilityDistributionItem[] }>(
        `/admin/ai-monitor/token/capability-distribution${buildQuery(filters)}`,
      );
      return result.items;
    },
    demoTokenCapabilityDistribution,
    '消耗去向分布接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenTopCost(filters: TokenFilters) {
  return tryApi(
    () => api.get<TokenTopCost>(`/admin/ai-monitor/token/top-cost${buildQuery(filters)}`),
    demoTokenTopCost,
    '高消耗场景接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenCases(filters: TokenFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: TokenCaseItem[]; total: number }>(
        `/admin/ai-monitor/token/cases${buildQuery(filters)}`,
      );
      return result;
    },
    { items: demoTokenCases, total: demoTokenCases.length },
    'Token 明细接口暂不可用，当前展示演示数据。',
  );
}

export async function getTokenSessionDetail(sessionId: string) {
  return tryApi(
    () => api.get<TokenSessionDetail>(`/admin/ai-monitor/token/sessions/${encodeURIComponent(sessionId)}`),
    demoTokenSessionDetails[sessionId] || demoTokenSessionDetails['S-20260612-001'],
    '会话详情接口暂不可用，当前展示演示数据。',
  );
}

export async function getAuditSummary(filters: AuditFilters) {
  return tryApi(
    () => api.get<AuditSummary>(`/admin/ai-monitor/audit/summary${buildQuery(filters)}`),
    demoAuditSummary,
    '审计汇总接口暂不可用，当前展示演示数据。',
  );
}

export async function getAuditActions(filters: AuditFilters) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: AuditActionItem[]; total: number }>(
        `/admin/ai-monitor/audit/actions${buildQuery(filters)}`,
      );
      return result;
    },
    { items: demoAuditActions, total: demoAuditActions.length },
    '审计列表接口暂不可用，当前展示演示数据。',
  );
}

export async function getAuditObjectActions(params: {
  object_type: string;
  object_id: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}) {
  return tryApi(
    async () => {
      const result = await api.get<{ items: AuditActionItem[]; total: number }>(
        `/admin/ai-monitor/audit/object-actions${buildQuery(params)}`,
      );
      return result;
    },
    { items: demoAuditActions, total: demoAuditActions.length },
    '对象追查接口暂不可用，当前展示演示数据。',
  );
}

export async function getAuditActionDetail(actionId: string) {
  return tryApi(
    () => api.get<AuditActionDetail>(`/admin/ai-monitor/audit/actions/${encodeURIComponent(actionId)}`),
    demoAuditDetails[actionId] || demoAuditDetails['A-20260612-1001'],
    '审计详情接口暂不可用，当前展示演示数据。',
  );
}

export const AI_MONITOR_OPTIONS = {
  capability: [
    { value: '', label: '全部能力' },
    { value: 'create_lead', label: '创建线索' },
    { value: 'list_leads', label: '查询线索' },
    { value: 'convert_lead', label: '转客户' },
    { value: 'list_customers', label: '查询客户' },
    { value: 'global_search', label: '综合查询' },
  ],
  resultKind: [
    { value: '', label: '全部结果' },
    { value: 'lead_created', label: '创建成功' },
    { value: 'lead_list', label: '查询结果' },
    { value: 'customer_list', label: '客户列表' },
    { value: 'global_search', label: '综合查询' },
    { value: 'customer_created', label: '转客户成功' },
    { value: 'draft_action', label: '待确认' },
    { value: 'converted', label: '执行成功' },
    { value: 'message', label: '普通回复' },
  ],
  fallback: [
    { value: '', label: '全部' },
    { value: 'true', label: '已兜底' },
    { value: 'false', label: '未兜底' },
  ],
  models: [
    { value: '', label: '全部模型' },
    { value: 'deepseek-chat', label: '深度求索对话模型（deepseek-chat）' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 轻量版（gpt-4.1-mini）' },
  ],
  risk: [
    { value: '', label: '全部风险' },
    { value: '低', label: '低' },
    { value: '中', label: '中' },
    { value: '高', label: '高' },
  ],
  auditResult: [
    { value: '', label: '全部结果' },
    { value: '成功', label: '成功' },
    { value: '待确认', label: '待确认' },
    { value: '拒绝', label: '拒绝' },
    { value: '失败', label: '失败' },
  ],
  actionType: [
    { value: '', label: '全部动作' },
    { value: 'create_lead', label: '创建线索' },
    { value: 'list_leads', label: '查询线索' },
    { value: 'global_search', label: '综合查询' },
    { value: 'draft_convert_lead', label: '待确认转客户' },
    { value: 'convert_lead', label: '正式转客户' },
  ],
  range: [
    { value: '7', label: '近 7 天' },
    { value: '30', label: '近 30 天' },
  ],
};
