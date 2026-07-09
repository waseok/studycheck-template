import type { ReactNode } from 'react'

export type TokenGuideId = 'github' | 'vercel' | 'supabase-token' | 'supabase-database'

export interface TokenGuideContent {
  title: string
  summary: string
  openUrl: string
  openLabel: string
  steps: string[]
  mockScreenshot: ReactNode
  tips?: string[]
}

function MockBrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-300 overflow-hidden shadow-sm bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-gray-500">{url}</span>
      </div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  )
}

function Highlight({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="relative rounded-lg border-2 border-indigo-500 bg-indigo-50 px-3 py-2 ring-2 ring-indigo-200">
      {label && (
        <span className="absolute -top-2.5 left-3 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

function MenuItem({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded px-2 py-1.5 text-xs ${active ? 'bg-indigo-100 font-semibold text-indigo-900' : 'text-gray-600'}`}
    >
      {children}
    </div>
  )
}

export const TOKEN_GUIDES: Record<TokenGuideId, TokenGuideContent> = {
  github: {
    title: 'GitHub Personal Access Token',
    summary: 'GitHub에서 저장소를 만들 권한이 있는 토큰을 발급합니다. 계정 아이디는 따로 입력하지 않아도 됩니다.',
    openUrl: 'https://github.com/settings/tokens/new',
    openLabel: 'GitHub 토큰 발급 페이지 열기',
    steps: [
      'GitHub에 로그인한 뒤 우측 상단 프로필 사진 → Settings 를 클릭합니다.',
      '좌측 메뉴 맨 아래 Developer settings → Personal access tokens → Tokens (classic) 로 이동합니다.',
      'Generate new token (classic) 을 누르고 Note(메모)에 studycheck 같은 이름을 적습니다.',
      'Expiration(만료)은 30일 또는 90일 중 편한 기간을 선택합니다.',
      'Scopes에서 repo 전체를 체크합니다. (저장소 생성·복제에 필요)',
      'Generate token 을 누른 뒤, 화면에 한 번만 보이는 ghp_... 토큰을 복사해 아래 입력란에 붙여넣습니다.',
    ],
    tips: [
      '토큰은 다시 볼 수 없으니, 발급 직후 반드시 복사해 두세요.',
      'Fine-grained token 대신 classic token + repo 권한을 권장합니다.',
    ],
    mockScreenshot: (
      <MockBrowserFrame url="github.com/settings/tokens/new">
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <div className="space-y-1 border-r border-gray-100 pr-2">
            <MenuItem>Public profile</MenuItem>
            <MenuItem>Account</MenuItem>
            <MenuItem active>Developer settings</MenuItem>
            <div className="ml-2 space-y-1 border-l-2 border-indigo-200 pl-2">
              <MenuItem active>Tokens (classic)</MenuItem>
              <MenuItem>Fine-grained tokens</MenuItem>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-800">New personal access token (classic)</p>
            <div className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-500">Note: studycheck-onboarding</div>
            <Highlight label="필수">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-800">
                <input type="checkbox" readOnly checked className="accent-indigo-600" />
                repo — Full control of private repositories
              </label>
            </Highlight>
            <div className="rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] text-green-300">
              ghp_xxxxxxxxxxxxxxxxxxxx
            </div>
          </div>
        </div>
      </MockBrowserFrame>
    ),
  },
  vercel: {
    title: 'Vercel Access Token',
    summary: 'Vercel에서 새 프로젝트를 만들고 환경변수를 설정할 수 있는 토큰을 발급합니다.',
    openUrl: 'https://vercel.com/account/settings/tokens',
    openLabel: 'Vercel 토큰 발급 페이지 열기',
    steps: [
      'vercel.com 에 로그인합니다.',
      '우측 상단 프로필 → Account Settings → Tokens 로 이동합니다.',
      'Create Token 을 클릭하고 Token Name에 studycheck 같은 이름을 입력합니다.',
      'Scope는 Full Account(또는 프로젝트 생성·환경변수 수정이 가능한 범위)를 선택합니다.',
      'Create 를 누른 뒤 표시되는 토큰을 복사해 아래 입력란에 붙여넣습니다.',
    ],
    tips: ['팀(Team) 계정을 쓰는 경우, 토큰 발급 후 「팀 목록 불러오기」로 팀을 선택할 수 있습니다.'],
    mockScreenshot: (
      <MockBrowserFrame url="vercel.com/account/settings/tokens">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-800">Account Settings → Tokens</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-500">Token Name: studycheck</div>
            <Highlight label="권장">
              <span className="text-xs font-medium text-gray-800">Scope: Full Account</span>
            </Highlight>
          </div>
          <button type="button" className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white">
            Create Token
          </button>
          <div className="rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] text-green-300">
            vercel_xxxxxxxxxxxxxxxx
          </div>
        </div>
      </MockBrowserFrame>
    ),
  },
  'supabase-token': {
    title: 'Supabase Access Token',
    summary: 'Supabase 대시보드에서 새 프로젝트를 만들 때 필요한 관리용 토큰입니다. (기존 DB만 연결할 때는 생략 가능)',
    openUrl: 'https://supabase.com/dashboard/account/tokens',
    openLabel: 'Supabase 토큰 발급 페이지 열기',
    steps: [
      'supabase.com/dashboard 에 로그인합니다.',
      '좌측 하단 프로필 → Account → Access Tokens 로 이동합니다.',
      'Generate new token 을 클릭하고 이름(예: studycheck)을 입력합니다.',
      '생성된 sbp_... 토큰을 복사해 아래 입력란에 붙여넣습니다.',
      '「조직 목록 불러오기」를 눌러 프로젝트를 만들 조직을 선택합니다.',
    ],
    tips: ['이미 Supabase 프로젝트가 있다면 토큰 없이 아래 Session pooler URI만 입력해도 됩니다.'],
    mockScreenshot: (
      <MockBrowserFrame url="supabase.com/dashboard/account/tokens">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-800">Account → Access Tokens</p>
          <Highlight label="여기">
            <button type="button" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
              Generate new token
            </button>
          </Highlight>
          <div className="rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] text-green-300">
            sbp_xxxxxxxxxxxxxxxxxxxx
          </div>
        </div>
      </MockBrowserFrame>
    ),
  },
  'supabase-database': {
    title: 'Supabase Session pooler DATABASE_URL',
    summary: '앱이 Supabase Postgres에 연결할 때 쓰는 주소입니다. Direct connection 이 아니라 Session pooler 를 선택해야 합니다.',
    openUrl: 'https://supabase.com/dashboard/project/_/settings/database',
    openLabel: 'Supabase Database 설정 열기',
    steps: [
      'Supabase 대시보드에서 해당 프로젝트를 선택합니다.',
      '좌측 Settings → Database 로 이동합니다.',
      'Connection string 섹션에서 Type: URI 를 선택합니다.',
      'Method에서 Session pooler 를 선택합니다. (Direct connection 사용 금지)',
      '표시된 URI에서 [YOUR-PASSWORD] 를 실제 DB 비밀번호로 바꾼 뒤 복사합니다.',
      '비밀번호에 ! @ # 등 특수문자가 있으면 URL 인코딩(! → %21) 후 붙여넣습니다.',
    ],
    tips: ['프로젝트를 방금 만들었다면 DB 비밀번호는 생성 시 입력한 값입니다.'],
    mockScreenshot: (
      <MockBrowserFrame url="supabase.com/dashboard/project/.../settings/database">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-800">Settings → Database → Connection string</p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">URI</span>
            <Highlight label="중요">
              <span className="text-xs font-semibold text-indigo-900">Method: Session pooler</span>
            </Highlight>
          </div>
          <div className="rounded-md bg-gray-900 px-3 py-2 font-mono text-[10px] leading-relaxed text-green-300 break-all">
            postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
          </div>
          <p className="text-[11px] text-gray-500">[YOUR-PASSWORD] 자리에 DB 비밀번호를 넣고, 특수문자는 URL 인코딩(! → %21) 합니다.</p>
        </div>
      </MockBrowserFrame>
    ),
  },
}
