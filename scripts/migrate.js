// SQL migration runner — uses Supabase Management API (no Docker needed)
// Usage: npm run migrate
// Add new .sql files to supabase/migrations/ and run to apply them.

import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

// Extract project ref from VITE_SUPABASE_URL in .env
async function getProjectRef() {
  const env = await readFile(join(__dirname, '..', '.env'), 'utf-8')
  const match = env.match(/VITE_SUPABASE_URL=https:\/\/([^.]+)\.supabase\.co/)
  if (!match) throw new Error('VITE_SUPABASE_URL not found in .env')
  return match[1]
}

// Read access token from .env (SUPABASE_ACCESS_TOKEN) or CLI login file
async function getAccessToken() {
  // 1. .env 파일에서 읽기
  try {
    const env = await readFile(join(__dirname, '..', '.env'), 'utf-8')
    const match = env.match(/SUPABASE_ACCESS_TOKEN=(.+)/)
    if (match) return match[1].trim()
  } catch { /* continue */ }

  // 2. supabase CLI 로그인 파일에서 읽기
  const candidates = [
    join(homedir(), 'AppData', 'Roaming', 'supabase', 'access-token'),
    join(homedir(), '.config', 'supabase', 'access-token'),
    join(homedir(), 'AppData', 'Local', 'supabase', 'access-token'),
  ]
  for (const p of candidates) {
    try {
      return (await readFile(p, 'utf-8')).trim()
    } catch { /* try next */ }
  }

  throw new Error(
    '.env에 SUPABASE_ACCESS_TOKEN이 없습니다.\n' +
    '→ https://supabase.com/dashboard/account/tokens 에서 토큰 발급 후\n' +
    '  .env에 SUPABASE_ACCESS_TOKEN=sbp_xxx 추가해주세요.'
  )
}

async function runSQL(token, projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SQL failed (${res.status}): ${body}`)
  }
  return res.json()
}

async function migrate() {
  const [token, projectRef] = await Promise.all([getAccessToken(), getProjectRef()])

  // Ensure tracking table exists
  await runSQL(token, projectRef, `
    CREATE TABLE IF NOT EXISTS _migration_history (
      id        SERIAL PRIMARY KEY,
      filename  TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Get already-applied migrations
  const rows = await runSQL(token, projectRef, 'SELECT filename FROM _migration_history ORDER BY filename')
  const applied = new Set(rows.map(r => r.filename))

  // Read migration files in alphabetical order
  let files
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort()
  } catch {
    console.log('supabase/migrations/ 폴더가 없습니다. SQL 파일을 추가해주세요.')
    return
  }

  if (files.length === 0) {
    console.log('마이그레이션 파일이 없습니다.')
    return
  }

  let count = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  ${file} (이미 적용됨)`)
      continue
    }

    let sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8')
    // Management API handles transactions automatically — strip manual transaction markers
    sql = sql.replace(/^\s*BEGIN\s*;/gim, '').replace(/^\s*COMMIT\s*;/gim, '')
    process.stdout.write(`▶  ${file} 적용 중... `)

    await runSQL(token, projectRef, sql)
    await runSQL(token, projectRef,
      `INSERT INTO _migration_history (filename) VALUES ('${file.replace(/'/g, "''")}')`)

    console.log('✓')
    count++
  }

  if (count === 0) {
    console.log('\n✓ 모든 마이그레이션이 최신 상태입니다.')
  } else {
    console.log(`\n✓ ${count}개 마이그레이션 완료`)
  }
}

migrate().catch(err => {
  console.error('\n오류:', err.message)
  process.exit(1)
})
