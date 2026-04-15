import { useEffect, useState } from 'react'
import { Button, Segmented, Spin, Typography } from 'antd'
import { AlertOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { getDashboardOverview } from '../api/dashboard'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/Layout'
import NewDeptModal from '../components/NewDeptModal'
import './Dashboard.css'

const { Text } = Typography

const RANGE_OPTIONS = [
  { label: '7 天', value: '7' },
  { label: '30 天', value: '30' }
]

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatDateTime(value) {
  if (!value) return '尚無事件'
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const total = payload.find(item => item.dataKey === 'total_events')?.value || 0
  const failed = payload.find(item => item.dataKey === 'failed_events')?.value || 0

  return (
    <div style={{
      minWidth: 150,
      padding: '12px 14px',
      borderRadius: 18,
      border: '1px solid rgba(45, 36, 27, 0.12)',
      background: 'rgba(255, 252, 247, 0.96)',
      boxShadow: '0 10px 40px rgba(45, 36, 27, 0.14)'
    }}
    >
      <div style={{ marginBottom: 8, color: '#7a6f64', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: '#17120d', fontSize: 14 }}>事件量 {total}</div>
      <div style={{ color: '#b13a2a', fontSize: 14, marginTop: 4 }}>失敗 {failed}</div>
    </div>
  )
}

function EmptyState({ canEdit, onCreate }) {
  return (
    <div className="dashboard-empty">
      <span className="dashboard-panel__eyebrow">Fresh setup</span>
      <h2 className="dashboard-empty__title">這裡還沒有任何部門</h2>
      <div className="dashboard-empty__text">
        先新增第一個部門，首頁之後會開始累積事件量、成功率與異常告警。這個儀表板會在資料進來後自動轉成全域營運總覽。
      </div>
      {canEdit && (
        <div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onCreate}>
            新增第一個部門
          </Button>
        </div>
      )}
    </div>
  )
}

function NoEventsState() {
  return (
    <div className="dashboard-empty">
      <span className="dashboard-panel__eyebrow">Quiet window</span>
      <h2 className="dashboard-empty__title">此區間尚無事件</h2>
      <div className="dashboard-empty__text">
        你已經有可存取的部門，但最近 7 或 30 天沒有 webhook 事件進來。等下一筆事件送達後，首頁就會開始顯示趨勢、排行與異常訊號。
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [range, setRange] = useState('7')
  const [overview, setOverview] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const canEdit = ['admin', 'editor'].includes(user?.role)

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      setLoading(true)
      setLoadError(false)
      try {
        const data = await getDashboardOverview(range)
        if (!cancelled) setOverview(data)
      } catch {
        if (!cancelled) {
          setOverview(null)
          setLoadError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOverview()
    return () => {
      cancelled = true
    }
  }, [range])

  if (loading) {
    return (
      <AppLayout>
        <div className="dashboard-loading">
          <Spin size="large" />
        </div>
      </AppLayout>
    )
  }

  const departments = overview?.departments || []
  const alerts = overview?.alerts || []
  const summary = overview?.summary || {
    total_events: 0,
    sent_events: 0,
    failed_events: 0,
    duplicate_events: 0,
    success_rate: 0
  }
  const hasDepartments = departments.length > 0
  const hasEvents = summary.total_events > 0
  const topDepartments = departments.slice(0, 5)

  return (
    <AppLayout>
      <div className="dashboard-page">
        {loadError ? (
          <div className="dashboard-empty">
            <span className="dashboard-panel__eyebrow">Fetch interrupted</span>
            <h2 className="dashboard-empty__title">統計資料暫時載入失敗</h2>
            <div className="dashboard-empty__text">
              Dashboard API 沒有成功回應，所以這裡不顯示空狀態。先重新整理；如果問題持續，再檢查登入狀態、後端部署或 `/api/dashboard` 回應。
            </div>
            <div>
              <Button type="primary" size="large" onClick={() => window.location.reload()}>
                重新整理
              </Button>
            </div>
          </div>
        ) : !hasDepartments ? (
          <EmptyState canEdit={canEdit} onCreate={() => setModalOpen(true)} />
        ) : !hasEvents ? (
          <NoEventsState />
        ) : (
          <>
            <section className="dashboard-hero">
              <div className="dashboard-hero__header">
                <div>
                  <div className="dashboard-kicker">Operational ledger</div>
                  <h1 className="dashboard-title">營運健康總覽</h1>
                  <p className="dashboard-subtitle">
                    用單一首頁看清近 {range} 天的事件密度、送達穩定度與異常熱點。這不是表格堆疊，而是讓你一眼抓到哪個部門正在失速。
                  </p>
                  <div className="dashboard-meta">
                    最後更新 {formatDateTime(overview?.last_updated_at)}
                  </div>
                </div>

                <Segmented
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={setRange}
                  size="large"
                />
              </div>

              <div className="dashboard-hero__stats">
                <div className="metric-card metric-card--primary">
                  <div className="metric-card__label">送達成功率</div>
                  <p className="metric-card__value">{formatPercent(summary.success_rate)}</p>
                  <div className="metric-card__hint">
                    {summary.sent_events} / {summary.total_events} 事件順利送出，這是目前最直接的營運健康訊號。
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-card__label">事件總量</div>
                  <p className="metric-card__value">{summary.total_events}</p>
                  <div className="metric-card__hint">近 {range} 天累積 webhook 事件數。</div>
                </div>

                <div className="metric-card">
                  <div className="metric-card__label">失敗數</div>
                  <p className="metric-card__value" style={{ color: '#b13a2a' }}>{summary.failed_events}</p>
                  <div className="metric-card__hint">失敗越集中，越需要優先檢查部門設定或外部平台。</div>
                </div>

                <div className="metric-card">
                  <div className="metric-card__label">重複事件</div>
                  <p className="metric-card__value">{summary.duplicate_events}</p>
                  <div className="metric-card__hint">可用來觀察 webhook 去重與重送情況。</div>
                </div>
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="dashboard-panel trend-card">
                <div className="dashboard-panel__inner">
                  <span className="dashboard-panel__eyebrow">Daily signal</span>
                  <h2 className="dashboard-panel__title">事件節奏與失敗波峰</h2>
                  <p className="dashboard-panel__desc">
                    單一主圖追蹤每天事件量，同步疊上失敗事件。失敗柱一旦變厚，通常就是該回頭查 webhook、權限或 Chat 送達。
                  </p>

                  <div className="trend-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={overview?.trend || []} margin={{ top: 12, right: 10, bottom: 0, left: -24 }}>
                        <defs>
                          <linearGradient id="totalEventsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1c4dff" stopOpacity={0.26} />
                            <stop offset="95%" stopColor="#1c4dff" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="failedEventsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c23e2e" stopOpacity={0.22} />
                            <stop offset="95%" stopColor="#c23e2e" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(45, 36, 27, 0.08)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#7a6f64', fontSize: 12 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#7a6f64', fontSize: 12 }}
                          allowDecimals={false}
                        />
                        <Tooltip content={<TrendTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="total_events"
                          stroke="#1c4dff"
                          strokeWidth={2.5}
                          fill="url(#totalEventsFill)"
                        />
                        <Area
                          type="monotone"
                          dataKey="failed_events"
                          stroke="#c23e2e"
                          strokeWidth={2}
                          fill="url(#failedEventsFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <div style={{ display: 'grid', gap: 24 }}>
                <section className="dashboard-panel">
                  <div className="dashboard-panel__inner">
                    <span className="dashboard-panel__eyebrow">Priority watch</span>
                    <h2 className="dashboard-panel__title">異常部門</h2>
                    <p className="dashboard-panel__desc">
                      先處理失敗最集中的部門，這裡只保留最值得優先回頭查的名單。
                    </p>

                    <div className="insight-list">
                      {alerts.length > 0 ? alerts.map(item => (
                        <div className="insight-row" key={`alert-${item.dept_id}`}>
                          <div>
                            <p className="insight-row__title">{item.dept_name}</p>
                            <div className="insight-row__meta">最近事件 {formatDateTime(item.last_event_at)}</div>
                          </div>
                          <div>
                            <div className="insight-row__value">{item.failed_events}</div>
                            <span className="insight-row__badge">
                              <AlertOutlined style={{ marginRight: 6 }} />
                              failures
                            </span>
                          </div>
                        </div>
                      )) : (
                        <Text type="secondary">目前沒有失敗事件，這一區暫時是乾淨的。</Text>
                      )}
                    </div>
                  </div>
                </section>

                <section className="dashboard-panel">
                  <div className="dashboard-panel__inner">
                    <span className="dashboard-panel__eyebrow">Department ranking</span>
                    <h2 className="dashboard-panel__title">部門排行</h2>
                    <p className="dashboard-panel__desc">
                      依事件量排序，附帶穩定度與最近活動時間。用它快速決定先進哪個部門頁看細節。
                    </p>

                    <div className="insight-list">
                      {topDepartments.map(item => (
                        <button
                          type="button"
                          className="insight-row insight-row--clickable"
                          key={`rank-${item.dept_id}`}
                          onClick={() => navigate(`/dept/${item.dept_id}`)}
                          aria-label={`查看 ${item.dept_name} 設定`}
                        >
                          <div>
                            <p className="insight-row__title">{item.dept_name}</p>
                            <div className="insight-row__meta">
                              成功率 {formatPercent(item.success_rate)} · 最近事件 {formatDateTime(item.last_event_at)}
                            </div>
                          </div>
                          <div className="insight-row__right">
                            <div className="insight-row__value">{item.total_events}</div>
                            <span className={`insight-row__badge ${item.failed_events > 0 ? '' : 'insight-row__badge--cool'}`}>
                              {item.failed_events > 0 ? `${item.failed_events} failures` : 'stable'}
                            </span>
                            <RightOutlined className="insight-row__chevron" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      <NewDeptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={dept => navigate(`/dept/${dept.id}`)}
      />
    </AppLayout>
  )
}
