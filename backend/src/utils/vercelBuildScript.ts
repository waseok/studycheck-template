import fs from 'fs'
import path from 'path'

/**
 * 템플릿(현재 배포)의 scripts/vercel-build.mjs 내용을 읽습니다.
 * onboarding-router 함수 includeFiles 에 scripts/vercel-build.mjs 가 포함되어야 합니다.
 */
export function readTemplateVercelBuildScript(): string {
  const candidate = path.join(process.cwd(), 'scripts', 'vercel-build.mjs')
  if (!fs.existsSync(candidate)) {
    throw new Error(
      '템플릿 scripts/vercel-build.mjs 를 찾을 수 없습니다. Vercel 함수 includeFiles 설정을 확인하세요.'
    )
  }
  return fs.readFileSync(candidate, 'utf8')
}

function readCwdFile(...parts: string[]): string {
  const candidate = path.join(process.cwd(), ...parts)
  if (!fs.existsSync(candidate)) {
    throw new Error(`템플릿 파일 ${parts.join('/')} 를 찾을 수 없습니다.`)
  }
  return fs.readFileSync(candidate, 'utf8')
}

/** 학교 저장소 동기화용 — Express API 진입점 */
export function readTemplateApiIndex(): string {
  return readCwdFile('api', 'index.ts')
}

/**
 * 학교 사이트용 vercel.json
 * - 온보딩 라우터(api/onboarding-router.ts)는 학교 저장소에 없을 수 있음
 * - functions에 없는 파일을 적으면 Vercel 배포가 unmatched-function-pattern 으로 실패함
 */
export function readSchoolVercelJson(): string {
  return `${JSON.stringify(
    {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      version: 2,
      buildCommand: 'npm run vercel-build',
      outputDirectory: 'frontend/dist',
      installCommand:
        'npm install && cd backend && npm install --include=dev && cd ../frontend && npm install --include=dev',
      framework: null,
      rewrites: [
        {
          source: '/api/(.*)',
          destination: '/api',
        },
        {
          source: '/((?!api/).*)',
          destination: '/index.html',
        },
      ],
      functions: {
        'api/index.ts': {
          maxDuration: 60,
          includeFiles:
            '{backend/prisma/**,backend/node_modules/.prisma/**,backend/node_modules/@prisma/client/**}',
        },
      },
    },
    null,
    2
  )}\n`
}

/** @deprecated 학교 동기화에는 readSchoolVercelJson 을 사용하세요 */
export function readTemplateVercelJson(): string {
  return readSchoolVercelJson()
}
