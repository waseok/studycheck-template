import apiClient from './client'
import { AuthResponse, AppRole } from '../types'

export interface LoginResponse extends AuthResponse {
  mustSetPin?: boolean
}

// 초기 비밀번호로 로그인
export const loginInitial = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/auth/login-initial', { email, password })
  if (response.data.success && response.data.token) {
    localStorage.setItem('token', response.data.token)
    localStorage.setItem('isAdmin', String(response.data.isAdmin || false))
    if (response.data.role) {
      localStorage.setItem('role', response.data.role)
    } else {
      localStorage.setItem('role', response.data.isAdmin ? 'SUPER_ADMIN' : 'USER')
    }
  }
  return response.data
}

// PIN으로 로그인
export const loginPin = async (email: string, pin: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/auth/login-pin', { email, pin })
  if (response.data.success && response.data.token) {
    localStorage.setItem('token', response.data.token)
    localStorage.setItem('isAdmin', String(response.data.isAdmin || false))
    if (response.data.role) {
      localStorage.setItem('role', response.data.role)
    } else {
      localStorage.setItem('role', response.data.isAdmin ? 'SUPER_ADMIN' : 'USER')
    }
  }
  return response.data
}

// PIN 설정
export const setPin = async (pin: string): Promise<{ success: boolean; token: string; message: string }> => {
  const response = await apiClient.post<{ success: boolean; token: string; message: string }>('/auth/set-pin', { pin })
  if (response.data.success && response.data.token) {
    localStorage.setItem('token', response.data.token)
  }
  return response.data
}

// 기존 login 함수 (호환성)
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  // 이메일이 빈 문자열이면 undefined로 전달 (백엔드에서 선택사항으로 처리)
  const requestBody = email && email.trim() ? { email: email.trim(), password } : { password }
  const response = await apiClient.post<AuthResponse>('/auth/login', requestBody)
  if (response.data.success && response.data.token) {
    localStorage.setItem('token', response.data.token)
    // isAdmin이 명시적으로 true/false인지 확인하고 저장
    const isAdminValue = response.data.isAdmin === true || String(response.data.isAdmin) === 'true'
    localStorage.setItem('isAdmin', String(isAdminValue))
    // role이 있으면 사용하고, 없으면 isAdmin에 따라 결정
    const role = response.data.role || (isAdminValue ? 'SUPER_ADMIN' : 'USER')
    localStorage.setItem('role', role)
  }
  return response.data
}

export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('isAdmin')
  localStorage.removeItem('role')
  window.location.href = '/login'
}

export const isAdmin = (): boolean => {
  try {
    return localStorage.getItem('isAdmin') === 'true'
  } catch (error) {
    console.error('isAdmin 오류:', error)
    return false
  }
}

export const isAuthenticated = (): boolean => {
  try {
    const token = localStorage.getItem('token')
    if (!token) return false
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      // 토큰 만료 시 정리
      localStorage.removeItem('token')
      localStorage.removeItem('isAdmin')
      localStorage.removeItem('role')
      return false
    }
    return true
  } catch (error) {
    console.error('isAuthenticated 오류:', error)
    return false
  }
}

export const getRole = (): AppRole => {
  try {
    const role = localStorage.getItem('role') as AppRole | null
    if (role === 'SUPER_ADMIN' || role === 'TRAINING_ADMIN' || role === 'USER') return role
    return isAdmin() ? 'SUPER_ADMIN' : 'USER'
  } catch (error) {
    console.error('getRole 오류:', error)
    return 'USER'
  }
}

export const hasRole = (allowed: AppRole[]): boolean => {
  const role = getRole()
  if (allowed.includes('SUPER_ADMIN') && role === 'SUPER_ADMIN') return true
  if (allowed.includes('TRAINING_ADMIN') && (role === 'TRAINING_ADMIN' || role === 'SUPER_ADMIN')) return true
  if (allowed.includes('USER') && (role === 'USER' || role === 'TRAINING_ADMIN' || role === 'SUPER_ADMIN')) return true
  return false
}

// 회원가입 (일반 사용자용, 인증 불필요)
export const register = async (userData: {
  name: string
  email: string
  userType: string
  pin: string
  position?: string
  grade?: string
  class?: string
}): Promise<{ success: boolean; message: string }> => {
  // 회원가입은 인증이 필요 없으므로 별도 클라이언트 사용
  const apiUrl = import.meta.env.VITE_API_URL || '/api'
  const response = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || '회원가입에 실패했습니다.')
  }
  return data
}