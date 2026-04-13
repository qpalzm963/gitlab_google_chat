import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Form, Input, Switch, Select, Button, Space,
  Typography, Popconfirm, message, Spin, Row, Col, Tag,
  Layout as AntLayout, Divider,
} from 'antd'
import {
  SendOutlined, DeleteOutlined, ReloadOutlined,
  FileTextOutlined, CopyOutlined, PlusOutlined,
} from '@ant-design/icons'
import { getDepartment, getDepartments, updateDepartment, testDepartment, deleteDepartment } from '../api/departments'
import { useAuth } from '../contexts/AuthContext'
import { randomSecret } from '../utils/random'
import AppLayout from '../components/Layout'
import NewDeptModal from '../components/NewDeptModal'

const { Title, Text } = Typography
const { Sider, Content } = AntLayout

const EVENTS = [
  { name: 'ev_mr_opened',        label: 'Merge Request 開啟',   desc: '新 MR 建立時推播通知' },
  { name: 'ev_mr_updated',       label: 'MR 更新（新 commit）', desc: '有人推新 commit 時通知' },
  { name: 'ev_mr_merged',        label: 'Merge 完成',            desc: 'MR 成功 merge 後通知' },
  { name: 'ev_allow_merge_btn',  label: '允許 Chat 一鍵 Merge', desc: '通知卡片顯示 Merge 按鈕' },
  { name: 'ev_allow_approve_btn',label: '允許 Chat Approve',    desc: '通知卡片顯示 Approve 按鈕' },
  { name: 'ev_allow_close_btn',  label: '允許 Chat Close MR',   desc: '通知卡片顯示 Close 按鈕' },
]

function SectionLabel({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {children}
    </span>
  )
}

function SecretLabel({ label, set }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label}
      {set
        ? <Tag color="green" style={{ margin: 0, fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>已設定</Tag>
        : <Tag color="warning" style={{ margin: 0, fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>未設定</Tag>
      }
      <span style={{ color: '#bfbfbf', fontSize: 12 }}>（留空不更新）</span>
    </span>
  )
}

export default function DeptSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form] = Form.useForm()
  const [dept, setDept] = useState(null)
  const [depts, setDepts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [newDeptOpen, setNewDeptOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const canEdit = ['admin', 'editor'].includes(user?.role)
  const platform = Form.useWatch('platform', form) || dept?.platform || 'gitlab'

  const loadData = () =>
    Promise.all([getDepartment(id), getDepartments()])
      .then(([deptData, deptsData]) => {
        setDept(deptData)
        setDepts(deptsData)
        form.setFieldsValue({
          ...deptData,
          platform: deptData.platform || 'gitlab',
          gitlab_token: '',
          github_token: '',
          webhook_secret: '',
          chat_webhook_url: '',
        })
      })
      .catch(() => { message.error('找不到部門'); navigate('/') })
      .finally(() => setLoading(false))

  useEffect(() => { loadData() }, [id])

  const onSave = async values => {
    setSaving(true)
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v !== undefined)
    )
    // Avoid accidental overwrite of unrelated platform fields
    if (payload.platform === 'github') {
      delete payload.gitlab_base_url
      delete payload.gitlab_project_id
      delete payload.gitlab_token
    } else {
      delete payload.github_owner
      delete payload.github_repo
      delete payload.github_token
    }
    try {
      await updateDepartment(id, payload)
      message.success('設定已儲存')
    } catch (err) {
      message.error(err.response?.data?.error || '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setTesting(true)
    try {
      await testDepartment(id)
      message.success('測試訊息已發送，請確認 Google Chat 是否收到')
    } catch (err) {
      message.error(err.response?.data?.error || err.response?.data?.detail || '連線失敗')
    } finally {
      setTesting(false)
    }
  }

  const onDelete = async () => {
    try {
      await deleteDepartment(id)
      message.success('部門已刪除')
      navigate('/')
    } catch {
      message.error('刪除失敗')
    }
  }

  if (loading) return (
    <AppLayout>
      <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <AntLayout style={{ background: 'transparent', gap: 20 }}>

        {/* ── Sidebar ── */}
        <Sider
          width={220}
          style={{
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            overflow: 'hidden',
            flexShrink: 0,
            alignSelf: 'flex-start',
          }}
        >
          <div
            style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
            onClick={() => navigate('/')}
            title="回部門列表"
          >
            <Text style={{ fontSize: 11, fontWeight: 700, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              部門 Webhook
            </Text>
          </div>

          {depts.map(d => {
            const isActive = String(d.id) === id
            return (
              <div
                key={d.id}
                onClick={() => navigate(`/dept/${d.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 16px',
                  cursor: 'pointer',
                  background: isActive ? '#f0f5ff' : 'transparent',
                  borderRight: isActive ? '2px solid #2563EB' : '2px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: d.is_active ? '#52c41a' : '#bfbfbf',
                  }} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#2563EB' : 'inherit',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {d.name}
                  </span>
                </div>
                {d.is_active && (
                  <Tag color="green" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', height: 18, flexShrink: 0, margin: 0 }}>
                    啟用
                  </Tag>
                )}
              </div>
            )
          })}

          {canEdit && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ padding: '0 12px 12px' }}>
                <Button
                  type="dashed" block size="small" icon={<PlusOutlined />}
                  onClick={() => setNewDeptOpen(true)}
                >
                  新增部門
                </Button>
              </div>
            </>
          )}
        </Sider>

        {/* ── Main content ── */}
        <Content style={{ minWidth: 0 }}>

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Title level={4} style={{ margin: 0 }}>{dept?.name}</Title>
                <Tag color={dept?.is_active ? 'green' : 'default'} style={{ margin: 0 }}>
                  {dept?.is_active ? '啟用中' : '未啟用'}
                </Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {dept?.slug}
                {dept?.created_at && ` · 建立於 ${new Date(dept.created_at).toLocaleDateString('zh-TW')}`}
              </Text>
            </div>
            <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/dept/${id}/logs`)}>
              事件記錄
            </Button>
          </div>

          <Form form={form} layout="vertical" onFinish={onSave} disabled={!canEdit}>

            {/* Webhook URL info */}
            <Card size="small" style={{ marginBottom: 16, borderColor: '#91caff', background: '#e6f4ff' }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                {platform === 'github'
                  ? '將以下網址填入 GitHub Repo → Settings → Webhooks，並填入相同的 Webhook Secret：'
                  : '將以下網址填入 GitLab → Settings → Webhooks，並填入相同的 Webhook Secret：'}
              </Text>
              <Input
                readOnly
                value={`${import.meta.env.VITE_API_URL || window.location.origin}/webhook?dept=${id}`}
                addonAfter={
                  <Button
                    size="small" type="link" icon={<CopyOutlined />} style={{ padding: 0 }}
                    onClick={() => {
                      navigator.clipboard.writeText(`${import.meta.env.VITE_API_URL || window.location.origin}/webhook?dept=${id}`)
                      message.success('已複製')
                    }}
                  >複製</Button>
                }
              />
              <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                {platform === 'github'
                  ? <>勾選事件：<b>Pull requests</b></>
                  : <>Trigger 勾選：<b>Merge request events</b></>}
              </Text>
            </Card>

            {/* GitLab settings */}
            <Card size="small" title={<SectionLabel>平台設定</SectionLabel>} style={{ marginBottom: 12 }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="平台" name="platform" style={{ marginBottom: 12 }}>
                    <Select options={[{ value: 'gitlab', label: 'GitLab' }, { value: 'github', label: 'GitHub' }]} />
                  </Form.Item>
                </Col>
              </Row>

              {platform === 'gitlab' ? (
                <>
                  <Form.Item label="GitLab 網址" name="gitlab_base_url" rules={[{ type: 'url' }]} style={{ marginBottom: 12 }}>
                    <Input placeholder="https://gitlab.company.com" />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="Project ID" name="gitlab_project_id" style={{ marginBottom: 12 }}>
                        <Input placeholder="123" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        label={<SecretLabel label="API Token" set={!!dept?.gitlab_token_enc} />}
                        name="gitlab_token"
                        style={{ marginBottom: 12 }}
                      >
                        <Input.Password placeholder="留空不更新" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ) : (
                <>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="GitHub Owner" name="github_owner" style={{ marginBottom: 12 }}>
                        <Input placeholder="octocat" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="GitHub Repo" name="github_repo" style={{ marginBottom: 12 }}>
                        <Input placeholder="hello-world" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item
                    label={<SecretLabel label="GitHub Token" set={!!dept?.github_token_enc} />}
                    name="github_token"
                    style={{ marginBottom: 12 }}
                  >
                    <Input.Password placeholder="留空不更新" />
                  </Form.Item>
                </>
              )}

              <Form.Item
                label={<SecretLabel label="Webhook Secret" set={!!dept?.webhook_secret_enc} />}
                name="webhook_secret"
                style={{ marginBottom: 0 }}
              >
                <Input.Password
                  placeholder="留空不更新"
                  addonAfter={
                    <Button size="small" type="link" style={{ padding: 0 }}
                      onClick={() => form.setFieldValue('webhook_secret', randomSecret())}>
                      <ReloadOutlined /> 隨機產生
                    </Button>
                  }
                />
              </Form.Item>
            </Card>

            {/* Google Chat settings */}
            <Card size="small" title={<SectionLabel>Google Chat 設定</SectionLabel>} style={{ marginBottom: 12 }}>
              <Form.Item
                label={<SecretLabel label="Incoming Webhook URL" set={!!dept?.chat_webhook_url_enc} />}
                name="chat_webhook_url"
                style={{ marginBottom: 12 }}
              >
                <Input
                  type="password"
                  placeholder="留空不更新"
                  autoComplete="off"
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    label="Chat Space ID"
                    name="space_name"
                    style={{ marginBottom: 0 }}
                    tooltip="填入後將透過 Chat API 發送（支援互動按鈕）。格式：spaces/XXXXXXXXX，可從 Chat Space URL 取得。"
                  >
                    <Input placeholder="spaces/XXXXXXXXX" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="通知語言" name="lang" style={{ marginBottom: 0 }}>
                    <Select options={[{ value: 'zh-TW', label: '繁體中文' }, { value: 'en', label: 'English' }]} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Event toggles */}
            <Card size="small" title={<SectionLabel>觸發事件</SectionLabel>} style={{ marginBottom: 20 }}>
              {EVENTS.map(({ name, label, desc }, i) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 0',
                    borderBottom: i < EVENTS.length - 1 ? '1px solid #f5f5f5' : 'none',
                  }}
                >
                  <div>
                    <Text style={{ fontWeight: 500, fontSize: 14, display: 'block' }}>{label}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{desc}</Text>
                  </div>
                  <Form.Item name={name} valuePropName="checked" style={{ marginBottom: 0, marginLeft: 24, flexShrink: 0 }}>
                    <Switch size="small" />
                  </Form.Item>
                </div>
              ))}
            </Card>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                {canEdit && (
                  <Button type="primary" htmlType="submit" loading={saving}>儲存設定</Button>
                )}
                <Button icon={<SendOutlined />} loading={testing} onClick={onTest}>測試連線</Button>
              </Space>
              {isAdmin && (
                <Popconfirm
                  title="確定刪除此部門？此操作無法還原。"
                  onConfirm={onDelete}
                  okText="刪除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>刪除部門</Button>
                </Popconfirm>
              )}
            </div>

          </Form>
        </Content>
      </AntLayout>

      <NewDeptModal
        open={newDeptOpen}
        onClose={() => setNewDeptOpen(false)}
        onCreated={() => {
          setNewDeptOpen(false)
          loadData()
        }}
      />
    </AppLayout>
  )
}
