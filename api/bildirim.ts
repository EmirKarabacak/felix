import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleBildirim } from './_lib/bildirim.js'
import { run } from './_lib/core.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const reply = await run(handleBildirim, {
    method: req.method ?? 'GET',
    body: req.body,
    authorization: req.headers.authorization,
  })
  res.status(reply.status).json(reply.body)
}
