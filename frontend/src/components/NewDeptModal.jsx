import { useState } from 'react'
import { Modal, Form, Input, Button, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { createDepartment } from '../api/departments'
import { randomSecret } from '../utils/random'

export default function NewDeptModal({ open, onClose, onCreated }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const onFinish = async values => {
    setLoading(true)
    try {
      const result = await createDepartment(values)
      message.success('部門已新增')
      form.resetFields()
      onCreated?.(result)
      onClose()
    } catch (err) {
      message.error(err.response?.data?.error || '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="新增部門"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }}>
        <Form.Item label="部門名稱" name="name" rules={[{ required: true }]}>
          <Input placeholder="後端工程" />
        </Form.Item>
        <Form.Item label="GitLab 網址" name="gitlab_base_url" rules={[{ required: true, type: 'url' }]}>
          <Input placeholder="https://gitlab.company.com" />
        </Form.Item>
        <Form.Item label="GitLab Project ID（選填）" name="gitlab_project_id">
          <Input placeholder="123（留空則接受此 GitLab 的所有 Project 事件）" />
        </Form.Item>
        <Form.Item label="GitLab API Token" name="gitlab_token" rules={[{ required: true }]}>
          <Input.Password placeholder="glpat-xxxx" />
        </Form.Item>
        <Form.Item label="Webhook Secret" name="webhook_secret" rules={[{ required: true }]}>
          <Input.Password
            placeholder="32 碼隨機字串"
            addonAfter={
              <Button size="small" type="link" style={{ padding: 0 }}
                onClick={() => form.setFieldValue('webhook_secret', randomSecret())}>
                <ReloadOutlined /> 隨機產生
              </Button>
            }
          />
        </Form.Item>
        <Form.Item label="Google Chat Webhook URL" name="chat_webhook_url" rules={[{ required: true, type: 'url' }]}>
          <Input.Password placeholder="https://chat.googleapis.com/v1/spaces/..." />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>新增</Button>
      </Form>
    </Modal>
  )
}
