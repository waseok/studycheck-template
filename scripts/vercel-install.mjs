/**
 * Vercel Install — root/backend/frontend 의존성을 병렬 설치한다.
 * 순차 3회 npm install 보다 체감 시간이 짧다.
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function npmInstall(cwd, label) {
  return new Promise((resolve, reject) => {
    console.log(`[install] start ${label}`)
    const child = spawn(
      'npm',
      ['install', '--include=dev', '--no-audit', '--no-fund', '--prefer-offline'],
      {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          // Install 단계에서 production omit 방지
          NODE_ENV: 'development',
          npm_config_production: 'false',
        },
      }
    )
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[install] done ${label}`)
        resolve()
      } else {
        reject(new Error(`npm install failed (${label}) exit=${code}`))
      }
    })
  })
}

await Promise.all([
  npmInstall(root, 'root'),
  npmInstall(path.join(root, 'backend'), 'backend'),
  npmInstall(path.join(root, 'frontend'), 'frontend'),
])

console.log('[install] all packages ready')
