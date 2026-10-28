import type { VercelRequest, VercelResponse } from '@vercel/node'
import { run } from './_lib/core.js'
import { handleRapor } from './_lib/rapor.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const reply = await run(handleRapor, {
    method: req.method ?? 'GET',
    body: req.body,
    authorization: req.headers.authorization,
  })
  res.status(reply.status).json(reply.body)
}
