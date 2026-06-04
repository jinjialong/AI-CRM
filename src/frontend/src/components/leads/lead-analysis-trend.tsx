'use client';

import { useMemo, useState } from 'react';

import { ModalShell } from '@/components/common/modal-shell';
import { LeadAnalysisTrendPoint } from '@/types';

const SVG_WIDTH = 960;
const SVG_HEIGHT = 260;
const CHART_PADDING = { top: 24, right: 28, bottom: 36, left: 40 };

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function LeadAnalysisTrend({ items }: { items: LeadAnalysisTrendPoint[] }) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [openDetailModal, setOpenDetailModal] = useState(false);

  const chartData = useMemo(() => {
    if (!items.length) return null;
    const plotWidth = SVG_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight = SVG_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const maxIndex = Math.max(items.length - 1, 1);
    const points = items.map((item, index) => ({
      item,
      x: CHART_PADDING.left + (plotWidth * index) / maxIndex,
      y: CHART_PADDING.top + plotHeight - (item.score / 100) * plotHeight,
    }));
    const latestScore = items[items.length - 1]?.score ?? 0;
    const scores = items.map((item) => item.score);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const weekBase = items.length > 7 ? items[items.length - 8].score : items[0]?.score ?? latestScore;
    return {
      points,
      path: buildPath(points),
      latestScore,
      highestScore,
      lowestScore,
      delta7d: latestScore - weekBase,
      plotHeight,
      plotWidth,
    };
  }, [items]);

  const hoveredPoint = chartData?.points.find((point) => point.item.id === hoveredId) || chartData?.points.at(-1) || null;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>分析趋势</div>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => setOpenDetailModal(true)}
          disabled={!items.length}
        >
          变化明细
        </button>
      </div>

      {items.length < 2 || !chartData ? (
        <div className="muted" style={{ marginTop: 14 }}>
          暂无足够趋势数据，至少完成两次分析后可查看变化。
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            <Metric label="最新分数" value={String(chartData.latestScore)} />
            <Metric
              label="7日变化"
              value={`${chartData.delta7d > 0 ? '+' : ''}${chartData.delta7d}`}
              tone={chartData.delta7d > 0 ? '#389e0d' : chartData.delta7d < 0 ? '#cf1322' : '#1677ff'}
            />
            <Metric label="最高分" value={String(chartData.highestScore)} />
            <Metric label="最低分" value={String(chartData.lowestScore)} />
          </div>

          <div
            style={{
              marginTop: 16,
              border: '1px solid var(--border-soft)',
              borderRadius: 12,
              background: '#fbfdff',
              padding: 12,
            }}
          >
            <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {[0, 25, 50, 75, 100].map((tick) => {
                const y =
                  CHART_PADDING.top +
                  chartData.plotHeight -
                  (tick / 100) * chartData.plotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={CHART_PADDING.left}
                      y1={y}
                      x2={SVG_WIDTH - CHART_PADDING.right}
                      y2={y}
                      stroke="#e8eef5"
                      strokeWidth="1"
                    />
                    <text x={8} y={y + 4} fontSize="11" fill="#64748b">
                      {tick}
                    </text>
                  </g>
                );
              })}

              <path d={chartData.path} fill="none" stroke="#1677ff" strokeWidth="3" strokeLinecap="round" />

              {chartData.points.map((point) => {
                const delta = point.item.score_delta ?? 0;
                const fill = delta > 0 ? '#52c41a' : delta < 0 ? '#ff4d4f' : '#1677ff';
                return (
                  <g key={point.item.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={hoveredId === point.item.id ? 7 : 5}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredId(point.item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    />
                    <text x={point.x - 16} y={SVG_HEIGHT - 10} fontSize="11" fill="#64748b">
                      {formatDate(point.item.analyzed_at)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {hoveredPoint ? (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fbff',
                border: '1px solid #d6e4ff',
                display: 'grid',
                gap: 6,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                {formatDateTime(hoveredPoint.item.analyzed_at)} · 得分 {hoveredPoint.item.score}
                <span
                  style={{
                    marginLeft: 8,
                    color:
                      (hoveredPoint.item.score_delta ?? 0) > 0
                        ? '#389e0d'
                        : (hoveredPoint.item.score_delta ?? 0) < 0
                          ? '#cf1322'
                          : '#1677ff',
                  }}
                >
                  {(hoveredPoint.item.score_delta ?? 0) > 0 ? '+' : ''}
                  {hoveredPoint.item.score_delta ?? 0}
                </span>
              </div>
              <div style={{ color: 'var(--text-normal)' }}>
                触发事件：{hoveredPoint.item.trigger_label || '自动分析'}
              </div>
              <div style={{ color: 'var(--text-normal)' }}>
                {hoveredPoint.item.reason_summary || '暂无变化说明'}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                完成度 {hoveredPoint.item.completed_dimension_count}/{hoveredPoint.item.total_dimension_count}
              </div>
            </div>
          ) : null}
        </>
      )}

      <ModalShell open={openDetailModal} title="变化明细" onClose={() => setOpenDetailModal(false)} maxWidth={1100}>
        {items.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[...items].reverse().map((item) => {
              const delta = item.score_delta ?? 0;
              const tone = delta > 0 ? '#389e0d' : delta < 0 ? '#cf1322' : '#1677ff';
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 80px 120px 1fr',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-soft)',
                    background: '#fafcff',
                    fontSize: 13,
                  }}
                >
                  <div>{formatDateTime(item.analyzed_at)}</div>
                  <div style={{ color: tone, fontWeight: 700 }}>
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </div>
                  <div>{item.trigger_label || '自动分析'}</div>
                  <div style={{ color: 'var(--text-normal)' }}>{item.reason_summary || '暂无变化说明'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted">暂无变化明细</div>
        )}
      </ModalShell>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'var(--text-strong)',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--border-soft)',
        background: '#fafcff',
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}
