import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DeptSettings from './pages/DeptSettings'
import DeptLogs from './pages/DeptLogs'

export default function App() {
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary: '#1c4dff',
          borderRadius: 18,
          colorBgLayout: '#f5f1e8',
          fontFamily: '"IBM Plex Sans TC", "IBM Plex Sans", sans-serif'
        }
      }}
    >
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dept/:id" element={<ProtectedRoute><DeptSettings /></ProtectedRoute>} />
              <Route path="/dept/:id/logs" element={<ProtectedRoute><DeptLogs /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  )
}
