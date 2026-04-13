import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Button, Typography, Spin, Tooltip, message } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { getDeptLogs, getDepartment } from '../api/departments'
import AppLayout from '../components/Layout'

const { Title, Text } = Typography

const STATUS_COLOR = { sent: 'green', failed: 'red', duplicate: 'default' }
const STATUS_LABEL = { sent: '已送出', failed: '失敗', duplicate: '重複' }

export default function DeptLogs() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [deptName, setDeptName] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const [logsData, deptData] = await Promise.all([getDeptLogs(id), getDepartment(id)])
      setLogs(logsData)
      setDeptName(deptData.name)
    } catch {
      message.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [id])

  const columns = [
    {
      title: '時間',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: v => new Date(v).toLocaleString('zh-TW')
    },
    {
      title: '事件類型',
      dataIndex: 'event_type',
      key: 'event_type',
      render: (type, r) => (
        <span>
          <Tag>{type}</Tag>
          {r.event_action && <Tag color="blue">{r.event_action}</Tag>}
        </span>
      )
    },
    {
      title: 'MR/PR #',
      dataIndex: 'gitlab_mr_iid',
      key: 'gitlab_mr_iid',
      width: 80,
      render: (v, r) => {
        if (!v) return '—'
        const prefix = r.event_type === 'pull_request' ? '#' : '!'
        return `${prefix}${v}`
      }
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: v => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Tag>
    },
    {
      title: 'Chat 回應',
      dataIndex: 'chat_response_code',
      key: 'chat_response_code',
      width: 90,
      render: v => v ? <Tag color={v === 200 ? 'green' : 'red'}>{v}</Tag> : '—'
    },
    {
      title: '重試次數',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 80,
      render: v => v > 0 ? <Tag color="orange">{v}</Tag> : '—'
    },
    {
      title: '錯誤訊息',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: v => v
        ? <Tooltip title={v}><Text type="danger" style={{ fontSize: 12 }}>{v}</Text></Tooltip>
        : '—'
    }
  ]

  return (
    <AppLayout>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/dept/${id}`)}>返回設定</Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{deptName} — 事件記錄</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>重新整理</Button>
      </div>
      <Card>
        {loading
          ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          : <Table
              dataSource={logs}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: '尚無 Webhook 事件記錄' }}
              size="small"
            />
        }
      </Card>
    </AppLayout>
  )
}
