import { buildJDParsePrompt, buildBooleanPrompt, buildRefineBooleanPrompt, buildScreeningPrompt, buildComparePrompt, buildInterviewGuidePrompt, buildPostInterviewPrompt, buildBitacoraAnalysisPrompt, buildRejectionAnalysisPrompt, buildOutreachPrompt, buildRoleInterpretationPrompt, buildChallengePrompt } from './prompts'

const GROQ_MODEL = 'openai/gpt-oss-120b'

async function callGroq(apiKey, prompt, maxTokens = 2000, attempt = 0) {
  const cleanKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim()
  console.log('[Groq prompt snippet]', prompt.slice(-800))
  const response = await fetch('/groq/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cleanKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `API error ${response.status}`
    // Auto-retry on rate limit (up to 3 times)
    if (response.status === 429 && attempt < 3) {
      const waitMatch = msg.match(/try again in ([\d.]+)s/i)
      const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 1000 : 15000
      await new Promise(r => setTimeout(r, waitMs))
      return callGroq(apiKey, prompt, maxTokens, attempt + 1)
    }
    throw new Error(msg)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from Groq')

  // Strip code fences
  let clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  const tryParse = (s) => {
    try { return JSON.parse(s) } catch { return null }
  }

  // Direct parse
  let parsed = tryParse(clean)
  if (parsed) return parsed

  // Extract outermost JSON object
  const match = clean.match(/\{[\s\S]*\}/)
  if (match) {
    parsed = tryParse(match[0])
    if (parsed) return parsed

    // Strip markdown bold/italic inside strings: *text* → text, **text** → text
    const stripped = match[0].replace(/\*\*?([^*]+)\*\*?/g, '$1')
    parsed = tryParse(stripped)
    if (parsed) return parsed
  }

  throw new Error('Failed to parse Groq response as JSON')
}

export async function parseJD(jdText, apiKey) {
  return callGroq(apiKey, buildJDParsePrompt(jdText), 1000)
}

export async function generateBooleans(role, apiKey) {
  return callGroq(apiKey, buildBooleanPrompt(role), 1000)
}

export async function screenCV(cvText, role, apiKey) {
  const trimmed = cvText.length > 12000 ? cvText.slice(0, 12000) + '\n[CV truncated for length]' : cvText
  return callGroq(apiKey, buildScreeningPrompt(trimmed, role), 2000)
}

export async function screenCVTwoPass(cvText, role, apiKey, onProgress) {
  const trimmed = cvText.length > 12000 ? cvText.slice(0, 12000) + '\n[CV truncated for length]' : cvText

  // Pass 1
  onProgress?.('pass1')
  const first = await callGroq(apiKey, buildScreeningPrompt(trimmed, role), 2500)

  // Pass 2 — challenge
  onProgress?.('pass2')
  const challenge = await callGroq(apiKey, buildChallengePrompt(first, trimmed, role), 2000)

  // Safety net: if model hard-rejected on years_experience but the candidate's
  // calculated years meet the minimum, override to Flag for Review
  const yearsNum = typeof first.years_experience === 'number' ? first.years_experience : parseFloat(first.years_experience)
  const meetsYears = role.years_experience_min && !isNaN(yearsNum) && yearsNum >= role.years_experience_min
  if (meetsYears && first.verdict === 'No Pass' && first.hard_rejection_reason) {
    const reasonLower = first.hard_rejection_reason.toLowerCase()
    if (reasonLower.includes('year') || reasonLower.includes('experience')) {
      first.verdict = 'Flag for Review'
      first.hard_rejection_reason = null
      first._overridden = `Auto-rejection overridden: model calculated ${yearsNum}yr but role requires ${role.years_experience_min}yr — candidate appears to meet minimum. Flagged for human review.`
    }
  }

  // Merge: second pass wins on verdict/score/notes, first pass keeps all other display fields
  const merged = {
    ...first,
    verdict: challenge.final_verdict ?? first.verdict,
    fit_score: challenge.final_fit_score ?? first.fit_score,
    score_breakdown: challenge.final_score_breakdown ?? first.score_breakdown,
    justification: challenge.revised_justification ?? first.justification,
    bamboohr_note: (challenge.revised_bamboohr_note && challenge.revised_bamboohr_note !== 'null')
      ? challenge.revised_bamboohr_note
      : first.bamboohr_note,
    client_presentation: (challenge.revised_client_presentation && challenge.revised_client_presentation !== 'null')
      ? challenge.revised_client_presentation
      : first.client_presentation,
    strengths: [
      ...(first.strengths || []),
      ...(challenge.added_strengths || []),
    ].filter((s, i, a) => a.indexOf(s) === i),
    gaps: [
      ...(first.gaps || []).filter(g => !(challenge.removed_gaps || []).includes(g)),
      ...(challenge.added_gaps || []),
    ],
    two_pass: {
      first_verdict: first.verdict,
      first_score: first.fit_score,
      action: challenge.action,
      challenge_notes: challenge.challenge_notes,
    },
  }

  return merged
}

export async function generateInterviewGuide(screeningResult, candidateName, role, apiKey) {
  return callGroq(apiKey, buildInterviewGuidePrompt(screeningResult, candidateName, role), 2000)
}

export async function analyzeInterview(transcript, candidateName, screeningResult, role, apiKey) {
  const trimmed = transcript.length > 12000 ? transcript.slice(0, 12000) + '\n[truncated]' : transcript
  return callGroq(apiKey, buildPostInterviewPrompt(trimmed, candidateName, screeningResult, role), 2500)
}

export async function analyzeRejections(feedbacks, role, apiKey) {
  return callGroq(apiKey, buildRejectionAnalysisPrompt(feedbacks, role), 1500)
}

export async function analyzeBitacora(entries, period, apiKey) {
  return callGroq(apiKey, buildBitacoraAnalysisPrompt(entries, period), 1500)
}

export async function refineBooleans(currentResult, feedback, role, apiKey) {
  return callGroq(apiKey, buildRefineBooleanPrompt(currentResult, feedback, role), 2000)
}

export async function interpretRole(role, apiKey) {
  return callGroq(apiKey, buildRoleInterpretationPrompt(role), 1500)
}

export async function generateOutreach(screeningResult, candidateName, role, apiKey) {
  return callGroq(apiKey, buildOutreachPrompt(screeningResult, candidateName, role), 1000)
}

export async function fetchNinjaProfile(firstName, lastName, employerWebsite, ninjaPearKey) {
  const params = new URLSearchParams({ first_name: firstName, employer_website: employerWebsite })
  if (lastName) params.set('last_name', lastName)
  const res = await fetch(`/ninjapear/api/v2/employee/profile?${params}`, {
    headers: { Authorization: `Bearer ${ninjaPearKey}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || `NinjaPear error ${res.status}`)
  }
  return res.json()
}

export function ninjaProfileToText(profile, name) {
  const lines = []
  if (name) lines.push(`Name: ${name}`)
  if (profile.headline) lines.push(`Headline: ${profile.headline}`)
  if (profile.location) lines.push(`Location: ${profile.location}`)
  if (profile.summary) lines.push(`\nSummary:\n${profile.summary}`)
  if (profile.experiences?.length) {
    lines.push('\nExperience:')
    for (const e of profile.experiences) {
      lines.push(`- ${e.title || ''} at ${e.company || ''} (${e.starts_at?.year || '?'} – ${e.ends_at?.year || 'present'})`)
      if (e.description) lines.push(`  ${e.description.slice(0, 300)}`)
    }
  }
  if (profile.education?.length) {
    lines.push('\nEducation:')
    for (const e of profile.education) {
      lines.push(`- ${e.degree_name || ''} at ${e.school || ''} (${e.starts_at?.year || ''} – ${e.ends_at?.year || ''})`)
    }
  }
  if (profile.skills?.length) {
    lines.push(`\nSkills: ${profile.skills.slice(0, 20).join(', ')}`)
  }
  return lines.join('\n')
}

export async function compareCVs(cvA, nameA, cvB, nameB, role, apiKey) {
  const trimA = cvA.length > 6000 ? cvA.slice(0, 6000) + '\n[truncated]' : cvA
  const trimB = cvB.length > 6000 ? cvB.slice(0, 6000) + '\n[truncated]' : cvB
  return callGroq(apiKey, buildComparePrompt(trimA, nameA, trimB, nameB, role), 3000)
}
