import http from 'http'
import https from 'https'

const BASE_URL = process.env.BENCHMARK_BASE_URL || 'http://localhost:3000'
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10)
const DURATION_SECONDS = parseInt(process.env.DURATION || '10', 10)

const TARGET_PATHS = [
  '/',
  '/curriculum',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/api/testimonials',
  '/api/search-index',
]

interface ResultStats {
  totalRequests: number
  successCount: number
  errorCount: number
  latencies: number[]
}

function makeRequest(urlStr: string): Promise<{ statusCode: number; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const isHttps = urlStr.startsWith('https')
    const transport = isHttps ? https : http

    const req = transport.get(urlStr, (res) => {
      res.on('data', () => {}) // Consume response body
      res.on('end', () => {
        const durationMs = Date.now() - start
        resolve({ statusCode: res.statusCode || 500, durationMs })
      })
    })

    req.on('error', () => {
      const durationMs = Date.now() - start
      resolve({ statusCode: 500, durationMs })
    })

    req.setTimeout(10000, () => {
      req.destroy()
      const durationMs = Date.now() - start
      resolve({ statusCode: 504, durationMs })
    })
  })
}

async function runWorker(stats: ResultStats, stopTime: number) {
  let pathIndex = 0
  while (Date.now() < stopTime) {
    const path = TARGET_PATHS[pathIndex % TARGET_PATHS.length]
    pathIndex++
    const targetUrl = `${BASE_URL}${path}`

    const { statusCode, durationMs } = await makeRequest(targetUrl)
    stats.totalRequests++
    stats.latencies.push(durationMs)

    if (statusCode >= 200 && statusCode < 400) {
      stats.successCount++
    } else {
      stats.errorCount++
    }
  }
}

async function runBenchmark() {
  console.log(`\n🚀 Starting 50 Concurrent Virtual Users Concurrency Benchmark...`)
  console.log(`   Base URL: ${BASE_URL}`)
  console.log(`   Concurrency Workers: ${CONCURRENCY}`)
  console.log(`   Duration: ${DURATION_SECONDS} seconds`)
  console.log(`   Target Paths (${TARGET_PATHS.length}): ${TARGET_PATHS.join(', ')}\n`)

  const stats: ResultStats = {
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    latencies: [],
  }

  const stopTime = Date.now() + DURATION_SECONDS * 1000
  const workers: Promise<void>[] = []

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(runWorker(stats, stopTime))
  }

  await Promise.all(workers)

  const sortedLatencies = stats.latencies.sort((a, b) => a - b)
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0
  const rps = (stats.totalRequests / DURATION_SECONDS).toFixed(2)
  const errorRate = ((stats.errorCount / Math.max(1, stats.totalRequests)) * 100).toFixed(2)

  console.log(`📊 Concurrency Benchmark Results (~${CONCURRENCY} Virtual Users):`)
  console.log(`   Total Requests: ${stats.totalRequests}`)
  console.log(`   Successful (2xx/3xx): ${stats.successCount}`)
  console.log(`   Failed (4xx/5xx): ${stats.errorCount} (${errorRate}%)`)
  console.log(`   Requests / sec: ${rps} req/s`)
  console.log(`   Latency P50: ${p50} ms`)
  console.log(`   Latency P95: ${p95} ms`)
  console.log(`   Latency P99: ${p99} ms\n`)
}

void runBenchmark()
