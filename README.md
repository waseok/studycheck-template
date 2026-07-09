# Studycheck Template — 학교 온보딩 템플릿

이 저장소는 단순한 웹앱이 아니라, **학교별 복제/배포를 대신 도와주는 온보딩 템플릿**입니다.

목표는 다음 흐름을 한 화면에서 이어주는 것입니다.

```text
온보딩 사이트 접속
  → GitHub 새 저장소 생성
  → Vercel 프로젝트 생성
  → Supabase 연결
  → 환경변수 주입 / 재배포
  → 학교 정보 setup 완료
```

## 현재 구조

```text
.
├── api/               # Vercel Serverless API 진입점
├── frontend/          # 온보딩 UI + 학교용 앱 UI
├── backend/           # Express API + Prisma + provider automation
├── scripts/           # Vercel 빌드 스크립트
├── vercel.json        # 루트 기준 단일 배포 설정
└── DEPLOY.md          # 실제 배포/테스트 가이드
```

## 핵심 개념

### 1. `/onboarding`
- GitHub 템플릿 복제
- Vercel 프로젝트 생성
- Supabase 연결 또는 생성
- `DATABASE_URL`, `JWT_SECRET` 주입
- 첫 배포 자동화

### 2. `/setup`
- 인프라 연결이 끝난 뒤
- 학교 이름
- 학교 비밀번호
- 관리자 계정
만 입력하는 마지막 단계

즉, 예전처럼 `/setup`이 모든 걸 처리하는 구조가 아니라,  
이제는 **`/onboarding`이 복제부터 인프라까지**, **`/setup`이 학교 정보 마무리**를 담당합니다.

## 로컬 개발

### 설치

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 실행

```bash
# 터미널 1
cd backend
npm run dev

# 터미널 2
cd frontend
npm run dev
```

### 로컬 접속

- 프론트엔드: `http://localhost:5173`
- API 상태: `http://localhost:3000/api/health`

## 환경 변수

기본 개발용 예시는 루트의 [`.env.example`](./.env.example)에 있습니다.

주요 값:

- `DATABASE_URL`
- `JWT_SECRET`
- `ONBOARDING_SESSION_SECRET` (선택)
- `GITHUB_CLIENT_ID` (선택, OAuth 확장용)
- `VERCEL_CLIENT_ID` (선택, OAuth 확장용)
- `SUPABASE_MANAGEMENT_CLIENT_ID` (선택, OAuth 확장용)

OAuth 클라이언트 ID가 없더라도, 현재 구현은 **토큰 기반 fallback**으로 온보딩을 진행할 수 있습니다.

## 배포

이 프로젝트는 **저장소 루트 기준으로 Vercel 하나에 프론트와 API를 함께 배포**합니다.

- Root Directory: 비워 둠
- Build: `npm run vercel-build`
- API: `api/[...path].ts`

자세한 배포/테스트 절차는 [DEPLOY.md](./DEPLOY.md)를 참고하세요.

