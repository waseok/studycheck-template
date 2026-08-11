import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = path.join(root, 'backend')
const frontendDir = path.join(root, 'frontend')

function run(cmd, args, cwd, options = {}) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runNpm(script, cwd) {
  run('npm', ['run', script], cwd, { shell: process.platform === 'win32' })
}

const prismaEntry = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js')

function runPrisma(args) {
  run(process.execPath, [prismaEntry, ...args], backendDir)
}

runPrisma(['generate'])

// 온보딩 서버리스 함수는 Prisma CLI 없이 prisma/init.sql로 새 DB 스키마를 적용한다.
// (backend/src/utils/dbBootstrap.ts — CREATE만 수행, 기존 테이블/데이터 유지)
// 빌드마다 schema.prisma 기준으로 init.sql을 최신화한다.
const initSqlResult = spawnSync(
  process.execPath,
  [prismaEntry, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: backendDir, encoding: 'utf-8' }
)
if (initSqlResult.status !== 0) {
  console.error(initSqlResult.stderr || initSqlResult.stdout || 'prisma migrate diff failed')
  process.exit(initSqlResult.status ?? 1)
}
fs.writeFileSync(path.join(backendDir, 'prisma', 'init.sql'), initSqlResult.stdout)
console.log('backend/prisma/init.sql updated from schema.prisma')

// 중요: 여기서 prisma db push 를 하지 않는다.
// 학교용 프로젝트가 기존 Supabase(다른 앱 테이블 포함)를 쓰면
// db push가 rankings 등 미사용 테이블을 삭제하려 하며 --accept-data-loss 없이 실패한다.
// 스키마 적용은 온보딩 4단계 pushDatabaseSchema(init.sql)에서만 수행한다.
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL detected — skip db push during build (schema is applied at onboarding provision)')
} else {
  console.log('DATABASE_URL not set — skip db push')
}

runNpm('build', backendDir)
runNpm('build', frontendDir)
