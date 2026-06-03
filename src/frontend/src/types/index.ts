export type RoleCode = '销售' | '销售经理' | '系统管理员';

export interface UserInfo {
  id: number;
  login: string;
  name: string;
  role: RoleCode;
  roles: RoleCode[];
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
}

export interface VisitRecord {
  id: number;
  customer_id: number;
  visit_time: string;
  visit_method: string;
  participants: string;
  content: string;
  conclusion: string;
  next_plan: string;
  created_at: string;
}

export interface CommunicationNote {
  id: number;
  customer_id: number;
  communication_time: string;
  method: string;
  counterpart: string;
  content: string;
  todo_items: string;
  created_at: string;
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

export interface AssistantDraftAction {
  kind: string;
  payload: Record<string, unknown>;
}

export interface AssistantResponse {
  message: string;
  result_kind: string;
  data: Record<string, any>;
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
