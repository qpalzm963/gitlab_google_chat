import client from './client'

export const getDepartments = () => client.get('/api/departments').then(r => r.data)

export const getDepartment = id => client.get(`/api/departments/${id}`).then(r => r.data)

export const createDepartment = data => client.post('/api/departments', data).then(r => r.data)

export const updateDepartment = (id, data) => client.put(`/api/departments/${id}`, data).then(r => r.data)

export const deleteDepartment = id => client.delete(`/api/departments/${id}`).then(r => r.data)

export const testDepartment = id => client.post(`/api/departments/${id}/test`).then(r => r.data)

export const getDeptLogs = id => client.get(`/api/departments/${id}/logs`).then(r => r.data)
