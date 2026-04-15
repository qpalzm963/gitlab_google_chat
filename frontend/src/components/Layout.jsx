import { useEffect, useMemo, useState } from 'react'
import { Layout, Dropdown, Button, Avatar, Tag } from 'antd'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { DownOutlined, AppstoreOutlined, LogoutOutlined, CheckOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { getDepartments } from '../api/departments'
import './Layout.css'

const { Header, Content } = Layout

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    let cancelled = false
    getDepartments()
      .then(list => { if (!cancelled) setDepartments(list || []) })
      .catch(() => { if (!cancelled) setDepartments([]) })
    return () => { cancelled = true }
  }, [])

  const isDashboard = location.pathname === '/'
  const activeDeptId = params.id || null
  const activeDept = useMemo(
    () => departments.find(d => d.id === activeDeptId) || null,
    [departments, activeDeptId]
  )

  const deptMenu = useMemo(() => {
    if (departments.length === 0) {
      return { items: [{ key: 'empty', label: '尚無可存取的部門', disabled: true }] }
    }
    return {
      items: departments.map(d => ({
        key: d.id,
        label: (
          <div className="app-nav__dept-item">
            <span className="app-nav__dept-name">{d.name}</span>
            {d.id === activeDeptId && <CheckOutlined style={{ color: '#1c4dff' }} />}
          </div>
        ),
        onClick: () => navigate(`/dept/${d.id}`)
      }))
    }
  }, [departments, activeDeptId, navigate])

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '登出',
        onClick: () => { logout(); navigate('/login') }
      }
    ]
  }

  return (
    <Layout className="app-shell">
      <Header className="app-nav">
        <div className="app-nav__inner">
          <div className="app-nav__left">
            <button
              type="button"
              className="app-nav__brand"
              onClick={() => navigate('/')}
              aria-label="回到儀表板"
            >
              <span className="app-nav__brand-mark">GC</span>
              <span className="app-nav__brand-text">GitLab × Google Chat</span>
            </button>

            <nav className="app-nav__links" aria-label="主要導覽">
              <button
                type="button"
                className={`app-nav__link ${isDashboard ? 'app-nav__link--active' : ''}`}
                onClick={() => navigate('/')}
              >
                統計儀表板
              </button>

              <Dropdown
                menu={deptMenu}
                trigger={['click']}
                placement="bottomLeft"
                overlayClassName="app-nav__dept-overlay"
              >
                <button
                  type="button"
                  className={`app-nav__link app-nav__link--dropdown ${activeDeptId ? 'app-nav__link--active' : ''}`}
                >
                  <AppstoreOutlined />
                  <span>
                    {activeDept ? activeDept.name : '部門'}
                  </span>
                  {departments.length > 0 && (
                    <Tag className="app-nav__count-tag" bordered={false}>
                      {departments.length}
                    </Tag>
                  )}
                  <DownOutlined style={{ fontSize: 10 }} />
                </button>
              </Dropdown>
            </nav>
          </div>

          <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
            <Button type="text" className="app-nav__user">
              <Avatar size={32} className="app-nav__avatar">
                {(user?.name || '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="app-nav__user-meta">
                <span className="app-nav__user-name">{user?.name}</span>
                <span className="app-nav__user-role">{user?.role}</span>
              </div>
              <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
        </div>
      </Header>

      <Content className="app-content">
        <div className="app-content__inner">
          {children}
        </div>
      </Content>
    </Layout>
  )
}
