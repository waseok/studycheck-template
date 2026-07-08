import { spawnSync } from 'child_process'
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

function runPrisma(args) {
  const prismaEntry = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js')
  run(process.execPath, [prismaEntry, ...args], backendDir)
}

runPrisma(['generate'])

if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL detected — applying Prisma schema...')
  runPrisma(['db', 'push'])
} else {
  console.log('DATABASE_URL not set — skip db push (첫 /setup에서 DB 연결)')
}

runNpm('build', backendDir)
runNpm('build', frontendDir)
