import * as XLSX from 'xlsx'

// Normalize header names to our expected keys
const HEADER_MAP = {
  name: ['name', 'full name', 'candidate name', 'nombre'],
  email: ['email', 'e-mail', 'email address', 'correo'],
  location: ['location', 'city', 'country', 'state', 'ubicacion', 'ubicación'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link'],
  salary: ['salary', 'salary expectation', 'expected salary', 'compensation', 'comp'],
  cv: ['cv', 'resume', 'cv text', 'summary', 'bio', 'profile', 'cv summary', 'resume text'],
}

function normalizeKey(header) {
  const h = header.toLowerCase().trim()
  for (const [key, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.includes(h)) return key
  }
  return null
}

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (rows.length === 0) {
          reject(new Error('The Excel file appears to be empty.'))
          return
        }

        // Build header mapping from first row keys
        const rawKeys = Object.keys(rows[0])
        const keyMap = {}
        for (const rawKey of rawKeys) {
          const normalized = normalizeKey(rawKey)
          if (normalized) keyMap[rawKey] = normalized
        }

        const candidates = rows.map((row, i) => {
          const c = { _rowIndex: i + 2 }
          for (const [rawKey, normKey] of Object.entries(keyMap)) {
            c[normKey] = String(row[rawKey] || '').trim()
          }
          // Fallback: if no name, try first column
          if (!c.name) {
            c.name = String(Object.values(row)[0] || '').trim()
          }
          return c
        })

        resolve(candidates)
      } catch (err) {
        reject(new Error('Failed to parse Excel file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export function exportResults(candidates, results) {
  const rows = candidates.map((c, i) => {
    const r = results[i]
    if (!r || r.status !== 'done') {
      return {
        Name: c.name,
        Email: c.email,
        LinkedIn: c.linkedin,
        Location: c.location,
        Verdict: r?.status === 'error' ? 'Error' : 'Not processed',
        Justification: r?.error || '',
        'Hard Rejection Reason': '',
        'Red Flags': '',
        'Track Fit Score': '',
        'Years Experience': '',
        'BambooHR Note': '',
        'Slack Summary': '',
      }
    }
    const d = r.data
    return {
      Name: c.name,
      Email: c.email,
      LinkedIn: c.linkedin,
      Location: c.location,
      Verdict: d.verdict,
      Justification: d.justification,
      'Hard Rejection Reason': d.hard_rejection_reason || '',
      'Red Flags': (d.red_flags || []).join('; '),
      'Best Fit Track': d.best_fit_track || '',
      'Predictive Fit': d.track_fit?.['Predictive Modeling'] ?? '',
      'LLM Fit': d.track_fit?.['LLM/Generative AI'] ?? '',
      'CV Fit': d.track_fit?.['Computer Vision'] ?? '',
      'Years Experience': d.years_experience ?? '',
      'BambooHR Note': d.bamboohr_note,
      'Slack Summary': d.slack_summary,
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Screening Results')
  XLSX.writeFile(wb, 'screening_results.xlsx')
}
