import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import YahooFinance from 'yahoo-finance2'
import { Logger } from 'tslog'
import { appendFileSync } from 'fs'

const LOG_FILE = './perf.log'

const logger = new Logger({ name: 'counterfactual' })

function logToFile(message: string) {
  const line = `${new Date().toISOString()} ${message}\n`
  appendFileSync(LOG_FILE, line)
  logger.info(message)
}

const yahooFinance = new YahooFinance()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'perf-logging-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/log' || req.method !== 'POST') {
            return next()
          }

          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              logToFile(`[PERF] ${data.name}: ${data.duration}ms`)
              res.statusCode = 200
              res.end('OK')
            } catch {
              res.statusCode = 400
              res.end('Invalid JSON')
            }
          })
        })
      },
    },
    {
      name: 'yahoo-finance-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/stock/')) {
            return next()
          }

          const startTime = performance.now()

          try {
            const urlParts = req.url.split('/')
            const ticker = urlParts[3]?.split('?')[0]
            const url = new URL(req.url, 'http://localhost')
            const startDate = url.searchParams.get('start')
            const endDate = url.searchParams.get('end')

            if (!ticker || !startDate || !endDate) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing ticker, start, or end parameter' }))
              return
            }

            const apiStart = performance.now()
            const result = await yahooFinance.chart(ticker, {
              period1: startDate,
              period2: endDate,
              interval: '1d',
              events: 'div,splits',
            })
            const apiDuration = performance.now() - apiStart
            logToFile(`[API] Yahoo Finance ${ticker}: ${apiDuration.toFixed(2)}ms`)

            const prices = result.quotes.map((quote) => ({
              date: quote.date.toISOString().split('T')[0],
              price: Math.round((quote.adjclose ?? quote.close ?? 0) * 100) / 100,
              high: Math.round((quote.high ?? 0) * 100) / 100,
            })).filter((p) => p.price > 0)

            // Extract split events
            const splits = (result.events?.splits || []).map((split: { date: Date; numerator: number; denominator: number }) => ({
              date: split.date.toISOString().split('T')[0],
              ticker,
              splitFactor: split.numerator / split.denominator,
            }))

            const totalDuration = performance.now() - startTime
            logToFile(`[API] Total ${ticker} handler: ${totalDuration.toFixed(2)}ms (${prices.length} prices, ${splits.length} splits)`)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ prices, splits }))
          } catch (error) {
            console.error('Yahoo Finance error:', error)
            logToFile(`[ERROR] Yahoo Finance: ${String(error)}`)
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(error) }))
          }
        })
      },
    },
  ],
})
