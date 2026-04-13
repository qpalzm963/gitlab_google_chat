import axios from 'axios'

function resolveBaseURL() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  // When the frontend is served by the same origin as the API (e.g. Vercel rewrite),
  // default to same-origin so production doesn't accidentally call localhost.
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return 'http://localhost:3000'
}

const client = axios.create({
  baseURL: resolveBaseURL()
})

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
