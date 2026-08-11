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

/** 학교 저장소 동기화용 — vercel.json */
export function readTemplateVercelJson(): string {
  return readCwdFile('vercel.json')
}
