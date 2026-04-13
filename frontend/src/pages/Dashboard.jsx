import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Tag, Space, Typography, Card, Popconfirm, message } from 'antd'
import { PlusOutlined, SettingOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons'
import { getDepartments, deleteDepartment } from '../api/departments'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/Layout'
import NewDeptModal from '../components/NewDeptModal'

const { Title } = Typography

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [depts, setDepts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchDepts = async () => {
    setLoading(true)
    try {
      setDepts(await getDepartments())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDepts() }, [])

  const handleDelete = async slug => {
    try {
      await deleteDepartment(slug)
      message.success('部門已刪除')
      fetchDepts()
    } catch {
      message.error('刪除失敗')
    }
  }

  const columns = [
    {
      title: '部門名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name, r) => (
        <a onClick={() => navigate(`/dept/${r.id}`)} style={{ fontWeight: 500 }}>{name}</a>
      )
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 90,
      render: v => <Tag>{(v || 'gitlab').toUpperCase()}</Tag>
    },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', render: s => <code>{s}</code> },
    {
      title: '來源',
      key: 'source',
      ellipsis: true,
      render: (_, r) => {
        const platform = r.platform || 'gitlab'
        if (platform === 'github') return <code>{`${r.github_owner || ''}/${r.github_repo || ''}`}</code>
        return r.gitlab_base_url || '—'
      }
    },
    {
      title: '狀態',
      dataIndex: 'is_active',
      key: 'is_active',
      render: v => <Tag color={v ? 'green' : 'default'}>{v ? '啟用' : '未啟用'}</Tag>
    },
    {
      title: '語言',
      dataIndex: 'lang',
      key: 'lang',
      render: v => <Tag>{v}</Tag>
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => navigate(`/dept/${r.id}`)}>設定</Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/dept/${r.id}/logs`)}>記錄</Button>
          {user?.role === 'admin' && (
            <Popconfirm title="確定刪除此部門？" onConfirm={() => handleDelete(r.slug)} okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>部門管理</Title>
        {['admin', 'editor'].includes(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增部門</Button>
        )}
      </div>
      <Card>
        <Table
          dataSource={depts}
          columns={columns}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: '尚無部門，請新增第一個部門' }}
          pagination={false}
        />
      </Card>
      <NewDeptModal open={modalOpen} onClose={() => { setModalOpen(false); fetchDepts() }} />
    </AppLayout>
  )
}
