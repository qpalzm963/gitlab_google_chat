import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Typography, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getDepartments } from '../api/departments'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/Layout'
import NewDeptModal from '../components/NewDeptModal'

const { Title, Text } = Typography

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    getDepartments()
      .then(depts => {
        if (depts.length > 0) navigate(`/dept/${depts[0].id}`, { replace: true })
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <AppLayout>
      <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>還沒有任何部門</Title>
        <Text type="secondary">新增第一個部門以開始接收 GitLab Webhook 通知</Text>
        {['admin', 'editor'].includes(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setModalOpen(true)}>
            新增部門
          </Button>
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
