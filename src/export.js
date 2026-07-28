import * as XLSX from 'xlsx'

function formatVerdict(verdict) {
  if (verdict === 'Pass') return '✅ Pass'
  if (verdict === 'No Pass') return '❌ No Pass'
  if (verdict === 'Flag for Review') return '⚠️ Flag for Review'
  return verdict || ''
}

export function exportAllToExcel(roles) {
  const rows = []

  for (const role of roles) {
    try {
      const history = JSON.parse(localStorage.getItem(`history_${role.id}`)) || []
      for (const entry of history) {
        const r = entry.result
        rows.push({
          'Fecha':               new Date(entry.ts).toLocaleDateString('es-AR'),
          'Hora':                new Date(entry.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          'Candidato':           entry.name || 'Sin nombre',
          'Rol':                 role.title,
          'Empresa':             role.company || '',
          'Veredicto':           formatVerdict(r.verdict),
          'Score':               r.fit_score ?? '',
          'Años exp.':           r.years_experience ?? '',
          'Ubicación':           r.location_detected || '',
          'Fake risk':           r.fake_profile_risk || '',
          'Borderline':          r.borderline ? 'Sí' : 'No',
          'Strengths':           r.strengths?.join(' | ') || '',
          'Gaps':                r.gaps?.join(' | ') || '',
          'Red flags':           r.red_flags?.join(' | ') || '',
          'Razón de rechazo':    r.hard_rejection_reason || '',
          'BambooHR Note':       r.bamboohr_note || '',
          'Slack Summary':       r.slack_summary || '',
          'Justificación':       r.justification || '',
        })
      }
    } catch {}
  }

  if (rows.length === 0) {
    alert('No hay candidatos en el historial para exportar.')
    return
  }

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 28 }, { wch: 18 },
    { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 22 }, { wch: 10 },
    { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 },
    { wch: 50 }, { wch: 50 }, { wch: 60 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Candidatos')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `recruiting_db_${date}.xlsx`)
}

// Append a single screening result directly to the CQL tracker Excel
export async function autoExportScreening(candidateName, result, role) {
  try {
    const r = result
    const comments = [
      r.justification,
      r.strengths?.length ? 'Strengths: ' + r.strengths.join(' | ') : '',
      r.bamboohr_note || '',
    ].filter(Boolean).join('\n\n')

    const payload = {
      name:       candidateName || 'Unknown',
      role:       role.title,
      location:   r.location_detected || '',
      verdict:    r.verdict,
      yoe:        r.years_experience || '',
      rejection:  r.hard_rejection_reason || (r.gaps?.join(' | ') || ''),
      comments:   comments.slice(0, 500),
    }

    const res = await fetch('/api/append-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!data.ok) console.warn('Tracker write failed:', data.error)
  } catch (e) {
    console.warn('Could not append to tracker:', e.message)
  }
}
