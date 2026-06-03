'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const presets = [
  { login: 'sales01', password: '123456', label: '销售一号' },
  { login: 'manager01', password: '123456', label: '销售经理' },
  { login: 'admin01', password: '123456', label: '系统管理员' },
];

const showcaseCards = [
  {
    title: '线索创建',
    desc: '手工建线索与智能建线索可同时演示',
  },
  {
    title: '公共池流转',
    desc: '领取、分配、退回、强制收回一条线跑通',
  },
  {
    title: '智能协同',
    desc: '右侧助手支持补字段、查重和查看已有线索',
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [loginName, setLoginName] = useState('sales01');
  const [password, setPassword] = useState('123456');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const alignedControlWidth = 370;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(loginName, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.08fr 0.92fr',
        background: '#eef2f7',
      }}
    >
      <div
        style={{
          padding: '64px 56px 44px',
          background: 'linear-gradient(180deg, #0f172a 0%, #102a43 48%, #163a67 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              padding: '7px 14px',
              borderRadius: 999,
              background: 'rgba(250, 140, 22, 0.18)',
              color: '#ffd591',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            第一阶段演示闭环
          </div>
          <h1
            style={{
              marginTop: 18,
              fontSize: 42,
              lineHeight: 1.18,
              fontWeight: 800,
              maxWidth: 560,
            }}
          >
            让线索、公共线索池和客户，先跑出一套真正可演示的智能闭环。
          </h1>
          <p
            style={{
              marginTop: 18,
              fontSize: 16,
              lineHeight: 1.85,
              color: 'rgba(255,255,255,0.78)',
              maxWidth: 580,
            }}
          >
            这一版聚焦企业客户关系管理的一线工作流，重点演示销售创建线索、公共线索流转、转客户和智能助手协同操作。
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 14,
          }}
        >
          {showcaseCards.map((item) => (
            <div
              key={item.title}
              style={{
                minHeight: 126,
                borderRadius: 16,
                padding: 18,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ fontSize: 12, color: '#ffd591', marginBottom: 10, fontWeight: 700 }}>
                关键演示点
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.4 }}>{item.title}</div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  lineHeight: 1.8,
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 48px',
          background: 'linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -110,
            right: -70,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(24,144,255,0.14) 0%, rgba(24,144,255,0) 72%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -90,
            left: -70,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(250,140,22,0.12) 0%, rgba(250,140,22,0) 72%)',
          }}
        />

        <div
          style={{
            width: '100%',
            maxWidth: 430,
            position: 'relative',
            zIndex: 2,
            transform: 'translateY(-18px)',
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="card"
            style={{
              padding: '30px 30px 20px',
              borderRadius: 20,
              border: '1px solid #dfe6f0',
              boxShadow: '0 16px 36px rgba(15, 23, 42, 0.08)',
              background: '#fff',
            }}
          >
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: 'var(--text-strong)',
                  }}
                >
                  账号登录
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: '#7b8ba3',
                  }}
                >
                  使用账号密码登录管理后台
                </div>
              </div>

              <div style={{ width: '100%', maxWidth: alignedControlWidth, margin: '0 auto' }}>
                <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700 }}>账号</div>
                <input
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  style={{
                    width: '100%',
                    display: 'block',
                    height: 34,
                    borderRadius: 12,
                    background: '#eaf2ff',
                    borderColor: '#d7e4fb',
                    padding: '4px 14px',
                    boxShadow: 'none',
                  }}
                />
              </div>

              <div style={{ width: '100%', maxWidth: alignedControlWidth, margin: '0 auto' }}>
                <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700 }}>密码</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    display: 'block',
                    height: 34,
                    borderRadius: 12,
                    background: '#eaf2ff',
                    borderColor: '#d7e4fb',
                    padding: '4px 14px',
                    boxShadow: 'none',
                  }}
                />
              </div>

              {error ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#fff1f0',
                    border: '1px solid #ffc1c2',
                    color: '#cf1322',
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  maxWidth: alignedControlWidth,
                  height: 44,
                  margin: '0 auto',
                  opacity: submitting ? 0.7 : 1,
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  background: '#0f172a',
                  boxShadow: '0 10px 22px rgba(15, 23, 42, 0.16)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
              >
                {submitting ? '登录中...' : '登录'}
              </button>

              <div
                style={{
                  paddingTop: 2,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 13, color: '#8ea0bc' }}>Demo 演示环境</div>
                <div style={{ fontSize: 13, color: '#8ea0bc' }}>使用演示账号可快速进入不同角色视角</div>
              </div>

              <div
                style={{
                  paddingTop: 12,
                  borderTop: '1px solid #eef3f8',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1677ff',
                    marginBottom: 10,
                  }}
                >
                  快速切换账号
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {presets.map((preset) => (
                    <button
                      key={preset.login}
                      type="button"
                      onClick={() => {
                        setLoginName(preset.login);
                        setPassword(preset.password);
                      }}
                      style={{
                        minHeight: 38,
                        borderRadius: 12,
                        border: '1px solid #dbe6f3',
                        background: '#fff',
                        color: 'var(--text-strong)',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '7px 8px',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
