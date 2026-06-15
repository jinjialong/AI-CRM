'use client';

import { SideDrawer } from '@/components/common/side-drawer';
import type { AuditActionDetail } from '@/types';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function getAuditIntentLabel(value: string) {
  switch (value) {
    case 'create_lead':
      return '创建线索';
    case 'list_leads':
      return '查询线索';
    case 'list_public_pool':
      return '查询公共池线索';
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
  return value === '/assistant/message' ? 'AI 助手主入口' : value || '-';
}

function getPageContextLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text === 'assistant') return '助手面板';
  if (text === 'lead_list') return '线索列表页';
  if (text === 'lead_detail') return '线索详情页';
  return text.replace(/^Lead#/i, '线索#').replace(/^Customer#/i, '客户#').replace(/^Contact#/i, '联系人#');
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

type Props = {
  open: boolean;
  detail: AuditActionDetail | null;
  detailWarning?: string;
  onClose: () => void;
  onBack?: () => void;
  writeEffectOpen: boolean;
  onToggleWriteEffect: () => void;
  zIndex?: number;
};

export function AuditActionDrawer({
  open,
  detail,
  detailWarning,
  onClose,
  onBack,
  writeEffectOpen,
  onToggleWriteEffect,
  zIndex,
}: Props) {
  return (
    <SideDrawer
      open={open}
      title={detail?.action_id || '动作详情'}
      subtitle={detail ? `${getAuditIntentLabel(detail.action_type)} / ${detail.user_name}` : '正在加载详情'}
      onClose={onClose}
      width={520}
      zIndex={zIndex}
      leading={
        onBack ? (
          <button type="button" className="secondary-btn" onClick={onBack}>
            返回
          </button>
        ) : undefined
      }
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
                <div
                  key={`${item.type}-${item.id}`}
                  style={{
                    border: '1px solid var(--border-soft)',
                    background: '#fafcff',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: 'var(--text-normal)',
                  }}
                >
                  {getObjectTypeLabel(item.type)} #{item.id} / {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>相关消耗</div>
            <div className="grid-responsive-4" style={{ gap: 10 }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>输入</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.prompt_tokens}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>输出</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.completion_tokens}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>总消耗</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.total_tokens}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>耗时</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.usage_meta.latency_ms}ms</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="secondary-btn" onClick={onToggleWriteEffect}>
              {writeEffectOpen ? '收起写库影响' : '查看写库影响'}
            </button>
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
  );
}
