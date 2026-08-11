import { spawn, spawnSync } from 'child_process'
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

function runAsync(cmd, args, cwd, label) {
  return new Promise((resolve, reject) => {
    console.log(`[build] start ${label}`)
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[build] done ${label}`)
        resolve()
      } else {
        reject(new Error(`${label} failed (exit ${code})`))
      }
    })
  })
}

const prismaEntry = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js')

function runPrisma(args) {
  run(process.execPath, [prismaEntry, ...args], backendDir)
}

// 1) Prisma client 1회만 생성 (backend build 에서 재실행하지 않음)
runPrisma(['generate'])

// 2) 온보딩용 init.sql 최신화
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
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL detected — skip db push during build (schema is applied at onboarding provision)')
} else {
  console.log('DATABASE_URL not set — skip db push')
}

// 3) backend(tsc) + frontend(vite) 병렬 빌드
//    - frontend 배포 빌드는 vite만 (tsc는 로컬 typecheck)
//    - backend generate는 위에서 이미 수행
try {
  await Promise.all([
    runAsync('npx', ['tsc'], backendDir, 'backend tsc'),
    runAsync('npx', ['vite', 'build'], frontendDir, 'frontend vite'),
  ])
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
