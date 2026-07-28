// Read all screening history across all roles from localStorage
export function getAllScreenings(roles) {
  const all = []
  for (const role of roles) {
    const key = `history_${role.id}`
    try {
      const items = JSON.parse(localStorage.getItem(key)) || []
      for (const item of items) {
        all.push({ ...item, role })
      }
    } catch {}
  }
  return all.sort((a, b) => b.ts - a.ts)
}

// Log a sourcing session
export function logSourcingSession(roleId, note = '') {
  const key = 'sourcing_log'
  const log = JSON.parse(localStorage.getItem(key) || '[]')
  log.unshift({ roleId, note, ts: Date.now() })
  localStorage.setItem(key, JSON.stringify(log.slice(0, 200)))
}

export function getSourcingLog() {
  try { return JSON.parse(localStorage.getItem('sourcing_log') || '[]') } catch { return [] }
}

// Save a low-volume note for today
export function saveLowVolumeNote(note) {
  const key = 'low_volume_notes'
  const notes = JSON.parse(localStorage.getItem(key) || '[]')
  notes.unshift({ note, ts: Date.now() })
  localStorage.setItem(key, JSON.stringify(notes.slice(0, 100)))
}

export function getLowVolumeNotes() {
  try { return JSON.parse(localStorage.getItem('low_volume_notes') || '[]') } catch { return [] }
}

// Filter items to today
export function isToday(ts) {
  const d = new Date(ts)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

export function isThisWeek(ts) {
  const d = new Date(ts)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return d >= startOfWeek
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Bitácora (daily log)
export function saveBitacoraEntry(text, roleTag = null) {
  const key = 'bitacora'
  const log = JSON.parse(localStorage.getItem(key) || '[]')
  log.unshift({ id: Date.now(), text, roleTag, ts: Date.now() })
  localStorage.setItem(key, JSON.stringify(log.slice(0, 500)))
}

export function getBitacoraEntries() {
  try { return JSON.parse(localStorage.getItem('bitacora') || '[]') } catch { return [] }
}

export function deleteBitacoraEntry(id) {
  const key = 'bitacora'
  const log = JSON.parse(localStorage.getItem(key) || '[]')
  localStorage.setItem(key, JSON.stringify(log.filter(e => e.id !== id)))
}

// Build daily report text
export function buildDailyReport(roles, screenings, sourcingLog, lowVolumeNote) {
  const today = screenings.filter(s => isToday(s.ts))
  const todaySourcing = sourcingLog.filter(s => isToday(s.ts))

  const pass = today.filter(s => s.result.verdict === 'Pass').length
  const noPass = today.filter(s => s.result.verdict === 'No Pass').length
  const flag = today.filter(s => s.result.verdict === 'Flag for Review').length
  const fakeHigh = today.filter(s => s.result.fake_profile_risk === 'High').length
  const fakeMedium = today.filter(s => s.result.fake_profile_risk === 'Medium').length

  // Group by role
  const byRole = {}
  for (const s of today) {
    const title = s.role.title
    if (!byRole[title]) byRole[title] = { pass: 0, noPass: 0, flag: 0, total: 0 }
    byRole[title].total++
    if (s.result.verdict === 'Pass') byRole[title].pass++
    else if (s.result.verdict === 'No Pass') byRole[title].noPass++
    else byRole[title].flag++
  }

  const roleLines = Object.entries(byRole)
    .map(([title, r]) => `• ${title}: ${r.total} reviewed · ✅ ${r.pass} Pass · ⚠️ ${r.flag} Flag · ❌ ${r.noPass} No Pass`)
    .join('\n')

  const sourcingLines = todaySourcing.length > 0
    ? `\n*Sourcing:*\n${todaySourcing.map(s => {
        const role = roles.find(r => r.id === s.roleId)
        return `• ${role?.title || 'Unknown role'}${s.note ? ` — ${s.note}` : ''}`
      }).join('\n')}`
    : ''

  const lowVolumeLine = lowVolumeNote
    ? `\n*Low volume note:*\n${lowVolumeNote}`
    : ''

  const date = formatDate(Date.now())

  return `📊 *Daily Recruiting Update — ${date}*

*Reviewed today:* ${today.length} candidate${today.length !== 1 ? 's' : ''} across ${Object.keys(byRole).length} role${Object.keys(byRole).length !== 1 ? 's' : ''}
*Results:* ✅ ${pass} Pass · ⚠️ ${flag} Flag · ❌ ${noPass} No Pass${fakeHigh + fakeMedium > 0 ? `\n*Fake profiles flagged:* ${fakeHigh} High risk · ${fakeMedium} Medium risk` : ''}

*By role:*
${roleLines || '• No candidates screened today'}${sourcingLines}${lowVolumeLine}`
}
