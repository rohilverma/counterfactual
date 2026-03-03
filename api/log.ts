import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const data = req.body
    console.log(`[PERF] ${data.name}: ${data.duration}ms`)
    return res.status(200).send('OK')
  } catch {
    return res.status(400).send('Invalid JSON')
  }
}
