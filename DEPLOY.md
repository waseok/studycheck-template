# Studycheck Template — 학교 배포 가이드

학교 담당자가 **GitHub 템플릿 복제 → Vercel 배포 → `/setup`에서 DB·학교 정보 입력**만으로 연수관리 사이트를 만드는 방법입니다.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwaseok%2Fstudycheck-template&project-name=my-school-studycheck&repository-name=my-school-studycheck)

> **환경변수는 Vercel 배포 시 넣지 않아도 됩니다.**  
> 배포 후 `/setup` 첫 단계에서 Supabase URI와 Vercel 토큰을 입력하면 자동으로 등록됩니다.

---

## 전체 흐름 (약 10분)

```
1. GitHub 「Use this template」→ 학교 전용 저장소 생성
2. Supabase 새 프로젝트 생성
3. Vercel 「Deploy」 (환경변수 없이 배포 가능)
4. 배포 URL 접속 → /setup
   ① DATABASE_URL + Vercel Token 입력 → 자동 환경변수 적용
   ② 학교 이름·비밀번호·관리자 입력
5. 완료 → 로그인
```

---

## 1단계: GitHub 템플릿 복제

1. https://github.com/waseok/studycheck-template
2. **Use this template** → Create a new repository

---

## 2단계: Supabase 프로젝트 생성

1. https://supabase.com → **New project**
2. DB 비밀번호 설정 후 보관
3. **Connect** → **Session pooler** → URI 복사 (나중에 `/setup`에 붙여넣음)

> Direct connection 대신 **Session pooler**를 사용하세요.

---

## 3단계: Vercel 배포

1. 상단 **Deploy with Vercel** 버튼 클릭 (또는 Vercel에서 GitHub 저장소 import)
2. **Root Directory**: 비워 둠 (루트 배포)
3. **Environment Variables**: 비워 두고 Deploy 가능
4. 배포 완료 후 URL 확인 (예: `https://my-school-studycheck.vercel.app`)

---

## 4단계: `/setup` 마법사

### ① DB · 환경변수 (자동화)

| 입력 항목 | 설명 |
|-----------|------|
| **DATABASE_URL** | Supabase Session pooler URI |
| **JWT_SECRET** | 자동 생성됨 (그대로 사용 가능) |
| **Vercel Access Token** | [토큰 발급](https://vercel.com/account/settings/tokens) 후 붙여넣기 |

**「연결 및 적용」** 클릭 시:

- DB 연결 테스트 + 스키마 자동 반영
- Vercel 프로젝트에 `DATABASE_URL`, `JWT_SECRET` 자동 등록
- 재배포 시작 (1~2분 후 다음 단계로 자동 이동)

### ② 학교 정보 · 비밀번호 · 관리자

- 학교 이름, 로고(선택)
- 교직원 초기 비밀번호, 관리자 비밀번호
- 관리자 이름·이메일

---

## 로컬 개발 (개발자용)

```bash
cp .env.example backend/.env
# backend/.env 에 DATABASE_URL, JWT_SECRET 입력

cd backend && npm install && npm run db:push && npm run dev
# 다른 터미널
npm run dev:frontend
```

로컬에서는 `backend/.env`에 DB가 설정되어 있으면 `/setup`의 DB 단계가 생략됩니다.

---

## 문제 해결

### 「연결 및 적용」 실패

- DATABASE_URL이 Session pooler인지 확인
- 비밀번호 URL 인코딩 (`!` → `%21`)
- Vercel Token에 프로젝트 수정 권한이 있는지 확인

### 재배포 후에도 DB 단계가 반복됨

- 1~2분 더 기다린 후 새로고침
- Vercel → Settings → Environment Variables에 `DATABASE_URL`이 있는지 확인

### API 404

- Vercel Root Directory가 `frontend`로 되어 있지 않은지 확인

---

## 환경변수 (자동 vs 수동)

| 변수 | `/setup` 자동 | 수동 설정 |
|------|---------------|-----------|
| `DATABASE_URL` | ✅ | 가능 |
| `JWT_SECRET` | ✅ | 가능 |
| `NODE_ENV` | ✅ (`production`) | — |

수동으로 Vercel에 넣어도 되고, `/setup`에서 자동 등록해도 됩니다.
