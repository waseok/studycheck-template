# Studycheck Template — 온보딩 배포 가이드

이 템플릿의 목적은 학교가 GitHub/Vercel/Supabase를 **각자 자기 계정으로 연결**해도,  
복제부터 첫 배포까지 한 흐름으로 이어지게 만드는 것입니다.

## 전체 흐름

```text
1. 온보딩 사이트 배포
2. /onboarding 접속
3. GitHub 토큰으로 새 저장소 생성
4. Vercel 토큰으로 새 프로젝트 생성
5. Supabase 연결 또는 생성
6. DATABASE_URL / JWT_SECRET 자동 주입
7. 재배포 후 /setup에서 학교 정보 입력
```

## 1. Vercel에 온보딩 사이트 배포

1. 이 저장소를 Vercel에 새 프로젝트로 연결
2. **Root Directory는 비워 둠**
3. 배포 시 환경변수는 없어도 됨

이 단계의 목적은 `학교별 사이트`를 만드는 것이 아니라,  
**복제/연결을 도와주는 온보딩 앱**을 먼저 띄우는 것입니다.

## 2. `/onboarding`에서 하는 일

### GitHub
- GitHub 토큰으로 템플릿 저장소를 새 저장소로 복제
- 저장소 이름, 공개/비공개 선택

필요 권한:
- repo

### Vercel
- Vercel 토큰으로 프로젝트 생성
- GitHub 저장소를 새 프로젝트에 연결

필요 권한:
- 프로젝트 생성
- 환경변수 수정
- 재배포

### Supabase
두 방식 중 하나:

1. **기존 프로젝트 연결**
   - Session pooler `DATABASE_URL` 입력
2. **관리 토큰으로 프로젝트 생성 후 연결**
   - 조직 선택
   - 프로젝트명/리전/DB 비밀번호 입력
   - 생성 후 Session pooler URI는 Connect 화면에서 확인

## 3. `/onboarding` 마지막 단계

`Vercel 환경변수 주입 + 재배포` 버튼을 누르면:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`

이 자동 등록되고, 재배포가 시작됩니다.

## 4. `/setup`

인프라 연결이 끝나면 `/setup`은 학교 정보만 받습니다.

- 학교 이름
- 학교 로고 URL
- 교직원 초기 비밀번호
- 관리자 비밀번호
- 관리자 이름
- 관리자 이메일

## 토큰 사용 방식

현재 구현은 **OAuth가 설정되어 있으면 확장 가능**,  
기본 동작은 **토큰 기반 fallback**입니다.

즉, 지금 바로 테스트할 때는 아래 세 가지 중 필요한 것만 넣으면 됩니다.

- GitHub Personal Access Token
- Vercel Token
- Supabase Management Token (선택)

토큰은 브라우저의 온보딩 세션에만 임시 보관되며, 장기 저장을 전제로 하지 않습니다.

## 실제 테스트 추천 순서

1. 본인 GitHub 계정에서 새 저장소가 생성되는지 확인
2. 본인 Vercel 계정에서 새 프로젝트가 생성되는지 확인
3. 본인 Supabase 프로젝트의 Session pooler URI로 연결되는지 확인
4. 재배포 후 `/setup`으로 넘어가는지 확인
5. 학교 정보 입력 후 로그인까지 확인

## 문제 해결

### `/onboarding` 대신 계속 `로딩 중...`
- 최신 배포인지 확인
- Vercel Runtime 로그에서 `/api/settings/status` 확인
- Root Directory가 `frontend`가 아닌지 확인

### GitHub 저장소 생성 실패
- GitHub 토큰에 `repo` 권한이 있는지 확인
- 이미 같은 이름의 저장소가 있는지 확인

### Vercel 프로젝트 생성 실패
- Vercel 토큰 권한 확인
- Vercel 계정이 GitHub 저장소 import 가능한 상태인지 확인

### Supabase 연결 실패
- Direct connection이 아니라 **Session pooler** URI인지 확인
- 비밀번호 URL 인코딩 확인 (`!` → `%21`)

### 재배포 후에도 `/setup`으로 안 넘어감
- Vercel 환경변수에 `DATABASE_URL`, `JWT_SECRET`가 들어갔는지 확인
- 재배포가 완료될 때까지 1~2분 기다린 뒤 새로고침
