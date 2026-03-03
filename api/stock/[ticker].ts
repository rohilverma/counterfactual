import type { VercelRequest, VercelResponse } from '@vercel/node'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { ticker } = req.query
  const startDate = req.query.start as string | undefined
  const endDate = req.query.end as string | undefined

  if (!ticker || typeof ticker !== 'string' || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing ticker, start, or end parameter' })
  }

  try {
    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
      events: 'div,splits',
    })

    const prices = result.quotes.map((quote) => ({
      date: quote.date.toISOString().split('T')[0],
      price: Math.round((quote.adjclose ?? quote.close ?? 0) * 100) / 100,
      high: Math.round((quote.high ?? 0) * 100) / 100,
    })).filter((p) => p.price > 0)

    const splits = (result.events?.splits || []).map((split: { date: Date; numerator: number; denominator: number }) => ({
      date: split.date.toISOString().split('T')[0],
      ticker,
      splitFactor: split.numerator / split.denominator,
    }))

    console.log(`[API] Yahoo Finance ${ticker}: ${prices.length} prices, ${splits.length} splits`)

    return res.status(200).json({ prices, splits })
  } catch (error) {
    console.error('Yahoo Finance error:', error)
    return res.status(500).json({ error: String(error) })
  }
}
