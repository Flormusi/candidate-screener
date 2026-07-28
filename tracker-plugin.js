// Vite plugin: appends candidate rows to the CQL tracker Excel
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const TRACKER_PATH = '/Users/mariaflorenciamusitani/Desktop/Formaciones profesionales/recruiting tools /Copy of Candidate Tracker - CQL.xlsx'
const SHEET_NAME = 'Candidates'

function getWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7)
}

function mapStage(verdict) {
  if (verdict === 'Pass') return '1. RS- Submitted'
  if (verdict === 'Flag for Review') return '0. Approved'
  return '0. Rejected'
}

function splitName(fullName = '') {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return [parts[0], '']
  return [parts[0], parts.slice(1).join(' ')]
}

function appendToTracker(candidate) {
  if (!fs.existsSync(TRACKER_PATH)) {
    return { ok: false, error: 'Tracker file not found at: ' + TRACKER_PATH }
  }

  try {
    const wb = XLSX.readFile(TRACKER_PATH)
    const ws = wb.Sheets[SHEET_NAME]
    if (!ws) return { ok: false, error: `Sheet "${SHEET_NAME}" not found` }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    // Find last data row
    let lastRow = rows.length
    while (lastRow > 1 && rows[lastRow - 1].every(c => c === null || c === undefined || c === '')) {
      lastRow--
    }

    const rowNum = lastRow - 1 // exclude header, 1-indexed
    const [firstName, lastName] = splitName(candidate.name)
    const today = new Date()
    const dateSerial = (today - new Date(1899, 11, 30)) / 86400000 // Excel date serial

    // Build row matching Candidates sheet columns (28 cols)
    const newRow = [
      rowNum + 1,               // col A: row number
      getWeekNumber(),          // col B: Week
      firstName,                // col C: First name
      lastName,                 // col D: Last name
      candidate.location || '', // col E: Location
      '',                       // col F: Company
      '',                       // col G: Portfolio
      '',                       // col H: URL
      '',                       // col I: Email
      candidate.role || '',     // col J: Position
      'App Screening',          // col K: Source
      mapStage(candidate.verdict), // col L: Stage
      '',                       // col M: Not interested Reason
      candidate.yoe || '',      // col N: YoE
      '',                       // col O: Annual Comp / USD
      '',                       // col P: Annual Comp / CAD
      dateSerial,               // col Q: Recruiter Screen (today)
      candidate.verdict === 'Pass' ? dateSerial : '', // col R: Submitted to HM
      '',                       // col S: Preliminary Phone Screen
      '',                       // col T: Technical Screen
      '',                       // col U: Take Home Project
      '',                       // col V: Cultural Interview
      '',                       // col W: Offer Letter Sent
      '',                       // col X: OL Signed
      candidate.rejection || '', // col Y: Feedback (Rejection)
      candidate.comments || '', // col Z: Comments
      'Y',                      // col AA: ATS
      candidate.verdict === 'Flag for Review' ? 'FLAG' : '', // col AB: Tag
    ]

    // Append row
    XLSX.utils.sheet_add_aoa(ws, [newRow], { origin: lastRow })

    // Format date columns as dates
    const dateStyle = { numFmt: 'dd/mm/yyyy' }
    for (const col of ['Q', 'R']) {
      const cellRef = `${col}${lastRow + 1}`
      if (ws[cellRef] && ws[cellRef].v) {
        ws[cellRef].t = 'n'
        ws[cellRef].z = 'dd/mm/yyyy'
      }
    }

    XLSX.writeFile(wb, TRACKER_PATH)
    return { ok: true, row: lastRow + 1 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export default function trackerPlugin() {
  return {
    name: 'tracker-plugin',
    configureServer(server) {
      server.middlewares.use('/api/append-candidate', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const result = appendToTracker(data)
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify(result))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: e.message }))
          }
        })
      })
    },
  }
}
