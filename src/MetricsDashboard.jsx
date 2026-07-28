import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  getAllScreenings, getSourcingLog, getLowVolumeNotes,
  saveLowVolumeNote, buildDailyReport, isToday, isThisWeek, formatDate,
  saveBitacoraEntry, getBitacoraEntries, deleteBitacoraEntry
} from './metrics'
import { analyzeBitacora } from './api'
import { exportAllToExcel } from './export'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <span className="stat-card-value" style={{ color: color || 'var(--text)' }}>{value}</span>
      <span className="stat-card-label">{label}</span>
      {sub && <span className="stat-card-sub">{sub}</span>}
    </div>
  )
}

function MiniBar({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="mini-bar-row">
      <span className="mini-bar-label">{label}</span>
      <div className="mini-bar-track">
        <div className="mini-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mini-bar-num">{value}</span>
    </div>
  )
}

const STAGE_COLOR = {
  'Pass': 'var(--pass)',
  '1. RS- Submitted': 'var(--pass)',
  '5. OL- Accepted': 'var(--pass)',
  '0. Rejected': 'var(--nope)',
  '1. RS- Rejected': 'var(--nope)',
  '2. PS- Rejected': 'var(--nope)',
  '3. TS- Rejected': 'var(--nope)',
  '4. CI- Rejected': 'var(--nope)',
  '5. OL- Rejected': 'var(--nope)',
}

function TrackerTab() {
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')
  const [filterPosition, setFilterPosition] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/tracker-data.json')
      .then(r => r.json())
      .then(setCandidates)
      .catch(() => {})
  }, [])

  const positions = useMemo(() => [...new Set(candidates.map(c => c.position).filter(Boolean))].sort(), [candidates])
  const stages = useMemo(() => [...new Set(candidates.map(c => c.stage).filter(Boolean))].sort(), [candidates])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return candidates.filter(c => {
      if (filterPosition && c.position !== filterPosition) return false
      if (filterStage && c.stage !== filterStage) return false
      if (q && !c.name.toLowerCase().includes(q) &&
               !c.company.toLowerCase().includes(q) &&
               !c.location.toLowerCase().includes(q) &&
               !c.position.toLowerCase().includes(q)) return false
      return true
    })
  }, [candidates, search, filterPosition, filterStage])

  const stageColor = (stage) => {
    if (!stage) return 'var(--muted)'
    if (stage.includes('Accepted') || stage === '1. RS- Submitted') return 'var(--pass)'
    if (stage.includes('Rejected') || stage === '0. Rejected') return 'var(--nope)'
    if (stage.includes('Scheduled') || stage.includes('Submitted') || stage.includes('Approved')) return 'var(--flag)'
    return 'var(--muted)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="metrics-panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Buscar por nombre, empresa, ubicación…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select className="bitacora-role-select" value={filterPosition} onChange={e => setFilterPosition(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Todos los roles</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="bitacora-role-select" value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Todos los stages</option>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{filtered.length} de {candidates.length}</span>
        </div>

        <div className="tracker-table">
          <div className="tracker-header">
            <span>Nombre</span>
            <span>Rol</span>
            <span>Ubicación</span>
            <span>Stage</span>
            <span>RS Date</span>
          </div>
          {filtered.slice(0, 200).map((c, i) => (
            <div key={i}>
              <div className="tracker-row" onClick={() => setExpanded(expanded === i ? null : i)}>
                <span className="tracker-name">{c.name}</span>
                <span className="tracker-role">{c.position}</span>
                <span className="tracker-loc">{c.location}</span>
                <span className="tracker-stage" style={{ color: stageColor(c.stage) }}>{c.stage}</span>
                <span className="tracker-date">{c.rs_date}</span>
              </div>
              {expanded === i && (
                <div className="tracker-detail">
                  {c.company && <div><span className="logistics-key">Empresa</span>{c.company}</div>}
                  {c.email && <div><span className="logistics-key">Email</span>{c.email}</div>}
                  {c.url && <div><span className="logistics-key">LinkedIn</span><a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{c.url}</a></div>}
                  {c.yoe && <div><span className="logistics-key">YoE</span>{c.yoe}</div>}
                  {c.comp_usd && <div><span className="logistics-key">Comp USD</span>{c.comp_usd}</div>}
                  {c.rejection && <div><span className="logistics-key">Rejection</span>{c.rejection}</div>}
                  {c.comments && <div><span className="logistics-key">Comments</span>{c.comments}</div>}
                  {c.portfolio && <div><span className="logistics-key">Portfolio</span><a href={c.portfolio} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{c.portfolio}</a></div>}
                </div>
              )}
            </div>
          ))}
          {filtered.length > 200 && (
            <div className="tracker-row" style={{ color: 'var(--muted)', justifyContent: 'center' }}>
              Mostrando 200 de {filtered.length} — usá los filtros para reducir
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BitacoraTab({ roles, apiKey }) {
  const [entries, setEntries] = useState(() => getBitacoraEntries())
  const [text, setText] = useState('')
  const [roleTag, setRoleTag] = useState('')
  const [analysisPeriod, setAnalysisPeriod] = useState('week')
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const textRef = useRef()

  const save = () => {
    if (!text.trim()) return
    saveBitacoraEntry(text.trim(), roleTag || null)
    setEntries(getBitacoraEntries())
    setText('')
    setRoleTag('')
    textRef.current?.focus()
  }

  const deleteEntry = (id) => {
    deleteBitacoraEntry(id)
    setEntries(getBitacoraEntries())
  }

  const runAnalysis = async () => {
    if (!apiKey) return setAnalysisError('Save your API key first.')
    const now = Date.now()
    const cutoff = analysisPeriod === 'today'
      ? now - 86400000
      : analysisPeriod === 'week'
      ? now - 7 * 86400000
      : now - 30 * 86400000
    const toAnalyze = entries.filter(e => e.ts >= cutoff)
    if (toAnalyze.length === 0) return setAnalysisError('No entries in this period yet.')
    setAnalysisLoading(true); setAnalysisError(null); setAnalysis(null)
    try {
      const r = await analyzeBitacora(toAnalyze, analysisPeriod, apiKey)
      setAnalysis(r)
    } catch (e) { setAnalysisError(e.message) }
    finally { setAnalysisLoading(false) }
  }

  // Group entries by date
  const grouped = useMemo(() => {
    const map = {}
    for (const e of entries) {
      const key = new Date(e.ts).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [entries])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Entry input */}
      <div className="metrics-panel">
        <h3>📓 Nueva entrada</h3>
        <p className="metrics-hint">Anotá lo que pasó hoy — candidatos, entrevistas, respuestas del cliente, lo que sea. Texto libre.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select
            className="bitacora-role-select"
            value={roleTag}
            onChange={e => setRoleTag(e.target.value)}
          >
            <option value="">Sin rol</option>
            {roles.map(r => <option key={r.id} value={r.title}>{r.title}</option>)}
          </select>
        </div>
        <textarea
          ref={textRef}
          className="jd-textarea"
          rows={4}
          placeholder="Ej: Entrevisté a Juan García para Backend — muy bueno, lo presento. AJ rechazado por el cliente porque no tiene Shopify. Fabio no contestó el follow-up de hace 3 días…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
        />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!text.trim()} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          Guardar entrada
        </button>
        <p className="metrics-hint" style={{ marginTop: 4 }}>Cmd+Enter para guardar rápido</p>
      </div>

      {/* Analysis */}
      <div className="metrics-panel">
        <div className="report-header">
          <h3>🔍 Analizar entradas</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="bitacora-role-select" value={analysisPeriod} onChange={e => setAnalysisPeriod(e.target.value)}>
              <option value="today">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={runAnalysis} disabled={analysisLoading}>
              {analysisLoading ? '⏳ Analizando…' : '✦ Analizar'}
            </button>
          </div>
        </div>
        {analysisError && <p className="error-msg">{analysisError}</p>}
        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {analysis.summary && (
              <div className="interview-summary-box">
                <div className="interview-section-label">Resumen del período</div>
                <p className="prose">{analysis.summary}</p>
              </div>
            )}
            <div className="two-col">
              {analysis.pending?.length > 0 && (
                <div className="result-section">
                  <h4>🔴 Pendientes</h4>
                  <ul className="simple-list gaps">{analysis.pending.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {analysis.tomorrow_focus?.length > 0 && (
                <div className="result-section">
                  <h4>🎯 Foco para mañana</h4>
                  <ul className="simple-list">{analysis.tomorrow_focus.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
            </div>
            {analysis.highlights?.length > 0 && (
              <div className="result-section">
                <h4>✅ Lo que salió bien</h4>
                <ul className="simple-list">{analysis.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            )}
            {analysis.patterns?.length > 0 && (
              <div className="result-section">
                <h4>📈 Patrones detectados</h4>
                <ul className="simple-list">{analysis.patterns.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            {analysis.watch_out?.length > 0 && (
              <div className="result-section">
                <h4>⚠️ No perder de vista</h4>
                <ul className="simple-list gaps">{analysis.watch_out.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log history */}
      {Object.keys(grouped).length > 0 && (
        <div className="metrics-panel">
          <h3>📅 Historial</h3>
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date} className="bitacora-day-group">
              <div className="bitacora-day-label">{date}</div>
              {dayEntries.map(e => (
                <div key={e.id} className="bitacora-entry">
                  <div className="bitacora-entry-body">
                    {e.roleTag && <span className="bitacora-role-chip">{e.roleTag}</span>}
                    <span className="bitacora-entry-text">{e.text}</span>
                  </div>
                  <div className="bitacora-entry-meta">
                    <span>{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button className="btn-icon-sm" onClick={() => deleteEntry(e.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MetricsDashboard({ roles, apiKey }) {
  const [period, setPeriod] = useState('today')
  const [activeTab, setActiveTab] = useState('metrics')
  const [noteText, setNoteText] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportText, setReportText] = useState('')

  const allScreenings = useMemo(() => getAllScreenings(roles), [roles])
  const sourcingLog = useMemo(() => getSourcingLog(), [])
  const lowVolumeNotes = useMemo(() => getLowVolumeNotes(), [])

  const filtered = period === 'today'
    ? allScreenings.filter(s => isToday(s.ts))
    : period === 'week'
    ? allScreenings.filter(s => isThisWeek(s.ts))
    : allScreenings

  const pass   = filtered.filter(s => s.result.verdict === 'Pass').length
  const noPass = filtered.filter(s => s.result.verdict === 'No Pass').length
  const flag   = filtered.filter(s => s.result.verdict === 'Flag for Review').length
  const fakeHigh = filtered.filter(s => s.result.fake_profile_risk === 'High').length
  const fakeMed  = filtered.filter(s => s.result.fake_profile_risk === 'Medium').length

  const byRole = useMemo(() => {
    const map = {}
    for (const s of filtered) {
      const t = s.role.title
      if (!map[t]) map[t] = { pass: 0, noPass: 0, flag: 0, fake: 0, total: 0 }
      map[t].total++
      if (s.result.verdict === 'Pass') map[t].pass++
      else if (s.result.verdict === 'No Pass') map[t].noPass++
      else map[t].flag++
      if (s.result.fake_profile_risk === 'High') map[t].fake++
    }
    return map
  }, [filtered])

  const filteredSourcing = period === 'today'
    ? sourcingLog.filter(s => isToday(s.ts))
    : period === 'week'
    ? sourcingLog.filter(s => isThisWeek(s.ts))
    : sourcingLog

  const saveNote = () => {
    if (!noteText.trim()) return
    saveLowVolumeNote(noteText.trim())
    setNoteText('')
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  const generateReport = () => {
    const note = noteText.trim() || lowVolumeNotes[0]?.note || ''
    const text = buildDailyReport(roles, allScreenings, sourcingLog, note)
    setReportText(text)
  }

  const copyReport = () => {
    navigator.clipboard.writeText(reportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="metrics-dashboard">
      <div className="metrics-header">
        <h2>📊 Metrics & Reports</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportAllToExcel(roles)} title="Exportar todo el historial">
            📥 Base completa
          </button>
        </div>
        <div className="tab-bar">
          <button className={`tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>📊 Métricas</button>
          <button className={`tab ${activeTab === 'tracker' ? 'active' : ''}`} onClick={() => setActiveTab('tracker')}>📁 Tracker</button>
          <button className={`tab ${activeTab === 'bitacora' ? 'active' : ''}`} onClick={() => setActiveTab('bitacora')}>📓 Bitácora</button>
        </div>
      </div>

      {activeTab === 'tracker' && <TrackerTab />}
      {activeTab === 'bitacora' && <BitacoraTab roles={roles} apiKey={apiKey} />}

      {activeTab === 'metrics' && <>
      <div className="period-toggle">
        {['today', 'week', 'all'].map(p => (
          <button key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'All time'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="stat-cards">
        <StatCard label="Reviewed" value={filtered.length} sub={`${pass + flag + noPass} total`} />
        <StatCard label="Pass" value={pass} color="var(--pass)" sub={filtered.length ? `${Math.round(pass/filtered.length*100)}%` : '—'} />
        <StatCard label="Flag" value={flag} color="var(--flag)" sub={filtered.length ? `${Math.round(flag/filtered.length*100)}%` : '—'} />
        <StatCard label="No Pass" value={noPass} color="var(--nope)" sub={filtered.length ? `${Math.round(noPass/filtered.length*100)}%` : '—'} />
        <StatCard label="Fake / High risk" value={fakeHigh} color="var(--nope)" sub={fakeMed ? `+${fakeMed} medium` : undefined} />
        <StatCard label="Sourcing sessions" value={filteredSourcing.length} />
      </div>

      {/* Pipeline by role */}
      {Object.keys(byRole).length > 0 && (
        <div className="metrics-panel">
          <h3>Pipeline by role</h3>
          {Object.entries(byRole).map(([title, r]) => (
            <div key={title} className="role-pipeline">
              <div className="role-pipeline-title">
                <span>{title}</span>
                <span className="role-pipeline-total">{r.total} reviewed</span>
              </div>
              <MiniBar label="Pass"   value={r.pass}   total={r.total} color="var(--pass)" />
              <MiniBar label="Flag"   value={r.flag}   total={r.total} color="var(--flag)" />
              <MiniBar label="No Pass" value={r.noPass} total={r.total} color="var(--nope)" />
              {r.fake > 0 && <MiniBar label="Fake (High)" value={r.fake} total={r.total} color="#c084fc" />}
            </div>
          ))}
        </div>
      )}

      {/* Sourcing log */}
      {filteredSourcing.length > 0 && (
        <div className="metrics-panel">
          <h3>Sourcing activity</h3>
          <div className="sourcing-log">
            {filteredSourcing.map((s, i) => {
              const role = roles.find(r => r.id === s.roleId)
              return (
                <div key={i} className="sourcing-log-row">
                  <span className="sourcing-log-role">{role?.title || 'Unknown'}</span>
                  {s.note && <span className="sourcing-log-note">{s.note}</span>}
                  <span className="sourcing-log-time">{new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Low volume notes */}
      <div className="metrics-panel">
        <h3>Low volume / sourcing notes</h3>
        <p className="metrics-hint">Add context about why volume is low — this gets included in the daily report.</p>
        <div className="note-input-row">
          <input
            type="text"
            placeholder="e.g. LATAM backend pool thin on Shopify — expanded to Canada"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveNote()}
          />
          <button className="btn btn-ghost btn-sm" onClick={saveNote}>
            {noteSaved ? '✓' : 'Add'}
          </button>
        </div>
        {lowVolumeNotes.slice(0, 5).map((n, i) => (
          <div key={i} className="low-vol-note">
            <span className="low-vol-date">{formatDate(n.ts)}</span>
            <span>{n.note}</span>
          </div>
        ))}
      </div>

      {/* Daily report */}
      <div className="metrics-panel">
        <div className="report-header">
          <h3>Daily report</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={generateReport}>Generate</button>
            {reportText && (
              <button className="btn btn-ghost btn-sm" onClick={copyReport}>
                {copied ? '✓ Copied' : 'Copy for Slack'}
              </button>
            )}
          </div>
        </div>
        {reportText && <pre className="report-pre">{reportText}</pre>}
        {!reportText && <p className="metrics-hint">Click Generate to build today's summary — ready to paste in Slack or email.</p>}
      </div>
      </>}
    </div>
  )
}
