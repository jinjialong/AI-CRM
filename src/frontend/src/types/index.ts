export type RoleCode = '销售' | '销售经理' | '系统管理员';

export interface UserInfo {
  id: number;
  login: string;
  name: string;
  role: RoleCode;
  roles: RoleCode[];
  manager_id?: number | null;
}

export interface LeadContact {
  id?: number;
  lead_id?: number;
  name: string;
  job_title: string;
  phone: string;
  wechat: string;
  is_primary: boolean;
  created_at?: string;
}

export interface Lead {
  id: number;
  company_name: string;
  organization_code: string;
  region: string;
  source: string;
  owner_id: number | null;
  owner_name: string | null;
  status: string;
  is_converted?: boolean;
  is_public: boolean;
  notes: string;
  converted_customer_id: number | null;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_job_title: string;
  contacts: LeadContact[];
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface LeadFollowUp {
  id: number;
  lead_id: number;
  method: string;
  content: string;
  follow_up_time: string;
  next_follow_up_time: string | null;
  created_by_id: number;
  created_by_name: string | null;
  created_at: string;
}

export interface LeadConversation {
  id: number;
  lead_id: number;
  source_type: string;
  content: string;
  conversation_time: string;
  created_by_id: number;
  created_by_name: string | null;
  created_at: string;
}

export interface LeadKeyEvent {
  id: number;
  lead_id: number;
  event_type: string;
  event_time: string;
  note: string;
  created_by_id: number;
  created_by_name: string | null;
  created_at: string;
}

export interface LeadAnalysisDimension {
  code: string;
  label: string;
  matched: boolean;
  evidence_count: number;
  evidences: string[];
}

export interface LeadAnalysisCurrent {
  score: number;
  completed_dimension_count: number;
  total_dimension_count: number;
  next_best_action: string;
  analysis_version: string;
  analyzed_at: string;
  dimensions: LeadAnalysisDimension[];
  summary: string;
  source_counts: {
    followups: number;
    conversations: number;
    key_events: number;
  };
}

export interface LeadAnalysisTrendPoint {
  id: number;
  lead_id: number;
  score: number;
  completed_dimension_count: number;
  total_dimension_count: number;
  analyzed_at: string;
  trigger_type?: string;
  trigger_label?: string;
  score_delta?: number;
  reason_summary?: string;
  added_dimensions?: string[];
  removed_dimensions?: string[];
  source_counts?: {
    followups: number;
    conversations: number;
    key_events: number;
  };
}

export interface Customer {
  id: number;
  customer_name: string;
  source_lead_id: number;
  contact_name: string;
  phone: string;
  company_name: string;
  owner_id: number;
  owner_name: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerFollowUp {
  id: number;
  customer_id: number;
  opportunity_id?: number | null;
  method: string;
  content: string;
  follow_up_time: string;
  next_follow_up_time: string | null;
  created_by_id: number;
  created_by_name: string | null;
  created_at: string;
}

export interface Contact {
  id: number;
  customer_id: number;
  name: string;
  phone: string;
  job_title: string;
  wechat: string;
  email: string;
  is_primary: boolean;
  notes: string;
  created_at: string;
  updated_at?: string;
}

export interface VisitRecord {
  id: number;
  customer_id: number;
  opportunity_id?: number | null;
  visit_time: string;
  visit_method: string;
  participants: string;
  content: string;
  conclusion: string;
  next_plan: string;
  created_at: string;
  updated_at?: string;
}

export interface CommunicationNote {
  id: number;
  customer_id: number;
  opportunity_id?: number | null;
  communication_time: string;
  method: string;
  counterpart: string;
  content: string;
  todo_items: string;
  created_at: string;
  updated_at?: string;
}

export interface AuditLog {
  id: number;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  result: string;
  source: string;
  details: string;
  created_at: string;
}

export interface ConfigItem {
  id: number;
  key: string;
  value: string;
  updated_at: string;
}

export interface Opportunity {
  id: number;
  customer_id: number;
  source_lead_id: number | null;
  name: string;
  amount: number | null;
  stage: string;
  status: string;
  expected_close_date: string | null;
  owner_id: number;
  owner_name: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantDraftAction {
  kind: string;
  payload: Record<string, unknown>;
}

export interface AssistantGlobalSearchData {
  customers: Customer[];
  leads: Lead[];
  public_pool_leads: Lead[];
  counts: {
    customers: number;
    leads: number;
    public_pool_leads: number;
  };
  filters: {
    search: string;
  };
}

export interface AssistantResponse {
  message: string;
  result_kind: string;
  data: Record<string, any>;
}

export interface AssistantUsageMeta {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  llm_called: boolean;
  route_source: string;
  fallback_used: boolean;
  result_kind: string;
  llm_intent: string;
  final_intent: string;
}

export interface TokenMonitorSummary {
  total_tokens: number;
  total_request_count: number;
  avg_total_tokens: number;
  avg_session_tokens: number;
  avg_latency_ms: number;
  fallback_rate: number;
  model_recovery_rate: number;
  pass_rate: number;
  avg_prompt_tokens: number;
  avg_completion_tokens: number;
}

export interface TokenTrendPoint {
  bucket_label: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms: number;
}

export interface TokenRouteSourceItem {
  route_source: string;
  count: number;
  rate: number;
}

export interface TokenFallbackBreakdownItem {
  reason: string;
  count: number;
  rate_in_fallback: number;
}

export interface TokenProcessingModeItem {
  processing_mode: string;
  count: number;
  rate: number;
}

export interface TokenCapabilityDistributionItem {
  capability: string;
  total_tokens: number;
  request_count: number;
  rate: number;
  avg_total_tokens: number;
}

export interface TokenTopCaseItem {
  case_id: string;
  session_id: string;
  capability: string;
  total_tokens: number;
  latency_ms: number;
  created_at: string;
}

export interface TokenTopSessionItem {
  session_id: string;
  capability: string;
  total_tokens: number;
  request_count: number;
}

export interface TokenTopCost {
  top_capabilities: TokenCapabilityDistributionItem[];
  top_cases: TokenTopCaseItem[];
  top_sessions: TokenTopSessionItem[];
}

export interface TokenCaseItem {
  case_id: string;
  capability: string;
  created_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  route_source: string;
  result_kind: string;
  session_id: string;
  user_name?: string;
  fallback_used?: boolean;
  processing_mode?: string;
  llm_intent?: string;
  final_intent?: string;
}

export interface TokenSessionTurn {
  turn_no: number;
  created_at: string;
  input_excerpt: string;
  result_label: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
}

export interface TokenLinkedAction {
  action_id: string;
  created_at: string;
  action_type: string;
  result: string;
  risk_level: string;
  write_applied: boolean;
}

export interface TokenSessionDetail {
  session_id: string;
  user_name: string;
  capability: string;
  model: string;
  result_kind: string;
  route_source: string;
  fallback_used: boolean;
  processing_mode?: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  llm_intent: string;
  final_intent: string;
  risk_notes: string[];
  linked_action_ids: string[];
  linked_actions: TokenLinkedAction[];
  turns: TokenSessionTurn[];
}

export interface ActionBreakdownItem {
  label: string;
  count: number;
}

export interface AuditSummary {
  total_action_count: number;
  write_action_count: number;
  high_risk_action_count: number;
  pending_confirm_count: number;
  failed_action_count: number;
  action_type_breakdown: ActionBreakdownItem[];
  risk_alerts: string[];
}

export interface AuditActionItem {
  action_id: string;
  created_at: string;
  session_id: string;
  user_name: string;
  input_excerpt: string;
  llm_intent: string;
  executed_action: string;
  target_label: string;
  risk_level: string;
  result: string;
  route_source?: string;
  fallback_used?: boolean;
  source_page?: string;
}

export interface AuditTimelineItem {
  label: string;
  detail: string;
  status?: string;
}

export interface AuditTargetObject {
  type: string;
  id: string;
  label: string;
}

export interface WriteEffectItem {
  object_type: string;
  object_id: string;
  object_label: string;
  change_type: string;
  before_summary: string;
  after_summary: string;
  audit_written: boolean;
}

export interface AuditActionDetail {
  action_id: string;
  created_at: string;
  session_id: string;
  user_name: string;
  entrypoint: string;
  page_context: string;
  input_excerpt: string;
  llm_intent: string;
  final_intent: string;
  route_source: string;
  fallback_used: boolean;
  risk_level: string;
  action_type: string;
  target_objects: AuditTargetObject[];
  write_applied: boolean;
  confirm_required: boolean;
  confirm_status: string;
  result: string;
  timeline: AuditTimelineItem[];
  usage_meta: AssistantUsageMeta;
  write_effect: WriteEffectItem[];
}

export interface MonitorLoadResult<T> {
  data: T;
  source: 'api' | 'demo';
  warning?: string;
}

export interface LeadCreationSkillResult {
  status: 'missing_fields' | 'duplicate_found' | 'success';
  missing_fields: string[];
  duplicate_lead: Lead | null;
  lead: Lead | null;
  draft: Record<string, any>;
  session_id: number | null;
  available_actions: Array<{
    kind: string;
    label: string;
    payload: Record<string, unknown>;
  }>;
}
