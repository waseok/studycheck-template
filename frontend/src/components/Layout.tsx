import { useMemo, useState, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const role = (localStorage.getItem('role') as 'SUPER_ADMIN' | 'TRAINING_ADMIN' | 'USER' | null) || 'USER'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) => location.pathname === path
  const isStartsWith = (path: string) => location.pathname.startsWith(path)

  const closeMenu = () => setMobileMenuOpen(false)
  const menuItems = useMemo(() => {
    const base = [
      { to: '/dashboard/training-notice', label: '📋 연수 안내', show: true, startsWith: false },
      { to: '/dashboard/users', label: '👥 교직원 관리', show: role === 'SUPER_ADMIN', startsWith: false },
      { to: '/dashboard/trainings', label: '📖 연수 관리', show: role === 'SUPER_ADMIN' || role === 'TRAINING_ADMIN', startsWith: false },
      { to: '/dashboard/signature-book', label: '✍️ 연수등록부', subLabel: '서명하기', show: true, startsWith: true },
      { to: '/dashboard/meetings', label: '📝 회의등록부', subLabel: '서명하기', show: true, startsWith: true },
      { to: '/dashboard/my-trainings', label: '✏️ 내 연수', show: true, startsWith: false },
      { to: '/dashboard/stats', label: '📊 통계', show: role === 'SUPER_ADMIN' || role === 'TRAINING_ADMIN', startsWith: false },
      { to: '/dashboard/profile', label: '👤 내 정보', show: true, startsWith: false },
    ]
    return base.filter(item => item.show)
  }, [role])

  return (
    <div className="min-h-screen bg-sky-50">
      <div className="md:hidden bg-white shadow border-b border-blue-100">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="text-blue-800 font-extrabold text-lg flex items-center gap-2">
            <img src="/school-logo.png" alt="와석초등학교 교표" className="h-9 w-9 object-contain" />
            <span>와석초 연수관리 플랫폼</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-10 h-10 rounded-lg text-blue-700 hover:bg-blue-50"
            aria-label="메뉴"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="px-3 pb-3 space-y-1 border-t border-blue-100">
            {menuItems.map(item => {
              const active = item.startsWith ? isStartsWith(item.to) : isActive(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-base font-bold ${active ? 'bg-blue-500 text-white' : 'text-blue-800 hover:bg-blue-50'}`}
                >
                  <span>{item.label}</span>
                  {item.subLabel && <span className={`text-sm font-semibold ${active ? 'text-blue-100' : 'text-blue-600'}`}>{item.subLabel}</span>}
                </Link>
              )
            })}
            <button onClick={() => { handleLogout(); closeMenu() }} className="w-full text-left px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 border-t border-gray-100">
              🚪 로그아웃
            </button>
          </div>
        )}
      </div>

      <div className="md:flex">
        <aside className="hidden md:flex md:w-72 min-h-screen bg-white border-r border-blue-100 shadow-sm flex-col">
          <div className="h-24 flex items-center justify-center px-5 border-b border-blue-100">
            <Link to="/dashboard" className="text-blue-800 text-center leading-tight flex flex-col items-center">
              <img src="/school-logo.png" alt="와석초등학교 교표" className="h-11 w-11 object-contain mb-1" />
              <div className="font-extrabold text-2xl tracking-tight">와석초 연수관리 플랫폼</div>
            </Link>
          </div>
          <nav className="p-3 space-y-1">
            {menuItems.map(item => {
              const active = item.startsWith ? isStartsWith(item.to) : isActive(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-lg font-bold transition ${active ? 'bg-blue-500 text-white shadow' : 'text-blue-800 hover:bg-blue-50'}`}
                >
                  <span>{item.label}</span>
                  {item.subLabel && <span className={`text-xs font-semibold ${active ? 'text-blue-100' : 'text-blue-600'}`}>{item.subLabel}</span>}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto p-3 border-t border-blue-100">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 text-red-600 rounded-xl border border-red-200 hover:bg-red-50 font-medium"
            >
              🚪 로그아웃
            </button>
          </div>
        </aside>

        <main className="flex-1 py-6 md:py-8 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
