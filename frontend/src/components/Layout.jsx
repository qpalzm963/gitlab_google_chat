import { Layout, Menu, Button, Typography } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const { Header, Content } = Layout
const { Text } = Typography

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Text strong style={{ color: '#fff', fontSize: 16, cursor: 'pointer' }} onClick={() => navigate('/')}>
            GitLab × Google Chat
          </Text>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname === '/' ? '/' : '']}
            items={[{ key: '/', label: '統計儀表板', onClick: () => navigate('/') }]}
            style={{ background: 'transparent', borderBottom: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: '#ccc' }}>{user?.name} ({user?.role})</Text>
          <Button size="small" onClick={handleLogout}>登出</Button>
        </div>
      </Header>
      <Content style={{ padding: '24px 48px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {children}
      </Content>
    </Layout>
  )
}
