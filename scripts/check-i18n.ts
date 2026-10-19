// Checks the English version is complete:
//   - every t('…') text in src/ has an English entry in src/lib/en/
//   - no t() is given a `…${x}…` template (use {name} and vars instead)
//   - every message the server (api/) and the database (supabase/migrations/)
//     send to people has an English entry
//   - no Turkish text is left outside t() in src/ (a rough check)
// Run: npx tsx scripts/check-i18n.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EN } from '../src/lib/en'

const root = new URL('..', import.meta.url).pathname
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name)
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]
  })

const problems: string[] = []
const used = new Set<string>()
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/

// Text inside quotes, without the quotes; handles \' and \".
const literal = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g

for (const file of walk('src').filter((f) => /\.tsx?$/.test(f) && !f.startsWith('src/lib/en'))) {
  const source = readFileSync(join(root, file), 'utf8')
  const lines = source.split('\n')
  for (const m of source.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const text = m[2].replace(/\\(['"`\\])/g, '$1')
    const line = source.slice(0, m.index).split('\n').length
    if (m[1] === '`' && text.includes('${')) problems.push(`${file}:${line} t() with a template: ${text}`)
    used.add(text)
    if (!(text in EN)) problems.push(`${file}:${line} no English for: ${text}`)
  }
  // Turkish outside t(): any quoted or JSX text with Turkish letters on a line
  // that has no t( and is not a comment.
  lines.forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, '')
    if (/^\s*(\*|\/\*)/.test(raw) || !TURKISH.test(code)) return
    if (/\bt\(/.test(code) || /i18n-ok/.test(raw)) return
    const quoted = [...code.matchAll(literal)].some((q) => TURKISH.test(q[2]))
    const jsx = />[^<>{}]*[çğıöşüÇĞİÖŞÜ][^<>{}]*</.test(code) || /^\s*[^\s<{}()=;:,'"`]*[çğıöşüÇĞİÖŞÜ][^<>{}=;]*$/.test(code)
    if (quoted || jsx) problems.push(`${file}:${i + 1} Turkish outside t(): ${raw.trim()}`)
  })
}

// Messages from the server and the database reach people through friendly(),
// which passes them through t().
const serverTexts = new Set<string>()
for (const file of walk('api').filter((f) => f.endsWith('.ts'))) {
  const source = readFileSync(join(root, file), 'utf8')
  for (const m of source.matchAll(literal)) if (TURKISH.test(m[2]) && !m[2].includes('${')) serverTexts.add(m[2])
}
const migrations = walk('supabase/migrations').sort()
const latest = new Map<string, string>()
for (const file of migrations) {
  // Only messages in functions still in use: the newest definition of each function counts.
  const source = readFileSync(join(root, file), 'utf8')
  for (const fn of source.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\n\$\$;/g)) latest.set(fn[1], fn[0])
}
for (const body of latest.values())
  for (const m of body.matchAll(/raise exception '((?:''|[^'])*)'/g)) serverTexts.add(m[1].replace(/''/g, "'"))
for (const text of serverTexts) if (!(text in EN)) problems.push(`server/database message has no English: ${text}`)

if (problems.length) {
  console.log(problems.join('\n'))
  console.log(`\n${problems.length} PROBLEM(S) IN THE ENGLISH VERSION`)
  process.exit(1)
}
console.log(`ALL ${used.size + serverTexts.size} TEXTS HAVE ENGLISH (i18n check PASSED)`)
