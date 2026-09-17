import { describe, it, expect, beforeAll } from 'vitest'
import { runApiSmoketest, SECTIONS } from '../../../scripts/api-smoketest.js'
import { loadManifest } from './manifest.js'

// #295. The api-smoketest asserts API SURFACE (status, content-type, envelope,
// latency) against a LIVE target — it indexes nothing and writes nothing, so
// unlike smoketest.test.js there are no captured fixtures to read. That means
// the target has to be up, and when it is not the suite skips rather than
// reporting a wall of red for an environment problem.
const instance = (process.env.instance || '').replace(/\/$/, '')
const manifest = loadManifest()
const host = new URL(manifest.origin).host

// Same liveness signal scripts/smoketest.js's preflight uses: /debug/identity,
// falling back to a real feed. A target that answers neither is down.
const isUp = async () => {
  if (!instance) return false
  try {
    const res = await fetch(`${instance}/debug/identity`)
    if (res.ok) return true
  } catch { /* fall through */ }
  try {
    const res = await fetch(`${instance}/get/pages/posted/rss?s=${host}&limit=1`)
    return res.ok
  } catch { return false }
}

// The full sweep issues hundreds of requests and the /get planner blowup makes
// some of them multi-second, so the suite gets a generous ceiling rather than
// a tight one; latency is asserted per-row through the budget, not by timeout.
const TIMEOUT = 30 * 60 * 1000

describe('api smoketest: live API surface', async () => {
  const up = await isUp()
  if (!up) {
    it.skip(`target ${instance || '(unset)'} is down — start the dev server or set \`instance\``, () => {})
    return
  }

  let report
  beforeAll(async () => {
    report = await runApiSmoketest({ instance, sections: SECTIONS, log: () => {} })
  }, TIMEOUT)

  it('records every section', () => {
    expect(Object.keys(report.summary).sort()).toEqual([...SECTIONS].sort())
  })

  it('has no erroring rows', () => {
    const errors = report.rows.filter((r) => r.result === 'error')
    expect(errors.map((r) => `${r.name} ${r.status} ${r.url} ${r.note}`)).toEqual([])
  })

  it('has no 5xx responses', () => {
    const fivexx = report.rows.filter((r) => r.status >= 500)
    expect(fivexx.map((r) => `${r.name} ${r.status} ${r.url}`)).toEqual([])
  })
}, TIMEOUT)
