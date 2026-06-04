export const LEAD_STATUS_OPTIONS = ['跟进中', '必胜', '大概率', '高风险', '已丢弃'] as const;

export const OPPORTUNITY_STAGE_OPTIONS = ['初步接触', '需求确认', '方案沟通', '商务推进', '合同签约'] as const;

export const OPPORTUNITY_STATUS_OPTIONS = ['进行中', '赢单', '输单'] as const;

export const TEAM_REPORT_COMPLETION_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'done', label: '已提交' },
  { value: 'pending', label: '未提交' },
] as const;

export function isManagerOrAdmin(role?: string | null) {
  return role === '销售经理' || role === '系统管理员';
}
