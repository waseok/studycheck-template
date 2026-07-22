import axios from 'axios'

// 개발: Vite 프록시(/api), 프로덕션: 환경변수 또는 상대경로
const API_URL = import.meta.env.VITE_API_URL || '/api'

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
  timeout: 60000, // 60초 타임아웃 (절전 모드에서 서버 깨어나는 시간 고려)
})

function hasAuthorizationHeader(headers: unknown): boolean {
  if (!headers || typeof headers !== 'object') return false
  const h = headers as Record<string, unknown>
  const value = h.Authorization ?? h.authorization
  if (typeof value === 'string' && value.trim()) return true
  // AxiosHeaders.get 지원
  if (typeof (headers as { get?: (key: string) => unknown }).get === 'function') {
    const fromGetter = (headers as { get: (key: string) => unknown }).get('Authorization')
    return typeof fromGetter === 'string' && fromGetter.trim().length > 0
  }
  return false
}

// 요청 인터셉터: 앱 로그인 토큰 추가
// 온보딩 등에서 이미 Authorization을 지정한 경우 덮어쓰지 않음
apiClient.interceptors.request.use(
  (config) => {
    if (!config.headers) {
      config.headers = {} as any
    }

    if (hasAuthorizationHeader(config.headers)) {
      return config
    }

    let token: string | null = null
    try {
      token = localStorage.getItem('token')
    } catch (error) {
      console.error('localStorage 접근 오류:', error)
    }

    if (token) {
      const headers = config.headers as any
      headers['Authorization'] = `Bearer ${token}`
      headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

// 응답 인터셉터: 에러 처리
let isRedirecting = false

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const path = window.location.pathname
    const requestUrl = String(error.config?.url || '')
    const isOnboardingFlow =
      path.startsWith('/onboarding') || requestUrl.includes('/onboarding/')

    // 온보딩 세션 401은 로그인 페이지로 보내지 않음 (세션 토큰 문제이므로 화면에 에러 표시)
    if (status === 401 && !isRedirecting && !isOnboardingFlow && path !== '/login') {
      isRedirecting = true
      localStorage.removeItem('token')
      localStorage.removeItem('isAdmin')
      setTimeout(() => {
        window.location.href = '/login'
      }, 100)
    }

    return Promise.reject(error)
  }
)

export default apiClient
