import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { getPublicSettings, PublicSettings } from '../api/settings'

const DEFAULT_SETTINGS: PublicSettings = {
  schoolName: '연수 관리 통합 플랫폼',
  schoolLogoUrl: null,
  vercelAppUrl: null,
  setupCompleted: false,
}

interface SettingsContextValue {
  settings: PublicSettings
  appTitle: string
  platformLabel: string
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  appTitle: DEFAULT_SETTINGS.schoolName,
  platformLabel: '연수관리 플랫폼',
  loading: true,
  refreshSettings: async () => {},
})

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  const refreshSettings = async () => {
    try {
      // 부팅 시 설정 API가 멈추면 화면이 「로딩 중」에 장시간 갇히지 않게 한다
      const data = await getPublicSettings({ timeoutMs: 45000 })
      setSettings(data)
      document.title = `${data.schoolName} 연수 관리`
    } catch {
      document.title = '연수 관리 통합 플랫폼'
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  const value = useMemo(() => ({
    settings,
    appTitle: `${settings.schoolName} 연수 관리`,
    platformLabel: `${settings.schoolName} 연수관리 플랫폼`,
    loading,
    refreshSettings,
  }), [settings, loading])

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
