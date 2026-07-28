import React, { useState, useRef, useEffect } from 'react'
import { parseJD, generateBooleans, refineBooleans, screenCV, compareCVs, generateInterviewGuide, analyzeInterview, analyzeRejections, generateOutreach, fetchNinjaProfile, ninjaProfileToText } from './api'
import { autoExportScreening } from './export'
import { logSourcingSession, getAllScreenings, isToday } from './metrics'
import { extractTextFromPDF } from './pdfReader'
import MetricsDashboard from './MetricsDashboard'
import './App.css'

// ── helpers ──────────────────────────────────────────────────────────────────

function DailyBanner({ roles }) {
  const [stats, setStats] = useState({ total: 0, pass: 0, flag: 0, noPass: 0 })

  useEffect(() => {
    const compute = () => {
      const all = getAllScreenings(roles).filter(s => isToday(s.ts))
      setStats({
        total: all.length,
        pass:   all.filter(s => s.result.verdict === 'Pass').length,
        flag:   all.filter(s => s.result.verdict === 'Flag for Review').length,
        noPass: all.filter(s => s.result.verdict === 'No Pass').length,
      })
    }
    compute()
    const id = setInterval(compute, 5000)
    return () => clearInterval(id)
  }, [roles])

  if (stats.total === 0) return null

  return (
    <div className="daily-banner">
      <span className="daily-banner-label">Today</span>
      <span className="daily-banner-stat">📋 {stats.total} reviewed</span>
      <span className="daily-banner-sep">·</span>
      <span className="daily-banner-stat pass">✅ {stats.pass} Pass</span>
      <span className="daily-banner-sep">·</span>
      <span className="daily-banner-stat flag">⚠️ {stats.flag} Flag</span>
      <span className="daily-banner-sep">·</span>
      <span className="daily-banner-stat nope">❌ {stats.noPass} No Pass</span>
    </div>
  )
}

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial }
    catch { return initial }
  })
  const set = (v) => {
    const next = typeof v === 'function' ? v(val) : v
    setVal(next)
    localStorage.setItem(key, JSON.stringify(next))
  }
  return [val, set]
}

function copyText(text, setCopied, key) {
  navigator.clipboard.writeText(text)
  setCopied(key)
  setTimeout(() => setCopied(null), 2000)
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildScreeningReport(result, candidateName, role) {
  const lines = []
  const sep = '─'.repeat(60)
  lines.push(`SCREENING REPORT`)
  lines.push(sep)
  lines.push(`Candidate : ${candidateName || 'N/A'}`)
  lines.push(`Role      : ${role?.title || 'N/A'}${role?.company ? ` @ ${role.company}` : ''}`)
  lines.push(`Date      : ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  lines.push('')
  lines.push(`VERDICT: ${result.verdict}  |  Fit: ${normalizeScore(result.fit_score)}/100`)
  if (result.score_breakdown) {
    lines.push('')
    lines.push('Score Breakdown')
    lines.push(`  Skills      : ${result.score_breakdown.skills ?? '–'}/100`)
    lines.push(`  Seniority   : ${result.score_breakdown.seniority ?? '–'}/100`)
    lines.push(`  Industry    : ${result.score_breakdown.industry ?? '–'}/100`)
    lines.push(`  Trajectory  : ${result.score_breakdown.trajectory ?? '–'}/100`)
  }
  lines.push('')
  lines.push(sep)
  lines.push('JUSTIFICATION')
  lines.push(result.justification || '–')
  if (result.strengths?.length) {
    lines.push('')
    lines.push('STRENGTHS')
    result.strengths.forEach(s => lines.push(`• ${s}`))
  }
  if (result.gaps?.length) {
    lines.push('')
    lines.push('GAPS')
    result.gaps.forEach(g => lines.push(`• ${g}`))
  }
  if (result.red_flags?.length) {
    lines.push('')
    lines.push('RED FLAGS')
    result.red_flags.forEach(f => lines.push(`• ${f}`))
  }
  if (result.career_dna) {
    const dna = result.career_dna
    lines.push('')
    lines.push('CAREER DNA')
    if (dna.stage_history)   lines.push(`  Stage history    : ${dna.stage_history}`)
    if (dna.builder_vs_scaler) lines.push(`  Pattern          : ${dna.builder_vs_scaler}${dna.builder_vs_scaler_evidence ? ` — ${dna.builder_vs_scaler_evidence}` : ''}`)
    if (dna.promotion_velocity) lines.push(`  Velocity         : ${dna.promotion_velocity}`)
    if (dna.seniority_depth)  lines.push(`  Seniority depth  : ${dna.seniority_depth}`)
    if (dna.hidden_gems?.length) {
      lines.push(`  Hidden gems:`)
      dna.hidden_gems.forEach(g => lines.push(`    💎 ${g}`))
    }
  }
  if (result.screening_questions?.length) {
    lines.push('')
    lines.push('SCREENING QUESTIONS')
    result.screening_questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`))
  }
  if (result.english_written) {
    lines.push('')
    lines.push('ENGLISH (written)')
    lines.push(`  Level   : ${result.english_written.level} (${result.english_written.confidence} confidence)`)
    lines.push(`  Summary : ${result.english_written.summary}`)
  }
  lines.push('')
  lines.push(sep)
  if (result.client_presentation) {
    lines.push('💬 SLACK — CLIENT PRESENTATION')
    lines.push(result.client_presentation)
    lines.push('')
  }
  if (result.bamboohr_note) {
    lines.push('🐼 BAMBOOHR NOTE')
    lines.push(result.bamboohr_note)
    lines.push('')
  }
  lines.push(sep)
  lines.push(`Fake profile risk: ${result.fake_profile_risk}`)
  if (result.fake_profile_signals?.length) {
    result.fake_profile_signals.forEach(s => lines.push(`  • ${s}`))
  }
  return lines.join('\n')
}

function buildInterviewReport(postResult, candidateName, role) {
  const lines = []
  const sep = '─'.repeat(60)
  lines.push(`POST-INTERVIEW REPORT`)
  lines.push(sep)
  lines.push(`Candidate : ${candidateName || 'N/A'}`)
  lines.push(`Role      : ${role?.title || 'N/A'}${role?.company ? ` @ ${role.company}` : ''}`)
  lines.push(`Date      : ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  lines.push('')
  lines.push(`DECISION: ${postResult.decision}  |  Confidence: ${postResult.confidence}`)
  lines.push('')
  lines.push('DECISION REASON')
  lines.push(postResult.decision_reason || '–')
  if (postResult.gaps_resolved?.length) {
    lines.push('')
    lines.push('GAPS RESOLVED IN INTERVIEW')
    postResult.gaps_resolved.forEach(g => lines.push(`✅ ${g}`))
  }
  if (postResult.gaps_confirmed?.length) {
    lines.push('')
    lines.push('GAPS CONFIRMED')
    postResult.gaps_confirmed.forEach(g => lines.push(`⚠️ ${g}`))
  }
  if (postResult.new_concerns?.length) {
    lines.push('')
    lines.push('NEW CONCERNS')
    postResult.new_concerns.forEach(c => lines.push(`🚩 ${c}`))
  }
  if (postResult.standout_moments?.length) {
    lines.push('')
    lines.push('STANDOUT MOMENTS')
    postResult.standout_moments.forEach(m => lines.push(`• ${m}`))
  }
  if (postResult.english_level) {
    lines.push('')
    lines.push('ENGLISH (spoken)')
    lines.push(`  Level   : ${postResult.english_level.level} (${postResult.english_level.confidence} confidence)`)
    lines.push(`  Summary : ${postResult.english_level.summary}`)
    if (postResult.english_level.concerns) lines.push(`  Concern : ${postResult.english_level.concerns}`)
  }
  if (postResult.logistics) {
    const l = postResult.logistics
    lines.push('')
    lines.push('LOGISTICS')
    if (l.salary_expectation) lines.push(`  Salary       : ${l.salary_expectation}`)
    if (l.notice_period)      lines.push(`  Notice       : ${l.notice_period}`)
    if (l.availability)       lines.push(`  Availability : ${l.availability}`)
    lines.push(`  Timezone confirmed: ${l.timezone_confirmed ? 'Yes' : 'No'}`)
  }
  lines.push('')
  lines.push(sep)
  if (postResult.client_presentation || postResult.client_pitch) {
    lines.push('📤 CLIENT PRESENTATION')
    lines.push(postResult.client_presentation || postResult.client_pitch)
    lines.push('')
  }
  if (postResult.bamboohr_note) {
    lines.push('🐼 BAMBOOHR NOTE')
    lines.push(postResult.bamboohr_note)
    lines.push('')
  }
  lines.push(sep)
  lines.push(`Next step: ${postResult.next_step || '–'}`)
  return lines.join('\n')
}

const VERDICT_STYLE = {
  'Pass':           { color: 'var(--pass)', icon: '✅' },
  'No Pass':        { color: 'var(--nope)', icon: '❌' },
  'Flag for Review':{ color: 'var(--flag)', icon: '⚠️' },
}

function scoreColor(n) {
  if (n >= 80) return 'var(--pass)'
  if (n >= 60) return 'var(--flag)'
  return 'var(--nope)'
}

function normalizeScore(s) {
  // backward compat: old scores were 1-10
  return s > 10 ? s : s * 10
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null
  const dims = [
    { key: 'skills',     label: 'Skills' },
    { key: 'seniority',  label: 'Seniority' },
    { key: 'industry',   label: 'Industry' },
    { key: 'trajectory', label: 'Trajectory' },
  ]
  return (
    <div className="score-breakdown">
      {dims.map(({ key, label }) => {
        const val = breakdown[key] ?? 0
        return (
          <div key={key} className="score-dim">
            <span className="score-dim-label">{label}</span>
            <div className="score-dim-track">
              <div className="score-dim-fill" style={{ width: `${val}%`, background: scoreColor(val) }} />
            </div>
            <span className="score-dim-num" style={{ color: scoreColor(val) }}>{val}</span>
          </div>
        )
      })}
    </div>
  )
}

function CareerDNA({ dna }) {
  if (!dna) return null
  const bvsIcon = { Builder: '🏗', Scaler: '📈', Mixed: '🔄', Unknown: '❓' }
  return (
    <div className="career-dna">
      <h4 className="career-dna-title">🧬 Career DNA</h4>
      <div className="career-dna-grid">
        {dna.stage_history && (
          <div className="dna-block">
            <span className="dna-label">Stage history</span>
            <p className="dna-value">{dna.stage_history}</p>
          </div>
        )}
        {dna.builder_vs_scaler && dna.builder_vs_scaler !== 'Unknown' && (
          <div className="dna-block">
            <span className="dna-label">Pattern</span>
            <p className="dna-value">
              {bvsIcon[dna.builder_vs_scaler]} <strong>{dna.builder_vs_scaler}</strong>
              {dna.builder_vs_scaler_evidence && ` — ${dna.builder_vs_scaler_evidence}`}
            </p>
          </div>
        )}
        {dna.promotion_velocity && (
          <div className="dna-block">
            <span className="dna-label">Velocity</span>
            <p className="dna-value">{dna.promotion_velocity}</p>
          </div>
        )}
        {dna.seniority_depth && (
          <div className="dna-block">
            <span className="dna-label">Seniority depth</span>
            <p className="dna-value">{dna.seniority_depth}</p>
          </div>
        )}
        {dna.hidden_gems?.length > 0 && (
          <div className="dna-block dna-block-full">
            <span className="dna-label">💎 Hidden gems</span>
            <ul className="dna-gems">
              {dna.hidden_gems.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
const RISK_STYLE = {
  'Low':    { color: 'var(--pass)' },
  'Medium': { color: 'var(--flag)' },
  'High':   { color: 'var(--nope)' },
}
const LOC_LABEL = {
  'us_canada':    '🇺🇸 US / Canada',
  'latam':        '🌎 LATAM',
  'latam_canada': '🌎 LATAM + 🇨🇦 Canada',
  'global':       '🌐 Global',
  'other':        '📍 Other',
}

// ── sub-components ───────────────────────────────────────────────────────────

function ApiKeyBar({ apiKey, onSave }) {
  const [val, setVal] = useState(apiKey)
  const saved = val === apiKey && !!apiKey
  return (
    <div className="apikey-bar">
      <input type="password" placeholder="sk-ant-..." value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave(val)} />
      <button className="btn btn-primary btn-sm" onClick={() => onSave(val)}>
        {saved ? '✓ Saved' : 'Save key'}
      </button>
    </div>
  )
}

function RoleCard({ role, active, onClick, onDelete }) {
  return (
    <div className={`role-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="role-card-top">
        <span className="role-card-title">{role.title}</span>
        <button className="btn-icon" onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>
      </div>
      <div className="role-card-meta">
        {role.company && <span>{role.company}</span>}
        <span>{LOC_LABEL[role.location_type] || role.location || '—'}</span>
        {role.seniority && <span>{role.seniority}</span>}
      </div>
    </div>
  )
}

function JDUploader({ apiKey, onParsed }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef()

  const onFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    // For PDF we can't parse in browser easily, ask user to paste text
    if (file.type === 'application/pdf') {
      setError('PDF detected — please copy-paste the JD text directly into the box below.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setText(ev.target.result)
    reader.readAsText(file)
  }

  const parse = async () => {
    if (!apiKey) return setError('Save your API key first.')
    if (!text.trim()) return setError('Paste the JD text first.')
    setLoading(true); setError(null)
    try {
      const parsed = await parseJD(text, apiKey)
      onParsed({ ...parsed, id: Date.now(), jdText: text })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="jd-uploader">
      <div className="jd-uploader-header">
        <h3>Add a role</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>
          📎 Upload .txt
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md" style={{ display:'none' }} onChange={onFile} />
      </div>
      <textarea
        className="jd-textarea"
        placeholder="Paste the Job Description here…"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={8}
      />
      {error && <p className="error-msg">{error}</p>}
      <button className="btn btn-primary" onClick={parse} disabled={loading}>
        {loading ? '⏳ Parsing JD…' : '✦ Parse JD with Claude'}
      </button>
    </div>
  )
}

const LATAM_SHOPIFY_AGENCIES = [
  { name: 'LOP Multimedia', country: '🇦🇷', note: 'Shopify Plus Partner — New Era, Salomon LATAM' },
  { name: 'Argonauts Agency', country: '🇦🇷', note: 'Shopify Partner directory' },
  { name: 'Simples.', country: '🇦🇷', note: 'Shopify Partner directory' },
  { name: 'Essence Strategic', country: '🇨🇴', note: 'Bogotá — estrategia + ecommerce Shopify' },
  { name: 'Buda Digital', country: '🇨🇴🇧🇷', note: 'Partner certificado, Colombia y Brasil' },
  { name: 'e-Plus Agency', country: '🇧🇷', note: 'Shopify Plus Partner especializado' },
  { name: 'Netalico Commerce', country: '🌎', note: 'Premier Partner — Brasil, Colombia, USA' },
  { name: 'YoSoyShopify', country: '🇲🇽', note: 'La más grande de LATAM — 109 reviews verificadas' },
  { name: 'EcomBrands', country: '🌎', note: 'Headless commerce para toda Latinoamérica' },
  { name: 'Stream Commerce', country: '🌎', note: 'Shopify Partner directory' },
]

function TargetCompaniesPanel() {
  const [companies, setCompanies] = useLocalStorage('target_companies', LATAM_SHOPIFY_AGENCIES)
  const [newName, setNewName] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [newNote, setNewNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const add = () => {
    if (!newName.trim()) return
    setCompanies(c => [...c, { name: newName.trim(), country: newCountry.trim() || '🌎', note: newNote.trim() }])
    setNewName(''); setNewCountry(''); setNewNote(''); setShowAdd(false)
  }

  const remove = (i) => setCompanies(c => c.filter((_, idx) => idx !== i))

  const copyForLinkedIn = () => {
    const text = companies.map(c => c.name).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <h3>🏢 Agencias Shopify LATAM</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={copyForLinkedIn}>
            {copied ? '✓ Copiado' : '📋 Copiar lista'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '✕' : '+ Agregar'}
          </button>
        </div>
      </div>
      <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
        Buscá cada agencia en LinkedIn → "Empleados actuales" → filtrá por título (Frontend Lead / Tech Lead / Engineering Manager).
      </p>

      {showAdd && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Nombre de la agencia" value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ flex: 2, minWidth: 160 }}
          />
          <input
            type="text" placeholder="🇦🇷 país" value={newCountry}
            onChange={e => setNewCountry(e.target.value)}
            style={{ flex: 0, width: 80 }}
          />
          <input
            type="text" placeholder="Nota (opcional)" value={newNote}
            onChange={e => setNewNote(e.target.value)}
            style={{ flex: 3, minWidth: 160 }}
          />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!newName.trim()}>Agregar</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {companies.map((c, i) => (
          <div key={i} className="target-company-row">
            <span className="target-company-flag">{c.country}</span>
            <span className="target-company-name">{c.name}</span>
            {c.note && <span className="target-company-note">{c.note}</span>}
            <button className="btn-icon-sm" onClick={() => remove(i)} style={{ marginLeft: 'auto' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourcingAutopilot({ role, apiKey, ninjaPearKey }) {
  const [rows, setRows] = useState([])
  // Each row: { id, firstName, lastName, company, website, status: idle|fetching|screening|done|error, profile, cvText, result, error }
  const [csvInput, setCsvInput] = useState('')
  const [parseError, setParseError] = useState(null)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState('csv') // 'csv' | 'manual'
  const [manualFirst, setManualFirst] = useState('')
  const [manualLast, setManualLast] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [manualWebsite, setManualWebsite] = useState('')

  const parseCSV = () => {
    setParseError(null)
    const lines = csvInput.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return setParseError('Paste at least one row.')
    // Try to detect header row
    const firstLower = lines[0].toLowerCase()
    const hasHeader = firstLower.includes('first') || firstLower.includes('name') || firstLower.includes('company')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const parsed = []
    for (const line of dataLines) {
      const cols = line.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
      // Flexible: try to detect columns by position or content
      // Sales Nav export: First Name, Last Name, Title, Company, LinkedIn URL, Email, ...
      // Minimal: First Name, Last Name, Company Website
      const firstName = cols[0] || ''
      const lastName = cols[1] || ''
      const company = cols[3] || cols[2] || ''
      // Website: look for a col that starts with http or has a dot
      let website = ''
      for (const c of cols) {
        if (/^https?:\/\/|^www\.|[a-z0-9-]+\.[a-z]{2,}$/.test(c.toLowerCase())) {
          website = c.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
          break
        }
      }
      if (!firstName) continue
      parsed.push({ id: `${Date.now()}_${Math.random()}`, firstName, lastName, company, website, status: 'idle', profile: null, cvText: null, result: null, error: null })
    }
    if (parsed.length === 0) return setParseError('Could not parse any rows. Check format.')
    setRows(parsed)
  }

  const addManual = () => {
    if (!manualFirst.trim() || !manualWebsite.trim()) return
    setRows(prev => [...prev, {
      id: `manual_${Date.now()}`,
      firstName: manualFirst.trim(),
      lastName: manualLast.trim(),
      company: manualCompany.trim(),
      website: manualWebsite.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      status: 'idle',
      profile: null, cvText: null, result: null, error: null,
    }])
    setManualFirst(''); setManualLast(''); setManualCompany(''); setManualWebsite('')
  }

  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id))

  const updateRow = (id, patch) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const runAll = async () => {
    if (!ninjaPearKey) return alert('Enter your NinjaPear API key first.')
    if (!apiKey) return alert('Enter your Groq API key first.')
    const pending = rows.filter(r => r.status === 'idle' || r.status === 'error')
    if (pending.length === 0) return
    setRunning(true)

    for (const row of pending) {
      // 1. Fetch profile
      updateRow(row.id, { status: 'fetching', error: null })
      let profile, cvText
      try {
        profile = await fetchNinjaProfile(row.firstName, row.lastName, row.website || row.company, ninjaPearKey)
        cvText = ninjaProfileToText(profile, `${row.firstName} ${row.lastName}`.trim())
        updateRow(row.id, { profile, cvText, status: 'screening' })
      } catch (e) {
        updateRow(row.id, { status: 'error', error: `Profile fetch: ${e.message}` })
        continue
      }

      // 2. Screen
      try {
        const result = await screenCV(cvText, role, apiKey)
        updateRow(row.id, { result, status: 'done' })
      } catch (e) {
        updateRow(row.id, { status: 'error', error: `Screening: ${e.message}` })
      }
    }
    setRunning(false)
  }

  const passes = rows.filter(r => r.status === 'done' && r.result?.verdict === 'Pass')
  const flags  = rows.filter(r => r.status === 'done' && r.result?.verdict === 'Flag for Review')
  const nopes  = rows.filter(r => r.status === 'done' && r.result?.verdict === 'No Pass')

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <h3>🤖 Sourcing Autopilot</h3>
        <span className="panel-role-tag">{role.title}</span>
      </div>
      <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
        Pegá un export CSV de Sales Nav (o ingresá candidatos manualmente) → el autopilot busca el perfil en NinjaPear y hace el screening automáticamente.
      </p>

      {/* Mode tabs */}
      <div className="autopilot-mode-tabs" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={`btn btn-sm ${mode === 'csv' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('csv')}>📄 CSV</button>
        <button className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('manual')}>✏️ Manual</button>
      </div>

      {mode === 'csv' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <p className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>
            Formato: First Name, Last Name, Title, Company, LinkedIn URL (Sales Nav export). O cualquier CSV/TSV con nombre y website.
          </p>
          <textarea
            className="jd-textarea"
            rows={5}
            placeholder={"First Name,Last Name,Title,Company,LinkedIn URL\nMaría,García,Frontend Lead,Accenture,https://accenture.com\n..."}
            value={csvInput}
            onChange={e => setCsvInput(e.target.value)}
          />
          {parseError && <p className="error-msg">{parseError}</p>}
          <button className="btn btn-ghost btn-sm" onClick={parseCSV} disabled={!csvInput.trim()} style={{ alignSelf: 'flex-start' }}>
            Parse CSV ({csvInput.trim().split('\n').filter(Boolean).length} rows)
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>First name *</label>
            <input type="text" value={manualFirst} onChange={e => setManualFirst(e.target.value)} style={{ width: 120 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>Last name</label>
            <input type="text" value={manualLast} onChange={e => setManualLast(e.target.value)} style={{ width: 120 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>Company</label>
            <input type="text" value={manualCompany} onChange={e => setManualCompany(e.target.value)} style={{ width: 120 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>Website * (e.g. accenture.com)</label>
            <input type="text" value={manualWebsite} onChange={e => setManualWebsite(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addManual} disabled={!manualFirst.trim() || !manualWebsite.trim()}>+ Add</button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{rows.length} candidates queued</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-xs" onClick={() => setRows([])}>Clear all</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={runAll}
                disabled={running || rows.every(r => r.status === 'done')}
              >
                {running ? '⏳ Running…' : `▶ Run autopilot (${rows.filter(r => r.status === 'idle' || r.status === 'error').length} pending)`}
              </button>
            </div>
          </div>

          {/* Queue table */}
          <div className="autopilot-queue">
            {rows.map(row => {
              const vc = row.result ? VERDICT_STYLE[row.result.verdict] : null
              return (
                <div key={row.id} className={`autopilot-row autopilot-row--${row.status}`}>
                  <div className="autopilot-row-name">
                    <span>{row.firstName} {row.lastName}</span>
                    <span className="autopilot-row-company">{row.company || row.website}</span>
                  </div>
                  <div className="autopilot-row-status">
                    {row.status === 'idle'      && <span className="muted" style={{ fontSize: 12 }}>Pending</span>}
                    {row.status === 'fetching'  && <span className="autopilot-step">🔍 Fetching profile…</span>}
                    {row.status === 'screening' && <span className="autopilot-step">🧠 Screening…</span>}
                    {row.status === 'error'     && <span style={{ color: 'var(--nope)', fontSize: 12 }} title={row.error}>⚠️ {row.error}</span>}
                    {row.status === 'done' && vc && (
                      <span style={{ color: vc.color, fontSize: 13, fontWeight: 700 }}>
                        {vc.icon} {row.result.verdict}
                        {row.result.fit_score && <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{normalizeScore(row.result.fit_score)}/100</span>}
                      </span>
                    )}
                  </div>
                  <button className="btn-icon-sm" onClick={() => removeRow(row.id)}>✕</button>
                </div>
              )
            })}
          </div>

          {/* Results summary */}
          {rows.some(r => r.status === 'done') && (
            <div className="autopilot-summary">
              {passes.length > 0 && (
                <div className="autopilot-bucket autopilot-bucket--pass">
                  <div className="autopilot-bucket-label">✅ Pass ({passes.length})</div>
                  {passes.map(r => (
                    <div key={r.id} className="autopilot-bucket-row">
                      <span>{r.firstName} {r.lastName}</span>
                      <span style={{ color: scoreColor(normalizeScore(r.result.fit_score)), fontSize: 12 }}>
                        {normalizeScore(r.result.fit_score)}/100
                      </span>
                      {r.result.justification && (
                        <span className="autopilot-justification">{r.result.justification.slice(0, 120)}…</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {flags.length > 0 && (
                <div className="autopilot-bucket autopilot-bucket--flag">
                  <div className="autopilot-bucket-label">⚠️ Flag ({flags.length})</div>
                  {flags.map(r => (
                    <div key={r.id} className="autopilot-bucket-row">
                      <span>{r.firstName} {r.lastName}</span>
                      <span style={{ color: scoreColor(normalizeScore(r.result.fit_score)), fontSize: 12 }}>
                        {normalizeScore(r.result.fit_score)}/100
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {nopes.length > 0 && (
                <div className="autopilot-bucket autopilot-bucket--nope">
                  <div className="autopilot-bucket-label">❌ No Pass ({nopes.length})</div>
                  {nopes.map(r => <div key={r.id} className="autopilot-bucket-row"><span>{r.firstName} {r.lastName}</span></div>)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BooleanPanel({ role, apiKey }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [history, setHistory] = useState([])

  const generate = async () => {
    if (!apiKey) return setError('Save your API key first.')
    setLoading(true); setError(null)
    try {
      const r = await generateBooleans(role, apiKey)
      setResult(r)
      setHistory([])
      setRefineFeedback('')
      logSourcingSession(role.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const refine = async () => {
    if (!refineFeedback.trim()) return
    setRefining(true); setError(null)
    try {
      const r = await refineBooleans(result, refineFeedback, role, apiKey)
      setHistory(h => [...h, { feedback: refineFeedback, result }])
      setResult(r)
      setRefineFeedback('')
    } catch (e) {
      setError(e.message)
    } finally {
      setRefining(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>🔍 LinkedIn Boolean Strings</h3>
        <button className="btn btn-primary btn-sm" onClick={generate} disabled={loading || refining}>
          {loading ? '⏳ Generating…' : result ? '↺ Regenerar' : 'Generate'}
        </button>
      </div>
      <div className="panel-meta">
        <span>Role: <strong>{role.title}</strong></span>
        <span>Location: <strong>{LOC_LABEL[role.location_type] || role.location}</strong></span>
        {role.years_experience_min && <span>Exp: <strong>{role.years_experience_min}+ yrs</strong></span>}
      </div>
      {error && <p className="error-msg">{error}</p>}
      {result && (
        <div className="boolean-results">
          {/* Sales Navigator */}
          <div className="boolean-section-title">💼 Sales Navigator</div>

          {result.sales_navigator?.keywords && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">Keywords (targeted)</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.sales_navigator.keywords, setCopied, 'snk')}>
                  {copied === 'snk' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="boolean-pre">{result.sales_navigator.keywords}</pre>
            </div>
          )}

          {result.sales_navigator?.keywords_broad && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">Keywords (broad)</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.sales_navigator.keywords_broad, setCopied, 'snb')}>
                  {copied === 'snb' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="boolean-pre">{result.sales_navigator.keywords_broad}</pre>
            </div>
          )}

          {result.sales_navigator?.titles?.length > 0 && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">Job titles filter</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.sales_navigator.titles.join('\n'), setCopied, 'snt')}>
                  {copied === 'snt' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="tag-list" style={{ padding: '4px 0' }}>
                {result.sales_navigator.titles.map((t, i) => <span key={i} className="tag">{t}</span>)}
              </div>
            </div>
          )}

          {result.sales_navigator?.agency_keywords && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">+ Agency keywords</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.sales_navigator.agency_keywords, setCopied, 'sna')}>
                  {copied === 'sna' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="boolean-pre">{result.sales_navigator.agency_keywords}</pre>
            </div>
          )}
          {result.sales_navigator?.company_type_tip && (
            <div className="tip-block">🏢 {result.sales_navigator.company_type_tip}</div>
          )}
          {result.sales_navigator?.filters_tip && (
            <div className="tip-block">⚙️ {result.sales_navigator.filters_tip}</div>
          )}

          {/* X-Ray */}
          <div className="boolean-section-title" style={{ marginTop: 8 }}>🔎 Google X-Ray</div>

          {result.xray?.broad && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">Broad</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.xray.broad, setCopied, 'xb')}>
                  {copied === 'xb' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="boolean-pre">{result.xray.broad}</pre>
            </div>
          )}

          {result.xray?.targeted && (
            <div className="boolean-block">
              <div className="boolean-block-header">
                <span className="boolean-label">Targeted</span>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.xray.targeted, setCopied, 'xt')}>
                  {copied === 'xt' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="boolean-pre">{result.xray.targeted}</pre>
            </div>
          )}

          {result.xray?.tip && (
            <div className="tip-block">💡 {result.xray.tip}</div>
          )}

          {result.notes && (
            <div className="tip-block">📌 {result.notes}</div>
          )}
          {result.refinement_summary && (
            <div className="tip-block" style={{ borderLeft: '3px solid var(--accent)' }}>✏️ <strong>Cambio:</strong> {result.refinement_summary}</div>
          )}
        </div>
      )}

      {result && (
        <div className="refine-section">
          <div className="refine-header">
            <span>¿Pocos resultados o muy amplios? Describí qué pasó y refinamos:</span>
            {history.length > 0 && <span className="refine-history-count">{history.length} refinamiento{history.length > 1 ? 's' : ''} previo{history.length > 1 ? 's' : ''}</span>}
          </div>
          <div className="refine-input-row">
            <textarea
              className="refine-textarea"
              value={refineFeedback}
              onChange={e => setRefineFeedback(e.target.value)}
              placeholder='Ej: "Muy pocos resultados, sacar WCAG y web components" · "Muy broad, traía devs junior" · "Quiero más de Brasil y México"'
              rows={2}
            />
            <button className="btn btn-primary btn-sm" onClick={refine} disabled={refining || !refineFeedback.trim()}>
              {refining ? '⏳ Refinando…' : '✨ Refinar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ScreeningPanel({ role, apiKey }) {
  const [cvText, setCvText] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [loadedFiles, setLoadedFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [history, setHistory] = useLocalStorage(`history_${role.id}`, [])
  const pdfRef = useRef()

  const [dragging, setDragging] = useState(false)
  const [outreach, setOutreach] = useState(null)
  const [outreachLoading, setOutreachLoading] = useState(false)

  const processFiles = async (files) => {
    if (!files.length) return
    setPdfLoading(true)
    setError(null)
    try {
      const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
      if (!pdfs.length) { setError('Solo se aceptan archivos PDF.'); return }
      const texts = await Promise.all(pdfs.map(f => extractTextFromPDF(f)))

      const isTranscript = (name) => /phone|screen|interview|entrevista|transcript|call|nota|note/i.test(name)

      const combined = texts.map((t, i) => {
        if (pdfs.length === 1) return t
        const label = isTranscript(pdfs[i].name)
          ? `=== PHONE SCREEN / INTERVIEW NOTES (${pdfs[i].name}) ===`
          : `=== CV / RESUME (${pdfs[i].name}) ===`
        return `${label}\n${t}`
      }).join('\n\n')

      setCvText(combined)
      setLoadedFiles(pdfs.map(f => ({ name: f.name, chars: Math.round(f.size / 100) / 10 + 'k' })))
      if (!candidateName) {
        const nameGuess = pdfs[0].name.replace(/\.(pdf)$/i, '').replace(/[_-]/g, ' ').replace(/cv|resume|profile/gi, '').trim()
        if (nameGuess) setCandidateName(nameGuess)
      }
    } catch (e) {
      setError('Failed to read PDF: ' + e.message)
    } finally {
      setPdfLoading(false)
    }
  }

  const onPdfUpload = async (e) => {
    await processFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    await processFiles(files)
  }

  const screen = async () => {
    if (!apiKey) return setError('Save your API key first.')
    if (!cvText.trim()) return setError('Paste a CV first.')
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await screenCV(cvText, role, apiKey)
      setResult(r)
      setHistory(h => [{ name: candidateName || 'Unknown', result: r, ts: Date.now() }, ...h.slice(0, 49)])
      autoExportScreening(candidateName || 'Unknown', r, role)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Batch processing
  const [batch, setBatch] = useState([]) // [{name, status, result, error}]
  const [batchRunning, setBatchRunning] = useState(false)
  const batchRef = useRef()

  const isTranscriptFile = (name) => /phone|screen|interview|entrevista|transcript|call|nota|note|cql/i.test(name)

  const onBatchUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    // Group: pair transcript files with CV files for the same candidate
    const cvFiles = files.filter(f => !isTranscriptFile(f.name))
    const transcriptFiles = files.filter(f => isTranscriptFile(f.name))

    let items = []

    if (cvFiles.length === 0 && transcriptFiles.length > 0) {
      // Only transcripts uploaded — screen them as-is
      items = transcriptFiles.map(f => ({
        name: f.name.replace(/\.pdf$/i, ''),
        files: [f],
        status: 'pending', result: null, error: null,
      }))
    } else if (cvFiles.length > 0 && transcriptFiles.length === 0) {
      // Only CVs — normal batch
      items = cvFiles.map(f => ({
        name: f.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').replace(/cv|resume|profile/gi, '').trim() || f.name.replace(/\.pdf$/i, ''),
        files: [f],
        status: 'pending', result: null, error: null,
      }))
    } else {
      // Mix: if 1 CV + 1 transcript → pair them. If multiple CVs → each CV gets any matching transcript.
      if (cvFiles.length === 1 && transcriptFiles.length >= 1) {
        // Pair all transcripts with the single CV
        items = [{
          name: cvFiles[0].name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').replace(/cv|resume|profile/gi, '').trim() || cvFiles[0].name.replace(/\.pdf$/i, ''),
          files: [cvFiles[0], ...transcriptFiles],
          status: 'pending', result: null, error: null,
        }]
      } else {
        // Multiple CVs: try to match by name similarity, fallback to separate
        items = cvFiles.map(cv => {
          const cvBase = cv.name.toLowerCase().replace(/\.pdf$/i, '')
          const matched = transcriptFiles.find(t => {
            const tBase = t.name.toLowerCase().replace(/\.pdf$/i, '')
            // match if they share a word of 4+ chars
            const cvWords = cvBase.split(/[\s_\-\.]+/).filter(w => w.length >= 4)
            return cvWords.some(w => tBase.includes(w))
          })
          return {
            name: cv.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').replace(/cv|resume|profile/gi, '').trim() || cv.name.replace(/\.pdf$/i, ''),
            files: matched ? [cv, matched] : [cv],
            status: 'pending', result: null, error: null,
          }
        })
        // Add unmatched transcripts as standalone
        const matchedTranscripts = new Set(items.flatMap(i => i.files.map(f => f.name)))
        transcriptFiles.filter(t => !matchedTranscripts.has(t.name)).forEach(t => {
          items.push({ name: t.name.replace(/\.pdf$/i, ''), files: [t], status: 'pending', result: null, error: null })
        })
      }
    }

    setBatch(items)
    e.target.value = ''
  }

  const runBatch = async () => {
    if (!apiKey) return setError('Save your API key first.')
    setBatchRunning(true)
    for (let i = 0; i < batch.length; i++) {
      if (batch[i].status === 'done') continue
      setBatch(b => b.map((x, j) => j === i ? { ...x, status: 'processing' } : x))
      try {
        const texts = await Promise.all(batch[i].files.map(f => extractTextFromPDF(f)))
        const combined = texts.map((t, fi) => {
          if (batch[i].files.length === 1) return t
          const label = isTranscriptFile(batch[i].files[fi].name)
            ? `=== PHONE SCREEN / INTERVIEW NOTES (${batch[i].files[fi].name}) ===`
            : `=== CV / RESUME (${batch[i].files[fi].name}) ===`
          return `${label}\n${t}`
        }).join('\n\n')
        const trimmed = combined.length > 14000 ? combined.slice(0, 14000) + '\n[truncated]' : combined
        const r = await screenCV(trimmed, role, apiKey)
        setBatch(b => b.map((x, j) => j === i ? { ...x, status: 'done', result: r } : x))
        setHistory(h => [{ name: batch[i].name, result: r, ts: Date.now() }, ...h.slice(0, 49)])
        autoExportScreening(batch[i].name, r, role)
      } catch (err) {
        setBatch(b => b.map((x, j) => j === i ? { ...x, status: 'error', error: err.message } : x))
      }
      await new Promise(r => setTimeout(r, 3000))
    }
    setBatchRunning(false)
  }

  const vcfg = result ? VERDICT_STYLE[result.verdict] : null
  const rcfg = result ? RISK_STYLE[result.fake_profile_risk] : null

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>📋 CV Screener</h3>
        <span className="panel-role-tag">{role.title}</span>
      </div>

      <div className="cv-input-row">
        <input type="text" className="candidate-name-input"
          placeholder="Candidate name (optional)"
          value={candidateName}
          onChange={e => setCandidateName(e.target.value)} />
        <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={onPdfUpload} />
        <button className="btn btn-ghost btn-sm" onClick={() => pdfRef.current.click()} disabled={pdfLoading}>
          {pdfLoading ? '⏳ Reading…' : '📎 Upload PDF / Portfolio'}
        </button>
        {(cvText || loadedFiles.length > 0) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setCvText(''); setLoadedFiles([]); setCandidateName(''); setResult(null); setError(null) }}>
            🗑 Limpiar
          </button>
        )}
      </div>
      {loadedFiles.length > 0 && (
        <div className="loaded-files">
          {loadedFiles.map((f, i) => (
            <span key={i} className="loaded-file-chip">📄 {f.name} <span className="loaded-file-size">({f.chars})</span></span>
          ))}
        </div>
      )}
      <div
        className={`drop-zone${dragging ? ' drop-zone-active' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <textarea
          className="jd-textarea"
          placeholder="Paste CV / resume text here, or drag & drop a PDF…"
          value={cvText}
          onChange={e => setCvText(e.target.value)}
          rows={10}
        />
        {dragging && <div className="drop-overlay">📄 Soltá el PDF acá</div>}
      </div>
      {error && <p className="error-msg">{error}</p>}
      <div className="screen-actions">
        <button className="btn btn-primary" onClick={screen} disabled={loading || !cvText.trim()}>
          {loading ? '⏳ Screening…' : '✦ Screen'}
        </button>
        <span className="screen-actions-sep">or</span>
        <input ref={batchRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={onBatchUpload} />
        <button className="btn btn-ghost btn-sm" onClick={() => batchRef.current.click()}>
          📂 Batch upload PDFs
        </button>
      </div>

      {/* Batch panel */}
      {batch.length > 0 && (
        <div className="batch-panel">
          <div className="batch-header">
            <span>{batch.length} PDF{batch.length > 1 ? 's' : ''} loaded</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={runBatch} disabled={batchRunning}>
                {batchRunning ? '⏳ Processing…' : '▶ Screen all'}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setBatch([])}>Clear</button>
            </div>
          </div>
          {batch.map((item, i) => {
            const vc = item.result ? VERDICT_STYLE[item.result.verdict] : null
            return (
              <div key={i} className="batch-row">
                <span className="batch-name">{item.name}</span>
                <span className="batch-status">
                  {item.status === 'pending' && <span className="muted">—</span>}
                  {item.status === 'processing' && <span className="spinner-xs" />}
                  {item.status === 'error' && <span style={{ color: 'var(--nope)', fontSize: 12 }} title={item.error}>Error: {item.error}</span>}
                  {item.status === 'done' && vc && (
                    <span style={{ color: vc.color, fontSize: 13, fontWeight: 700 }}>
                      {vc.icon} {item.result.verdict}
                      {item.result.fit_score && <span className="batch-score"> · {normalizeScore(item.result.fit_score)}/100</span>}
                      {item.result.borderline && <span className="batch-borderline"> · 🟡 Borderline</span>}
                    </span>
                  )}
                </span>
                {item.status === 'done' && (
                  <button className="btn btn-ghost btn-xs" onClick={() => {
                    setResult(item.result)
                    setCandidateName(item.name)
                    setCvText('')
                  }}>View</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {result && (
        <div className="screen-result">
          {/* Verdict row */}
          <div className="verdict-row">
            <span className="verdict-big" style={{ color: vcfg.color }}>
              {vcfg.icon} {result.verdict}
            </span>
            <span className="fit-score-big" style={{ color: scoreColor(normalizeScore(result.fit_score)) }}>
              {normalizeScore(result.fit_score)}<span className="fit-score-denom">/100</span>
            </span>
            {result.years_experience && <span className="fit-score">📅 {result.years_experience}y exp</span>}
            {result.location_detected && <span className="fit-score">📍 {result.location_detected}</span>}
            <span className="fake-risk" style={{ color: rcfg?.color }}>
              🕵️ Fake risk: {result.fake_profile_risk}
            </span>
            {result.borderline && <span className="borderline-chip">🟡 Borderline</span>}
            {result.english_written && (
              <span className="fake-risk" style={{ color: result.english_written.passes_bar ? 'var(--pass)' : 'var(--nope)' }}
                title={result.english_written.summary}>
                🇬🇧 {result.english_written.level}
                {!result.english_written.passes_bar && ' ⚠️'}
              </span>
            )}
          </div>

          {/* Download button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => downloadText(
                buildScreeningReport(result, candidateName, role),
                `screening_${(candidateName || 'candidate').replace(/\s+/g, '_')}_${Date.now()}.txt`
              )}
            >
              ⬇ Download report
            </button>
          </div>

          {/* Score breakdown */}
          {result.score_breakdown && <ScoreBreakdown breakdown={result.score_breakdown} />}

          {/* Justification */}
          <div className="result-section">
            <h4>Justification</h4>
            <p className="prose">{result.justification}</p>
          </div>

          {result.hard_rejection_reason && (
            <div className="result-section">
              <h4>Hard Rejection</h4>
              <p className="prose" style={{ color: 'var(--nope)' }}>{result.hard_rejection_reason}</p>
            </div>
          )}

          {/* Strengths & Gaps */}
          <div className="two-col">
            {result.strengths?.length > 0 && (
              <div className="result-section">
                <h4>✅ Strengths</h4>
                <ul className="simple-list">
                  {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {result.gaps?.length > 0 && (
              <div className="result-section">
                <h4>⚠️ Gaps</h4>
                <ul className="simple-list gaps">
                  {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Career DNA */}
          {result.career_dna && <CareerDNA dna={result.career_dna} />}

          {/* Screening questions */}
          {result.screening_questions?.length > 0 && (
            <div className="result-section screening-qs">
              <h4>💬 Validate in screen</h4>
              <ol className="screening-list">
                {result.screening_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            </div>
          )}

          {/* Red flags */}
          {result.red_flags?.length > 0 && (
            <div className="result-section">
              <h4>🚩 Red Flags</h4>
              <ul className="flags-list">
                {result.red_flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {/* Fake profile signals */}
          {result.fake_profile_signals?.length > 0 && (
            <div className="result-section fake-section">
              <h4>🕵️ Fake Profile Signals</h4>
              <ul className="flags-list">
                {result.fake_profile_signals.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {/* Outreach */}
          {result.verdict !== 'No Pass' && (
            <div className="outreach-section">
              <div className="outreach-header">
                <h4>✉️ Personalized Outreach</h4>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    setOutreachLoading(true)
                    try { setOutreach(await generateOutreach(result, candidateName, role, apiKey)) }
                    catch (e) { setError(e.message) }
                    finally { setOutreachLoading(false) }
                  }}
                  disabled={outreachLoading}
                >
                  {outreachLoading ? '⏳ Drafting…' : outreach ? '↺ Regenerar' : '✦ Draft'}
                </button>
              </div>
              {outreach && (
                <div className="outreach-blocks">
                  {outreach.personalization_hook && (
                    <div className="outreach-hook">🎯 Hook: {outreach.personalization_hook}</div>
                  )}
                  <div className="outreach-block">
                    <div className="outreach-block-header">
                      <span className="outreach-label">LinkedIn note <span className="outreach-chars">({outreach.linkedin_note?.length || 0}/300)</span></span>
                      <button className="btn btn-ghost btn-xs" onClick={() => { navigator.clipboard.writeText(outreach.linkedin_note); setCopied('li') }}>
                        {copied === 'li' ? '✓' : 'Copy'}
                      </button>
                    </div>
                    <pre className="outreach-pre">{outreach.linkedin_note}</pre>
                  </div>
                  <div className="outreach-block">
                    <div className="outreach-block-header">
                      <span className="outreach-label">Email — {outreach.email_subject}</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => { navigator.clipboard.writeText(`Subject: ${outreach.email_subject}\n\n${outreach.email_body}`); setCopied('email') }}>
                        {copied === 'email' ? '✓' : 'Copy'}
                      </button>
                    </div>
                    <pre className="outreach-pre">{outreach.email_body}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="note-grid">
            {result.client_presentation && (
              <div className="note-block note-block-full">
                <div className="note-header">
                  <h4>💬 Slack — Client Presentation</h4>
                  <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.client_presentation, setCopied, 'client')}>
                    {copied === 'client' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="note-pre">{result.client_presentation}</pre>
              </div>
            )}
            <div className="note-block note-block-full">
              <div className="note-header">
                <h4>🐼 BambooHR Note</h4>
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(result.bamboohr_note, setCopied, 'bamboo')}>
                  {copied === 'bamboo' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="note-pre">{result.bamboohr_note}</pre>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="history">
          <div className="history-header">
            <h4>Recent screenings</h4>
            <button className="btn btn-ghost btn-xs" onClick={() => setHistory([])}>Clear</button>
          </div>
          {history.map((h, i) => {
            const vc = VERDICT_STYLE[h.result.verdict]
            return (
              <div key={i} className="history-row" onClick={() => { setResult(h.result); setCandidateName(h.name) }}>
                <span>{vc?.icon} {h.name}</span>
                <span className="history-meta">Fit: {normalizeScore(h.result.fit_score)}/100 · 🕵️ {h.result.fake_profile_risk}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InterviewPanel({ role, apiKey }) {
  const [history] = useLocalStorage(`history_${role.id}`, [])
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [subTab, setSubTab] = useState('pre') // 'pre' | 'post'
  const [guide, setGuide] = useState(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [postResult, setPostResult] = useState(null)
  const [postLoading, setPostLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const eligible = history.filter(h => h.result.verdict === 'Pass' || h.result.verdict === 'Flag for Review')
  const selected = selectedIdx !== null ? eligible[selectedIdx] : null

  const genGuide = async () => {
    if (!selected) return
    if (!apiKey) return setError('Save your API key first.')
    setGuideLoading(true); setError(null); setGuide(null)
    try {
      const r = await generateInterviewGuide(selected.result, selected.name, role, apiKey)
      setGuide(r)
    } catch (e) { setError(e.message) }
    finally { setGuideLoading(false) }
  }

  const analyzePost = async () => {
    if (!transcript.trim()) return setError('Paste the transcript or interview notes first.')
    if (!apiKey) return setError('Save your API key first.')
    setPostLoading(true); setError(null); setPostResult(null)
    try {
      const r = await analyzeInterview(transcript, selected?.name || 'Candidate', selected?.result || null, role, apiKey)
      setPostResult(r)
    } catch (e) { setError(e.message) }
    finally { setPostLoading(false) }
  }

  const DECISION_STYLE = {
    'Present to Client': { color: 'var(--pass)', icon: '✅' },
    'Do Not Present':    { color: 'var(--nope)', icon: '❌' },
    'Needs More Info':   { color: 'var(--flag)', icon: '⚠️' },
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>🎤 Interview Pipeline</h3>
        <span className="panel-role-tag">{role.title}</span>
      </div>

      {/* Candidate selector */}
      <div className="interview-candidate-selector">
        <div className="interview-selector-label">Candidatos en pipeline ({eligible.length})</div>
        {eligible.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Ningún candidato pasó el screening para este rol todavía.</p>
        ) : (
          <div className="interview-candidate-list">
            {eligible.map((h, i) => {
              const vc = VERDICT_STYLE[h.result.verdict]
              const date = new Date(h.ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
              return (
                <div
                  key={i}
                  className={`interview-candidate-row ${selectedIdx === i ? 'active' : ''}`}
                  onClick={() => { setSelectedIdx(i); setGuide(null); setPostResult(null); setError(null) }}
                >
                  <span className="interview-row-icon">{vc?.icon}</span>
                  <span className="interview-row-name">{h.name || 'Sin nombre'}</span>
                  <span className="interview-row-score">{normalizeScore(h.result.fit_score)}/100</span>
                  <span className="interview-row-date">{date}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* Sub-tabs */}
          <div className="interview-subtabs">
            <button className={`tab ${subTab === 'pre' ? 'active' : ''}`} onClick={() => setSubTab('pre')}>📋 Pre-interview guide</button>
            <button className={`tab ${subTab === 'post' ? 'active' : ''}`} onClick={() => setSubTab('post')}>📝 Post-interview analysis</button>
          </div>

          {error && <p className="error-msg">{error}</p>}

          {/* PRE */}
          {subTab === 'pre' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="interview-candidate-banner">
                <span>{selected.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{selected.result.verdict} · Fit {normalizeScore(selected.result.fit_score)}/100</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={genGuide} disabled={guideLoading} style={{ alignSelf: 'flex-start' }}>
                {guideLoading ? '⏳ Generating…' : '✦ Generate interview guide'}
              </button>

              {guide && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {guide.quick_summary && (
                    <div className="interview-summary-box">
                      <div className="interview-section-label">Briefing</div>
                      <p className="prose">{guide.quick_summary}</p>
                    </div>
                  )}

                  {guide.must_validate?.length > 0 && (
                    <div className="result-section">
                      <h4>🔴 Must validate in this call</h4>
                      <ul className="simple-list gaps">
                        {guide.must_validate.map((v, i) => <li key={i}>{v}</li>)}
                      </ul>
                    </div>
                  )}

                  {guide.areas_to_probe?.map((area, i) => (
                    <div key={i} className="interview-probe-block">
                      <div className="interview-probe-header">
                        <span className="interview-probe-area">{area.area}</span>
                        <span className="interview-probe-why">{area.why}</span>
                      </div>
                      <ol className="screening-list">
                        {area.questions.map((q, j) => <li key={j}>{q}</li>)}
                      </ol>
                    </div>
                  ))}

                  {guide.salary_and_logistics?.length > 0 && (
                    <div className="result-section">
                      <h4>📋 Logistics to confirm</h4>
                      <ul className="simple-list">
                        {guide.salary_and_logistics.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="two-col">
                    {guide.green_flags_to_listen_for?.length > 0 && (
                      <div className="result-section">
                        <h4>✅ Green flags to listen for</h4>
                        <ul className="simple-list">
                          {guide.green_flags_to_listen_for.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {guide.red_flag_responses?.length > 0 && (
                      <div className="result-section">
                        <h4>🚩 Red flag responses</h4>
                        <ul className="simple-list gaps">
                          {guide.red_flag_responses.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* POST */}
          {subTab === 'post' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="interview-candidate-banner">
                <span>{selected.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{selected.result.verdict} · Fit {normalizeScore(selected.result.fit_score)}/100</span>
              </div>
              <textarea
                className="jd-textarea"
                rows={10}
                placeholder="Paste the interview transcript or your notes here…"
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={analyzePost} disabled={postLoading || !transcript.trim()} style={{ alignSelf: 'flex-start' }}>
                {postLoading ? '⏳ Analyzing…' : '✦ Analyze interview'}
              </button>

              {postResult && (() => {
                const dc = DECISION_STYLE[postResult.decision]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Decision banner */}
                    <div className="interview-decision-banner" style={{ borderColor: dc.color }}>
                      <span className="interview-decision-label" style={{ color: dc.color }}>
                        {dc.icon} {postResult.decision}
                      </span>
                      <span className="compare-confidence">Confidence: {postResult.confidence}</span>
                    </div>
                    <p className="prose">{postResult.decision_reason}</p>

                    <div className="two-col">
                      {postResult.gaps_resolved?.length > 0 && (
                        <div className="result-section">
                          <h4>✅ Gaps resolved</h4>
                          <ul className="simple-list">{postResult.gaps_resolved.map((g, i) => <li key={i}>{g}</li>)}</ul>
                        </div>
                      )}
                      {postResult.gaps_confirmed?.length > 0 && (
                        <div className="result-section">
                          <h4>⚠️ Gaps confirmed</h4>
                          <ul className="simple-list gaps">{postResult.gaps_confirmed.map((g, i) => <li key={i}>{g}</li>)}</ul>
                        </div>
                      )}
                    </div>

                    {postResult.new_concerns?.length > 0 && (
                      <div className="result-section">
                        <h4>🚩 New concerns from interview</h4>
                        <ul className="simple-list gaps">{postResult.new_concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
                      </div>
                    )}

                    {postResult.english_level && (
                      <div className="english-level-block">
                        <div className="english-level-header">
                          <span className="english-level-label">🗣 English level</span>
                          <span className="english-level-badge">{postResult.english_level.level}</span>
                          <span className="english-confidence">Confidence: {postResult.english_level.confidence}</span>
                        </div>
                        {postResult.english_level.summary && <p className="prose" style={{ marginTop: 6 }}>{postResult.english_level.summary}</p>}
                        {postResult.english_level.concerns && (
                          <p className="prose" style={{ color: 'var(--flag)', marginTop: 4, fontSize: 12 }}>⚠️ {postResult.english_level.concerns}</p>
                        )}
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
                          📢 Este análisis es solo de texto — pronunciación y acento requieren validación manual escuchando el audio.
                        </p>
                      </div>
                    )}

                    {postResult.standout_moments?.length > 0 && (
                      <div className="result-section">
                        <h4>⭐ Standout moments</h4>
                        <ul className="simple-list">{postResult.standout_moments.map((m, i) => <li key={i}>{m}</li>)}</ul>
                      </div>
                    )}

                    {postResult.logistics && (
                      <div className="result-section">
                        <h4>📋 Logistics</h4>
                        <div className="logistics-grid">
                          {postResult.logistics.salary_expectation && <div><span className="logistics-key">Salary</span> {postResult.logistics.salary_expectation}</div>}
                          {postResult.logistics.notice_period && <div><span className="logistics-key">Notice</span> {postResult.logistics.notice_period}</div>}
                          {postResult.logistics.availability && <div><span className="logistics-key">Availability</span> {postResult.logistics.availability}</div>}
                        </div>
                      </div>
                    )}

                    {/* Notes grid */}
                    {(postResult.bamboohr_note || postResult.client_presentation || postResult.client_pitch) && (
                      <div className="note-grid">
                        {postResult.bamboohr_note && (
                          <div className="note-block">
                            <div className="note-header">
                              <h4>🗂 BambooHR Note</h4>
                              <button className="btn btn-ghost btn-xs" onClick={() => copyText(postResult.bamboohr_note, setCopied, 'bamboo')}>
                                {copied === 'bamboo' ? '✓ Copiado' : 'Copiar'}
                              </button>
                            </div>
                            <pre className="note-pre">{postResult.bamboohr_note}</pre>
                          </div>
                        )}
                        {(postResult.client_presentation || postResult.client_pitch) && (
                          <div className="note-block">
                            <div className="note-header">
                              <h4>💬 Slack — Client Presentation</h4>
                              <button className="btn btn-ghost btn-xs" onClick={() => copyText(postResult.client_presentation || postResult.client_pitch, setCopied, 'pitch')}>
                                {copied === 'pitch' ? '✓ Copiado' : 'Copiar'}
                              </button>
                            </div>
                            <pre className="note-pre">{postResult.client_presentation || postResult.client_pitch}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    {postResult.next_step && (
                      <div className="compare-rec">
                        <div className="compare-rec-title">Next step</div>
                        <p className="prose">{postResult.next_step}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => downloadText(
                          buildInterviewReport(postResult, selected?.name, role),
                          `interview_${(selected?.name || 'candidate').replace(/\s+/g, '_')}_${Date.now()}.txt`
                        )}
                      >
                        ⬇ Download report
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const PIPELINE_STAGES = [
  { id: 'sourced',      label: '📥 Sourced',       color: 'var(--muted)' },
  { id: 'screened',     label: '📋 Screened',       color: 'var(--accent)' },
  { id: 'phone_screen', label: '📞 Phone Screen',   color: '#a78bfa' },
  { id: 'technical',    label: '💻 Technical',       color: 'var(--flag)' },
  { id: 'offer',        label: '📄 Offer',           color: '#34d399' },
  { id: 'hired',        label: '✅ Hired',           color: 'var(--pass)' },
  { id: 'rejected',     label: '❌ Rejected',        color: 'var(--nope)' },
]

function PipelinePanel({ role }) {
  const [history] = useLocalStorage(`history_${role.id}`, [])
  const [cards, setCards] = useLocalStorage(`pipeline_${role.id}`, [])
  const [draggingId, setDraggingId] = useState(null)
  const [addingStage, setAddingStage] = useState(null)
  const [newName, setNewName] = useState('')

  // Sync screened candidates from history automatically
  useEffect(() => {
    const passed = history.filter(h => h.result.verdict === 'Pass' || h.result.verdict === 'Flag for Review')
    setCards(prev => {
      const existingNames = new Set(prev.map(c => c.name))
      const toAdd = passed
        .filter(h => !existingNames.has(h.name) && h.name)
        .map(h => ({
          id: `${h.ts}_${h.name}`,
          name: h.name,
          stage: 'screened',
          fit_score: h.result.fit_score,
          verdict: h.result.verdict,
          ts: h.ts,
          notes: '',
        }))
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev
    })
  }, [history.length])

  const moveCard = (cardId, targetStage) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, stage: targetStage } : c))
  }

  const addManual = (stage) => {
    if (!newName.trim()) return
    setCards(prev => [...prev, {
      id: `manual_${Date.now()}`,
      name: newName.trim(),
      stage,
      fit_score: null,
      verdict: 'Manual',
      ts: Date.now(),
      notes: '',
    }])
    setNewName('')
    setAddingStage(null)
  }

  const removeCard = (id) => setCards(prev => prev.filter(c => c.id !== id))

  const activeStages = PIPELINE_STAGES.filter(s => s.id !== 'rejected')
  const stageCards = (stageId) => cards.filter(c => c.stage === stageId)
  const rejected = stageCards('rejected')

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>🗂 Pipeline</h3>
        <span className="panel-role-tag">{role.title}</span>
      </div>
      <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
        Los candidatos que pasan el screening aparecen automáticamente. Arrastrá las tarjetas para moverlas de etapa.
      </p>

      <div className="kanban-board">
        {activeStages.map(stage => {
          const stageList = stageCards(stage.id)
          return (
            <div
              key={stage.id}
              className="kanban-col"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                if (draggingId) moveCard(draggingId, stage.id)
                setDraggingId(null)
              }}
            >
              <div className="kanban-col-header" style={{ borderTop: `3px solid ${stage.color}` }}>
                <span className="kanban-col-title">{stage.label}</span>
                <span className="kanban-col-count">{stageList.length}</span>
              </div>

              <div className="kanban-cards">
                {stageList.map(card => (
                  <div
                    key={card.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => setDraggingId(card.id)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <div className="kanban-card-top">
                      <span className="kanban-card-name">{card.name}</span>
                      <button className="btn-icon-sm" onClick={() => removeCard(card.id)}>✕</button>
                    </div>
                    {card.fit_score && (
                      <span className="kanban-card-score" style={{ color: scoreColor(normalizeScore(card.fit_score)) }}>
                        {normalizeScore(card.fit_score)}/100
                      </span>
                    )}
                    <div className="kanban-card-actions">
                      <select
                        className="kanban-move-select"
                        value={card.stage}
                        onChange={e => moveCard(card.id, e.target.value)}
                      >
                        {PIPELINE_STAGES.map(s => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                {addingStage === stage.id ? (
                  <div className="kanban-add-form">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nombre del candidato"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addManual(stage.id); if (e.key === 'Escape') setAddingStage(null) }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-xs" onClick={() => addManual(stage.id)}>Add</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setAddingStage(null)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button className="kanban-add-btn" onClick={() => { setAddingStage(stage.id); setNewName('') }}>
                    + Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {rejected.length > 0 && (
        <div className="kanban-rejected">
          <span className="kanban-rejected-label">❌ Rejected ({rejected.length})</span>
          {rejected.map(c => (
            <span key={c.id} className="kanban-rejected-chip">
              {c.name}
              <button className="btn-icon-sm" onClick={() => removeCard(c.id)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ComparePanel({ role, apiKey }) {
  const [a, setA] = useState({ name: '', text: '', loading: false })
  const [b, setB] = useState({ name: '', text: '', loading: false })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const refA = useRef()
  const refB = useRef()

  const loadPdf = async (file, side) => {
    const setter = side === 'a' ? setA : setB
    setter(s => ({ ...s, loading: true }))
    try {
      const text = await extractTextFromPDF(file)
      const nameGuess = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ').replace(/cv|resume|profile/gi, '').trim()
      setter(s => ({ ...s, text, name: s.name || nameGuess, loading: false }))
    } catch (e) {
      setter(s => ({ ...s, loading: false }))
      setError('Failed to read PDF: ' + e.message)
    }
  }

  const compare = async () => {
    if (!apiKey) return setError('Save your API key first.')
    if (!a.text.trim() || !b.text.trim()) return setError('Upload or paste both CVs first.')
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await compareCVs(a.text, a.name || 'Candidate A', b.text, b.name || 'Candidate B', role, apiKey)
      setResult(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const WINNER_COLORS = { A: 'var(--pass)', B: 'var(--accent)', Tie: 'var(--flag)' }

  const CandidateCard = ({ data, side, candidate }) => {
    const isWinner = result?.winner === side
    const vc = candidate ? VERDICT_STYLE[candidate.verdict] : null
    return (
      <div className={`compare-card ${isWinner ? 'compare-winner' : ''}`}>
        {isWinner && <div className="compare-winner-badge">🏆 Winner</div>}
        <div className="compare-card-name">{candidate?.name || data.name || `Candidate ${side}`}</div>
        {candidate && (
          <>
            <div className="compare-card-score">
              <span style={{ color: vc?.color }}>{vc?.icon} {candidate.verdict}</span>
              <span className="compare-score-num">{normalizeScore(candidate.fit_score)}/100</span>
            </div>
            {candidate.standout && (
              <div className="compare-standout">⭐ {candidate.standout}</div>
            )}
            <div className="two-col" style={{ gap: 8, marginTop: 10 }}>
              {candidate.strengths?.length > 0 && (
                <div>
                  <div className="compare-list-label">Strengths</div>
                  <ul className="simple-list">{candidate.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              {candidate.gaps?.length > 0 && (
                <div>
                  <div className="compare-list-label">Gaps</div>
                  <ul className="simple-list gaps">{candidate.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>⚖️ Compare two CVs</h3>
        <span className="panel-role-tag">{role.title}</span>
      </div>

      <div className="compare-upload-row">
        {[['a', a, setA, refA], ['b', b, setB, refB]].map(([side, data, setter, ref]) => (
          <div key={side} className="compare-upload-card">
            <div className="compare-upload-label">Candidate {side.toUpperCase()}</div>
            <input
              type="text"
              className="candidate-name-input"
              placeholder={`Name (optional)`}
              value={data.name}
              onChange={e => setter(s => ({ ...s, name: e.target.value }))}
            />
            <input ref={ref} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) loadPdf(e.target.files[0], side); e.target.value = '' }} />
            <button className="btn btn-ghost btn-sm" onClick={() => ref.current.click()} disabled={data.loading}>
              {data.loading ? '⏳ Reading…' : data.text ? '📎 Replace PDF' : '📎 Upload PDF'}
            </button>
            {data.text && <div className="compare-cv-loaded">✓ CV loaded ({Math.round(data.text.length / 100) / 10}k chars)</div>}
            <textarea
              className="jd-textarea"
              style={{ marginTop: 8 }}
              placeholder="…or paste CV text here"
              rows={5}
              value={data.text}
              onChange={e => setter(s => ({ ...s, text: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {error && <p className="error-msg">{error}</p>}
      <button className="btn btn-primary" onClick={compare} disabled={loading || !a.text || !b.text}>
        {loading ? '⏳ Comparing…' : '⚖️ Compare candidates'}
      </button>

      {result && (
        <div className="compare-result">
          {/* Winner banner */}
          <div className="compare-banner" style={{ borderColor: WINNER_COLORS[result.winner] }}>
            <span className="compare-banner-label" style={{ color: WINNER_COLORS[result.winner] }}>
              {result.winner === 'Tie' ? '🤝 Tie' : `🏆 ${result.winner_name} wins`}
            </span>
            <span className="compare-confidence">Confidence: {result.confidence}</span>
          </div>
          <p className="prose" style={{ marginTop: 10 }}>{result.summary}</p>

          {/* Side by side */}
          <div className="compare-cards">
            <CandidateCard data={a} side="A" candidate={result.candidate_a} />
            <CandidateCard data={b} side="B" candidate={result.candidate_b} />
          </div>

          {/* Recommendation */}
          <div className="compare-rec">
            <div className="compare-rec-title">📌 Recommendation</div>
            <p className="prose">{result.recommendation}</p>
            {result.if_you_can_only_pick_one && (
              <div className="compare-pick-one">
                <strong>If you can only pick one:</strong> {result.if_you_can_only_pick_one}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RoleDetail({ role, apiKey, ninjaPearKey, onUpdate }) {
  const [tab, setTab] = useState('screen')
  const [extras, setExtras] = useState(role.extra_requirements || '')
  const [locationOverride, setLocationOverride] = useState(role.location_override || '')
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    setExtras(role.extra_requirements || '')
    setLocationOverride(role.location_override || '')
    setSaved(true)
  }, [role.id])
  const [rejName, setRejName] = useState('')
  const [rejFeedback, setRejFeedback] = useState('')
  const [rejAnalysis, setRejAnalysis] = useState(null)
  const [rejAnalysisLoading, setRejAnalysisLoading] = useState(false)
  const [rejError, setRejError] = useState(null)
  const rejFeedbacks = role.rejection_feedback || []

  const addRejection = () => {
    if (!rejName.trim() || !rejFeedback.trim()) return
    const updated = [...rejFeedbacks, { name: rejName.trim(), feedback: rejFeedback.trim(), ts: Date.now() }]
    onUpdate({ ...role, rejection_feedback: updated })
    setRejName('')
    setRejFeedback('')
  }

  const deleteRejection = (i) => {
    const updated = rejFeedbacks.filter((_, idx) => idx !== i)
    onUpdate({ ...role, rejection_feedback: updated })
  }

  const runRejectionAnalysis = async () => {
    if (!apiKey) return setRejError('Save your API key first.')
    if (rejFeedbacks.length < 2) return setRejError('Agregá al menos 2 feedbacks para detectar patrones.')
    setRejAnalysisLoading(true); setRejError(null); setRejAnalysis(null)
    try {
      const r = await analyzeRejections(rejFeedbacks, role, apiKey)
      setRejAnalysis(r)
    } catch (e) { setRejError(e.message) }
    finally { setRejAnalysisLoading(false) }
  }

  const saveExtras = () => {
    onUpdate({ ...role, extra_requirements: extras, location_override: locationOverride })
    setSaved(true)
  }

  const effectiveLocation = locationOverride || role.location
  const effectiveLocationType = locationOverride
    ? (locationOverride.toLowerCase().includes('latam') && locationOverride.toLowerCase().includes('canada') ? 'latam_canada'
      : locationOverride.toLowerCase().includes('latam') ? 'latam'
      : locationOverride.toLowerCase().includes('canada') || locationOverride.toLowerCase().includes('us') ? 'us_canada'
      : 'other')
    : role.location_type

  const enrichedRole = { ...role, extra_requirements: extras, location: effectiveLocation, location_type: effectiveLocationType }

  return (
    <div className="role-detail">
      <div className="role-detail-header">
        <div>
          <h2>{role.title}</h2>
          <div className="role-detail-meta">
            {role.company && <span>{role.company}</span>}
            <span>{LOC_LABEL[role.location_type] || role.location}</span>
            {role.seniority && <span>{role.seniority}</span>}
            {role.years_experience_min && <span>{role.years_experience_min}+ yrs</span>}
          </div>
        </div>
        <div className="tab-bar">
          <button className={`tab ${tab === 'screen' ? 'active' : ''}`} onClick={() => setTab('screen')}>📋 Screen CV</button>
          <button className={`tab ${tab === 'pipeline' ? 'active' : ''}`} onClick={() => setTab('pipeline')}>🗂 Pipeline</button>
          <button className={`tab ${tab === 'interview' ? 'active' : ''}`} onClick={() => setTab('interview')}>🎤 Interview</button>
          <button className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>⚖️ Compare</button>
          <button className={`tab ${tab === 'sourcing' ? 'active' : ''}`} onClick={() => setTab('sourcing')}>🔍 Sourcing</button>
          <button className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>ℹ Info</button>
        </div>
      </div>

      {tab === 'screen' && <ScreeningPanel role={enrichedRole} apiKey={apiKey} />}
      {tab === 'pipeline' && <PipelinePanel role={enrichedRole} />}
      {tab === 'interview' && <InterviewPanel role={enrichedRole} apiKey={apiKey} />}
      {tab === 'compare' && <ComparePanel role={enrichedRole} apiKey={apiKey} />}
      {tab === 'sourcing' && (
        <>
          <BooleanPanel role={enrichedRole} apiKey={apiKey} />
          <TargetCompaniesPanel />
          <SourcingAutopilot role={enrichedRole} apiKey={apiKey} ninjaPearKey={ninjaPearKey} />
        </>
      )}
      {tab === 'info' && (
        <div className="panel">
          <div className="two-col">
            <div className="result-section">
              <h4>Must Have</h4>
              <ul className="simple-list">{role.must_have?.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            <div className="result-section">
              <h4>Nice to Have</h4>
              <ul className="simple-list">{role.nice_to_have?.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          </div>
          <div className="result-section">
            <h4>Key Technologies</h4>
            <div className="tag-list">{role.key_technologies?.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
          </div>
          {role.timezone_requirement && (
            <div className="result-section">
              <h4>Timezone</h4>
              <p className="prose">{role.timezone_requirement}</p>
            </div>
          )}
          {role.summary && (
            <div className="result-section">
              <h4>Summary</h4>
              <p className="prose">{role.summary}</p>
            </div>
          )}
          <div className="result-section">
            <h4>Location Override</h4>
            <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              Override the location parsed from the JD. Use plain text, e.g. "LATAM + Canada" or "US, Canada, Argentina".
            </p>
            <input
              type="text"
              placeholder={`Current: ${role.location || role.location_type || 'not set'}`}
              value={locationOverride}
              onChange={e => { setLocationOverride(e.target.value); setSaved(false) }}
            />
          </div>

          <div className="result-section">
            <h4>Additional Requirements</h4>
            <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              Extra context injected into every screening and sourcing prompt (e.g. "agency experience required").
            </p>
            <textarea
              className="jd-textarea"
              rows={3}
              placeholder="e.g. Agency experience required. Must have worked in a client-facing consultancy environment."
              value={extras}
              onChange={e => { setExtras(e.target.value); setSaved(false) }}
            />
            <button className="btn btn-primary btn-sm" onClick={saveExtras} disabled={saved}>
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>

          {/* Client rejection feedback */}
          <div className="result-section">
            <h4>❌ Client Rejection Feedback</h4>
            <p className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Pegá el feedback del líder técnico cuando rechaza a un candidato. Se inyecta en el screening y en los booleans automáticamente.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Nombre del candidato rechazado"
                value={rejName}
                onChange={e => setRejName(e.target.value)}
              />
              <textarea
                className="jd-textarea"
                rows={3}
                placeholder="Feedback del cliente / líder técnico (copiado de Bamboo o Slack)"
                value={rejFeedback}
                onChange={e => setRejFeedback(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" onClick={addRejection} disabled={!rejName.trim() || !rejFeedback.trim()} style={{ alignSelf: 'flex-start' }}>
                + Agregar feedback
              </button>
            </div>

            {rejFeedbacks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {rejFeedbacks.map((f, i) => (
                  <div key={i} className="rejection-entry">
                    <div className="rejection-entry-top">
                      <span className="rejection-name">❌ {f.name}</span>
                      <span className="rejection-date">{new Date(f.ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                      <button className="btn-icon-sm" onClick={() => deleteRejection(i)}>✕</button>
                    </div>
                    <p className="rejection-feedback-text">{f.feedback}</p>
                  </div>
                ))}
              </div>
            )}

            {rejFeedbacks.length >= 2 && (
              <div>
                <button className="btn btn-primary btn-sm" onClick={runRejectionAnalysis} disabled={rejAnalysisLoading}>
                  {rejAnalysisLoading ? '⏳ Analizando…' : `✦ Analizar patrones (${rejFeedbacks.length} rechazos)`}
                </button>
                {rejError && <p className="error-msg" style={{ marginTop: 8 }}>{rejError}</p>}
                {rejAnalysis && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                    {rejAnalysis.summary && (
                      <div className="interview-summary-box">
                        <div className="interview-section-label">Lo que realmente busca el cliente</div>
                        <p className="prose">{rejAnalysis.summary}</p>
                      </div>
                    )}
                    <div className="two-col">
                      {rejAnalysis.hidden_must_haves?.length > 0 && (
                        <div className="result-section">
                          <h4>🔴 Mover a must-have</h4>
                          <ul className="simple-list gaps">{rejAnalysis.hidden_must_haves.map((x, i) => <li key={i}>{x}</li>)}</ul>
                        </div>
                      )}
                      {rejAnalysis.false_must_haves?.length > 0 && (
                        <div className="result-section">
                          <h4>✅ No es tan crítico</h4>
                          <ul className="simple-list">{rejAnalysis.false_must_haves.map((x, i) => <li key={i}>{x}</li>)}</ul>
                        </div>
                      )}
                    </div>
                    {rejAnalysis.patterns?.length > 0 && (
                      <div className="result-section">
                        <h4>📈 Patrones de rechazo</h4>
                        <ul className="simple-list gaps">{rejAnalysis.patterns.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                    {rejAnalysis.screening_adjustments?.length > 0 && (
                      <div className="result-section">
                        <h4>⚙️ Ajustes recomendados al screening</h4>
                        <ul className="simple-list">{rejAnalysis.screening_adjustments.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const ENV_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
  const [apiKey, setApiKey] = useLocalStorage('anthropic_key', ENV_KEY)
  const [ninjaPearKey, setNinjaPearKey] = useLocalStorage('ninjapear_key', '')
  const [roles, setRoles] = useLocalStorage('roles', [])
  const [activeId, setActiveId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [npVal, setNpVal] = useState(ninjaPearKey)

  const saveKey = (k) => setApiKey(k.replace(/[^\x20-\x7E]/g, '').trim())

  const addRole = (role) => {
    setRoles(r => [role, ...r])
    setActiveId(role.id)
    setShowAdd(false)
  }

  const updateRole = (updated) => {
    setRoles(r => r.map(x => x.id === updated.id ? updated : x))
  }

  const deleteRole = (id) => {
    setRoles(r => r.filter(x => x.id !== id))
    if (activeId === id) setActiveId(roles.find(x => x.id !== id)?.id ?? null)
  }

  const activeRole = roles.find(r => r.id === activeId)
  const showMetrics = activeId === '__metrics__'

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="logo-block">
            <span className="logo">🎯 Recruiter</span>
          </div>
          {!ENV_KEY && <ApiKeyBar apiKey={apiKey} onSave={saveKey} />}
          {!ENV_KEY && (
            <div className="apikey-bar" style={{ marginTop: 6 }}>
              <input type="password" placeholder="NinjaPear key…" value={npVal}
                onChange={e => setNpVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setNinjaPearKey(npVal.replace(/[^\x20-\x7E]/g, '').trim())} />
              <button className="btn btn-primary btn-sm" onClick={() => setNinjaPearKey(npVal.replace(/[^\x20-\x7E]/g, '').trim())}>
                {npVal === ninjaPearKey && !!ninjaPearKey ? '✓' : 'NP'}
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-roles">
          {/* Metrics link */}
          <div
            className={`role-card ${showMetrics ? 'active' : ''}`}
            onClick={() => { setActiveId('__metrics__'); setShowAdd(false) }}
            style={{ marginBottom: 8 }}
          >
            <div className="role-card-top">
              <span className="role-card-title">📊 Metrics & Reports</span>
            </div>
            <div className="role-card-meta"><span>Daily summary · Pipeline</span></div>
          </div>

          <div className="sidebar-section-header">
            <span>Open Roles</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(v => !v)}>
              {showAdd ? '✕' : '+ Add'}
            </button>
          </div>

          {showAdd && (
            <JDUploader apiKey={apiKey} onParsed={addRole} />
          )}

          {roles.length === 0 && !showAdd && (
            <p className="sidebar-empty">No roles yet. Add one to get started.</p>
          )}

          {roles.map(r => (
            <RoleCard
              key={r.id}
              role={r}
              active={r.id === activeId}
              onClick={() => { setActiveId(r.id); setShowAdd(false) }}
              onDelete={() => deleteRole(r.id)}
            />
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <DailyBanner roles={roles} />
        {showMetrics ? (
          <MetricsDashboard roles={roles} apiKey={apiKey} />
        ) : activeRole ? (
          <RoleDetail role={activeRole} apiKey={apiKey} ninjaPearKey={ninjaPearKey} onUpdate={updateRole} />
        ) : (
          <div className="empty-state">
            <p className="empty-icon">🎯</p>
            <p>Select a role or add a new one to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              + Add your first role
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
