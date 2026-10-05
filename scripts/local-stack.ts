// A stand-in for Supabase, for testing Felix on a machine that cannot reach the
// real service. It speaks just enough of Supabase's auth and data APIs for the
// app, and runs every data request against a real Postgres with the real
// migrations, as the caller's role, so the access rules are genuinely enforced.
// It also serves Felix's own /api endpoints. Never use it in production.
//
//   PGURL=postgres://postgres@127.0.0.1:54329/postgres npx tsx scripts/local-stack.ts

import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.STACK_PORT ?? 54321)
const SECRET = 'local-test-secret'
const pool = new pg.Pool({ connectionString: process.env.PGURL })
pg.types.setTypeParser(1082, (v) => v) // dates as plain 'YYYY-MM-DD' text, as Supabase returns them
pool.on('error', () => {}) // the database may be restarted between test runs

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url')
function sign(claims: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify(claims))
  const mac = createHmac('sha256', SECRET).update(`${head}.${body}`).digest()
  return `${head}.${body}.${b64(mac)}`
}
function verify(token: string): Record<string, any> | null {
  const [head, body, mac] = token.split('.')
  if (!head || !body || !mac) return null
  const expected = b64(createHmac('sha256', SECRET).update(`${head}.${body}`).digest())
  if (expected !== mac) return null
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims
}

const far = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600
export const ANON_KEY = sign({ role: 'anon', exp: far })
export const SERVICE_KEY = sign({ role: 'service_role', exp: far })

process.env.SUPABASE_URL = `http://127.0.0.1:${PORT}`
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
process.env.FELIX_SETUP_CODE ??= 'kurulum'
const { handleSetup, handleUsers, run } = await import('../api/_lib/core.js')

type Json = Record<string, any>
const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
}

async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : {}
}

function claimsOf(req: IncomingMessage): Record<string, any> {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : String(req.headers.apikey ?? '')
  return verify(token) ?? { role: 'anon' }
}

const userJson = (u: Json) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
})

function sessionFor(u: Json) {
  const expires_at = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: sign({ sub: u.id, role: 'authenticated', email: u.email, exp: expires_at }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at,
    refresh_token: sign({ sub: u.id, kind: 'refresh', exp: far }),
    user: userJson(u),
  }
}

async function auth(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  const claims = claimsOf(req)
  const body = req.method === 'GET' ? {} : await readBody(req)
  const isAdmin = claims.role === 'service_role'

  if (path === '/token' && query.get('grant_type') === 'password') {
    const { rows } = await pool.query('select * from auth.users where email = $1', [String(body.email).toLowerCase()])
    const u = rows[0]
    if (!u || u.password !== body.password) {
      return send(res, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }
    if (u.banned) return send(res, 400, { code: 'user_banned', error_code: 'user_banned', msg: 'User is banned' })
    return send(res, 200, sessionFor(u))
  }
  if (path === '/token' && query.get('grant_type') === 'refresh_token') {
    const c = verify(String(body.refresh_token))
    const { rows } = c ? await pool.query('select * from auth.users where id = $1 and not banned', [c.sub]) : { rows: [] }
    if (!rows[0]) return send(res, 400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
    return send(res, 200, sessionFor(rows[0]))
  }
  if (path === '/logout') return send(res, 204)

  if (path === '/user') {
    if (!claims.sub) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' })
    if (req.method === 'PUT' && typeof body.password === 'string') {
      if (body.password.length < 6) return send(res, 422, { code: 'weak_password', msg: 'Password should be at least 6 characters.' })
      await pool.query('update auth.users set password = $2 where id = $1', [claims.sub, body.password])
    }
    const { rows } = await pool.query('select * from auth.users where id = $1', [claims.sub])
    if (!rows[0]) return send(res, 404, { code: 'user_not_found', msg: 'User not found' })
    return send(res, 200, userJson(rows[0]))
  }

  const admin = path.match(/^\/admin\/users(?:\/([0-9a-f-]+))?$/)
  if (admin) {
    if (!isAdmin) return send(res, 403, { code: 'not_admin', msg: 'User not allowed' })
    const id = admin[1]
    if (!id && req.method === 'POST') {
      const email = String(body.email).toLowerCase()
      const dup = await pool.query('select 1 from auth.users where email = $1', [email])
      if (dup.rowCount) return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' })
      const newId = randomUUID()
      await pool.query('insert into auth.users (id, email, password) values ($1, $2, $3)', [newId, email, body.password])
      return send(res, 200, userJson({ id: newId, email }))
    }
    if (id && req.method === 'PUT') {
      if (typeof body.password === 'string') await pool.query('update auth.users set password = $2 where id = $1', [id, body.password])
      if (typeof body.email === 'string') await pool.query('update auth.users set email = $2 where id = $1', [id, body.email.toLowerCase()])
      if (typeof body.ban_duration === 'string') await pool.query('update auth.users set banned = $2 where id = $1', [id, body.ban_duration !== 'none'])
      const { rows } = await pool.query('select * from auth.users where id = $1', [id])
      if (!rows[0]) return send(res, 404, { code: 'user_not_found', msg: 'User not found' })
      return send(res, 200, userJson(rows[0]))
    }
    if (id && req.method === 'DELETE') {
      await pool.query('delete from auth.users where id = $1', [id])
      return send(res, 200, {})
    }
  }
  send(res, 404, { msg: `local stack: unsupported auth call ${req.method} ${path}` })
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad identifier: ${name}`)
  return `"${name}"`
}

/** Runs one statement as the caller's role with their claims, like PostgREST does. */
async function asCaller<T>(claims: Record<string, any>, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`set local role ${ident(['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon')}`)
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const out = await work(client)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}

function whereClause(query: URLSearchParams, params: unknown[]): string {
  const parts: string[] = []
  for (const [key, raw] of query) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue
    const dot = raw.indexOf('.')
    const op = raw.slice(0, dot)
    const value = raw.slice(dot + 1)
    if (op === 'eq') {
      params.push(value)
      parts.push(`${ident(key)}::text = $${params.length}`)
    } else if (op === 'is' && value === 'null') {
      parts.push(`${ident(key)} is null`)
    } else if (op === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',').filter(Boolean)
      params.push(list)
      parts.push(`${ident(key)}::text = any($${params.length})`)
    } else {
      throw new Error(`local stack: unsupported filter ${key}=${raw}`)
    }
  }
  return parts.length ? ` where ${parts.join(' and ')}` : ''
}

async function rest(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  const claims = claimsOf(req)
  const prefer = String(req.headers.prefer ?? '')
  try {
    const rpc = path.match(/^\/rpc\/([a-z_]+)$/)
    if (rpc) {
      const args = req.method === 'POST' ? await readBody(req) : {}
      const names = Object.keys(args)
      const call = names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')
      const { rows } = await asCaller(claims, (c) =>
        c.query(`select public.${ident(rpc[1])}(${call}) as result`, names.map((n) => args[n])),
      )
      return send(res, 200, rows[0].result)
    }
    const table = `public.${ident(path.slice(1))}`
    const params: unknown[] = []

    if (req.method === 'GET' || req.method === 'HEAD') {
      const cols = (query.get('select') ?? '*').split(',').map((c) => (c.trim() === '*' ? '*' : ident(c.trim()))).join(', ')
      const order = (query.get('order') ?? '')
        .split(',')
        .filter(Boolean)
        .map((o) => {
          const [col, dir] = o.split('.')
          return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`
        })
        .join(', ')
      const sql = `select ${cols} from ${table}${whereClause(query, params)}${order ? ` order by ${order}` : ''}`
      const { rows } = await asCaller(claims, (c) => c.query(sql, params))
      const range = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' }
      if (req.method === 'HEAD') return send(res, 200, undefined, range)
      if (String(req.headers.accept ?? '').includes('vnd.pgrst.object')) {
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
        return send(res, 200, rows[0], range)
      }
      return send(res, 200, rows, range)
    }

    const body = await readBody(req)
    let sql = ''
    if (req.method === 'POST') {
      const list: Json[] = Array.isArray(body) ? body : [body]
      const keys = Object.keys(list[0] ?? {})
      const tuples = list.map((row) => `(${keys.map((k) => { params.push(row[k]); return `$${params.length}` }).join(', ')})`)
      sql = `insert into ${table} (${keys.map(ident).join(', ')}) values ${tuples.join(', ')}`
    } else if (req.method === 'PATCH') {
      const keys = Object.keys(body)
      keys.forEach((k) => params.push(body[k]))
      sql = `update ${table} set ${keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ')}${whereClause(query, params)}`
    } else if (req.method === 'DELETE') {
      sql = `delete from ${table}${whereClause(query, params)}`
    } else {
      return send(res, 405, { message: 'method not allowed' })
    }
    const wantRows = prefer.includes('return=representation')
    const { rows } = await asCaller(claims, (c) => c.query(sql + (wantRows ? ' returning *' : ''), params))
    const one = String(req.headers.accept ?? '').includes('vnd.pgrst.object')
    return send(res, req.method === 'POST' ? 201 : wantRows ? 200 : 204, wantRows ? (one ? rows[0] : rows) : undefined)
  } catch (e: any) {
    const status = e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400
    send(res, status, { code: e.code ?? 'XX000', message: e.message, details: e.detail ?? null, hint: null })
  }
}

createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204)
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url.pathname.slice(8), url.searchParams)
    if (url.pathname.startsWith('/rest/v1')) return await rest(req, res, url.pathname.slice(8), url.searchParams)
    if (url.pathname === '/api/setup' || url.pathname === '/api/users') {
      const reply = await run(url.pathname === '/api/setup' ? handleSetup : handleUsers, {
        method: req.method ?? 'GET',
        body: await readBody(req),
        authorization: req.headers.authorization,
      })
      return send(res, reply.status, reply.body)
    }
    send(res, 404, { message: `local stack: no route for ${url.pathname}` })
  } catch (e: any) {
    send(res, 500, { message: e.message })
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`local stack on http://127.0.0.1:${PORT}`)
  console.log(`ANON_KEY=${ANON_KEY}`)
})
