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

// 요청 인터셉터: 토큰 추가
apiClient.interceptors.request.use(
  (config) => {
    // localStorage에서 토큰 가져오기
    let token: string | null = null
    try {
      token = localStorage.getItem('token')
    } catch (error) {
      console.error('localStorage 접근 오류:', error)
    }
    
    // 헤더 객체가 없으면 생성
    if (!config.headers) {
      config.headers = {} as any
    }
    
    // 토큰이 있으면 Authorization 헤더에 추가
    if (token) {
      const headers = config.headers as any
      headers['Authorization'] = `Bearer ${token}`
      headers.Authorization = `Bearer ${token}`
      
      if ((config.headers as any).common) {
        (config.headers.common as any)['Authorization'] = `Bearer ${token}`
      }
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 응답 인터셉터: 에러 처리
let isRedirecting = false

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 에러 처리 (인증 실패)
    if (error.response?.status === 401 && !isRedirecting) {
      if (window.location.pathname !== '/login') {
        isRedirecting = true
        localStorage.removeItem('token')
        localStorage.removeItem('isAdmin')
        setTimeout(() => { window.location.href = '/login' }, 100)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
