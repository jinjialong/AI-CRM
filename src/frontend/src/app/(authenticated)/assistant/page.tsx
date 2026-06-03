import { PageHeader } from '@/components/common/page-header';

export default function AssistantPage() {
  return (
    <div>
      <PageHeader
        title="智能助手"
        description="智能助手已经改成系统级右侧固定面板，这个页面只保留说明。"
      />
      <div
        className="card"
        style={{
          padding: 24,
          maxWidth: 760,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
          当前交互方式已调整
        </div>
        <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8, color: 'var(--text-normal)' }}>
          现在整个系统采用左右结构：
        </div>
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.8, color: 'var(--text-normal)' }}>
          左侧是业务内容区，右侧是全局智能助手面板。
        </div>
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.8, color: 'var(--text-normal)' }}>
          当右侧助手收起时，右下角会保留一个小圆按钮，点击即可重新展开。
        </div>
      </div>
    </div>
  );
}
