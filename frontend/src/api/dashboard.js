import client from './client'

export const getDashboardOverview = range =>
  client.get('/api/dashboard', { params: { range } }).then(response => response.data)
