import { useState } from 'react'
import { Modal, Form, Input, Button, Select, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { createDepartment } from '../api/departments'
import { randomSecret } from '../utils/random'

export default function NewDeptModal({ open, onClose, onCreated }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const platform = Form.useWatch('platform', form) || 'gitlab'

  const onFinish = async values => {
    setLoading(true)
    try {
      // Remove irrelevant fields to avoid accidental overwrite on create
      const payload = { ...values }
      if (payload.platform === 'github') {
        delete payload.gitlab_base_url
        delete payload.gitlab_project_id
        delete payload.gitlab_token
      } else {
        delete payload.github_owner
        delete payload.github_repo
        delete payload.github_token
      }
      await createDepartment(payload)
      message.success('部門已新增')
      form.resetFields()
      onCreated?.()
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
        <Form.Item label="平台" name="platform" initialValue="gitlab" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'gitlab', label: 'GitLab' },
              { value: 'github', label: 'GitHub' }
            ]}
          />
        </Form.Item>
        {platform === 'gitlab' ? (
          <>
            <Form.Item label="GitLab 網址" name="gitlab_base_url" rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://gitlab.company.com" />
            </Form.Item>
            <Form.Item label="GitLab Project ID（選填）" name="gitlab_project_id">
              <Input placeholder="123（留空則接受此 GitLab 的所有 Project 事件）" />
            </Form.Item>
            <Form.Item label="GitLab API Token" name="gitlab_token" rules={[{ required: true }]}>
              <Input.Password placeholder="glpat-xxxx" />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item label="GitHub Owner" name="github_owner" rules={[{ required: true }]}>
              <Input placeholder="octocat" />
            </Form.Item>
            <Form.Item label="GitHub Repo" name="github_repo" rules={[{ required: true }]}>
              <Input placeholder="hello-world" />
            </Form.Item>
            <Form.Item label="GitHub Token" name="github_token" rules={[{ required: true }]}>
              <Input.Password placeholder="ghp_xxx 或 fine-grained token" />
            </Form.Item>
          </>
        )}
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
