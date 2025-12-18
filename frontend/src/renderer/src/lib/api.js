import axios from 'axios'

export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 네트워크 에러
    if (!error.response) {
      console.error('Network error:', error.message)
      return Promise.reject(new Error('네트워크 연결을 확인해주세요.'))
    }

    // 401 Unauthorized - 토큰 만료 처리
    if (error.response.status === 401) {
      console.warn('Unauthorized request - token may be expired')
    }

    // 서버 에러
    if (error.response.status >= 500) {
      console.error('Server error:', error.response.data)
    }

    return Promise.reject(error)
  }
)
