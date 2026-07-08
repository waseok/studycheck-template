# Studycheck Template — 학교 연수관리 플랫폼

학교별로 **GitHub 템플릿 복제 → Vercel 배포 → `/setup`** 만으로 운영할 수 있는 연수관리 플랫폼 템플릿입니다.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwaseok%2Fstudycheck-template&project-name=my-school-studycheck)

**학교 담당자용 배포 가이드:** [DEPLOY.md](./DEPLOY.md)

---

## 프로젝트 구조

```
.
├── api/               # Vercel Serverless API 진입점
├── frontend/          # React + Vite 프론트엔드
├── backend/           # Express API + Prisma
├── vercel.json        # Vercel 단일 배포 설정 (루트)
└── DEPLOY.md          # 학교 배포 가이드
```

## 기술 스택

- **프론트엔드**: React + TypeScript + Vite + Tailwind CSS
- **백엔드**: Node.js + Express + TypeScript
- **데이터베이스**: PostgreSQL + Prisma
- **이메일**: Nodemailer

## 설치 및 실행

### 사전 요구사항

- Node.js 18.x 이상
- PostgreSQL 14.x 이상 (또는 클라우드 데이터베이스)

### 설치

```bash
# 프론트엔드 의존성 설치
cd frontend
npm install

# 백엔드 의존성 설치
cd ../backend
npm install
```

### 환경 변수 설정

백엔드 `.env` 파일 생성:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/training_platform"
JWT_SECRET="your-secret-key"
SCHOOL_PASSWORD="school-common-password"
ADMIN_PASSWORD="admin-password"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

프론트엔드 `.env` 파일 생성:

```env
VITE_API_URL=http://localhost:3000
```

### 실행

```bash
# 백엔드 실행 (포트 3000)
cd backend
npm run dev

# 프론트엔드 실행 (포트 5173)
cd frontend
npm run dev
```

## 기능

1. **교직원 관리** - 교직원 정보 등록 및 관리
2. **연수 관리** - 연수 정보 등록 및 대상자 자동 매칭
3. **연수 취합** - 이수번호 입력 및 취합
4. **통계** - 이수 현황 통계 및 대시보드
5. **자동 리마인더** - 이메일 자동 발송

## 배포

- 프론트엔드: Vercel
- 백엔드: Railway 또는 Render

자세한 내용은 `PROJECT_PLAN.md`를 참고하세요.

