// Extract structured requirements from a JD
export function buildJDParsePrompt(jdText) {
  return `You are an expert technical recruiter. Parse this job description and extract structured requirements.

JD TEXT:
---
${jdText}
---

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "title": "job title",
  "company": "company name if mentioned, else null",
  "location": "Remote / LATAM / US / etc — extract from JD",
  "location_type": "us_canada" | "latam" | "global" | "other",
  "seniority": "Junior / Mid / Senior / Lead / Staff",
  "department": "Engineering / Data / Design / etc",
  "summary": "2-sentence summary of what this role does",
  "must_have": ["non-negotiable hard skills and requirements as short strings"],
  "nice_to_have": ["preferred but not required skills"],
  "years_experience_min": number or null,
  "key_technologies": ["main tools/languages/frameworks"],
  "timezone_requirement": "timezone overlap requirement if any, else null",
  "hard_reject_if": ["conditions that should auto-reject a candidate — infer from JD"]
}`
}

// Second pass — challenges first pass verdict
export function buildChallengePrompt(firstResult, cvText, role) {
  return `You are a senior recruiter reviewing a colleague's screening verdict. Your job is to challenge it — look for evidence they missed, biases that crept in, and either confirm or overturn the verdict.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
MUST HAVE: ${role.must_have?.join(', ') || 'N/A'}
KEY TECHNOLOGIES: ${role.key_technologies?.join(', ') || 'N/A'}

FIRST PASS VERDICT: ${firstResult.verdict} (fit score: ${firstResult.fit_score}/100)
FIRST PASS JUSTIFICATION: ${firstResult.justification}
FIRST PASS STRENGTHS: ${firstResult.strengths?.join('; ')}
FIRST PASS GAPS: ${firstResult.gaps?.join('; ')}

CANDIDATE DOCUMENTS:
---
${cvText}
---

YOUR JOB — apply each of these in order:

1. GROUNDING CHECK: For every strength and gap in the first pass, ask: is this traceable to a specific transcript statement? If a strength is based on a CV keyword not confirmed in the call — remove it or mark it unconfirmed. If the candidate explicitly downplayed or disclaimed a skill, that is a gap regardless of what the CV says.

2. SCORE INFLATION CHECK: If a phone screen is present, the fit_score should reflect what was SAID, not what the CV claims. CV keywords with no call confirmation should not count toward Skills or Seniority dimensions. Adjust the score if the first pass over-relied on resume claims.

3. LOGISTICS MANDATORY: Re-scan the transcript for salary expectations, notice period, availability, and job search status. If the first pass says "not specified" for any of these but the call covered it — add them to added_gaps or challenge_notes with the exact figure mentioned.

4. RESPONSE QUALITY vs SKILL GAP — distinguish these separately:
   - Skill/experience gap: candidate lacks a tool, platform, or domain the role requires.
   - Response quality risk: candidate gave vague, generic, or example-free answers when concrete detail was expected. Note this separately — it is a seniority signal, not a skill gap.

5. SCALE AND CLIENT-TYPE MATCH: Compare the size/complexity of the candidate's named clients and projects to the role context. Small-scale or local experience is a meaningful gap for an enterprise or high-growth role.

6. NO FILLER GAPS: Only add gaps with textual evidence from the transcript or resume. Do not invent abstract competency gaps ("unclear data orientation") unless the candidate was asked about it and gave a weak or negative answer.

7. DECIDE: CONFIRM the verdict, UPGRADE it (e.g. Flag → Pass), or DOWNGRADE it (e.g. Pass → Flag, or Pass → No Pass if the call revealed a hard blocker)

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "action": "confirm" | "upgrade" | "downgrade",
  "final_verdict": "Pass" | "Flag for Review" | "No Pass",
  "final_fit_score": 0-100,
  "final_score_breakdown": {
    "skills": 0-100,
    "seniority": 0-100,
    "industry": 0-100,
    "trajectory": 0-100
  },
  "challenge_notes": "2-3 sentences on what the first pass got wrong or right — be specific about what evidence was missed or misread",
  "revised_justification": "2-3 sentences final justification incorporating both passes",
  "added_strengths": ["strengths the first pass missed — empty array if none"],
  "removed_gaps": ["gaps from first pass that are actually non-issues — empty array if none"],
  "added_gaps": ["new concerns the first pass missed — quote candidate's exact words if they disclaimed a skill or described a limitation. Empty array if none"],
  "revised_bamboohr_note": "Rewrite the BambooHR note correcting any logistics errors. Use the EXACT same bullet structure: • Verdict / • Experience / • Strengths / • Concerns / • Logistics / • Next step. In Logistics: write the actual salary and notice period stated in the call — never 'Not specified' if the candidate said a number. In Concerns: quote the candidate's own words for any explicitly stated limitation. Only output this field if you changed something — if the first pass note is already correct, set this to null.",
  "revised_client_presentation": "Rewrite the Slack client presentation if the first pass got logistics wrong or missed key gaps. Use same format. In Logistics bullet: include salary and notice period from the call. In Gaps bullet: quote any disclaimer the candidate made about their own skills. Set to null if the first pass is already correct."
}`
}

// Role interpretation — what the client REALLY needs
export function buildRoleInterpretationPrompt(role) {
  return `You are a senior technical recruiter with 15 years of experience placing engineers at tech companies. Your job is to interpret this role description beyond the surface-level keywords — think like a recruiter who has filled 50 similar roles and knows what clients actually need vs what they write.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
SENIORITY: ${role.seniority || 'not specified'}
MUST HAVE: ${role.must_have?.join(', ') || 'N/A'}
NICE TO HAVE: ${role.nice_to_have?.join(', ') || 'N/A'}
KEY TECHNOLOGIES: ${role.key_technologies?.join(', ') || 'N/A'}
YEARS EXP: ${role.years_experience_min || 'not specified'}
${role.extra_requirements ? `ADDITIONAL CONTEXT: ${role.extra_requirements}` : ''}

Go deep. Think about:
- What kind of company stage does this imply? What are they actually trying to solve?
- Is this a "build from scratch" or "scale what exists" role?
- What kind of candidate background actually succeeds here vs fails?
- What are the unwritten requirements that experienced recruiters know to look for?
- What type of candidate looks good on paper but will fail in this role?

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "real_need": "2-3 sentences on what the client REALLY needs — the business problem behind the hire, not just the tech stack",
  "builder_or_scaler": "Builder" | "Scaler" | "Either",
  "builder_or_scaler_reason": "one sentence explaining why",
  "ideal_stage_background": "what company stage/size/type the ideal candidate should come from and why",
  "hidden_requirements": ["2-4 things not written in the JD but implied by context — e.g. 'startup pace tolerance', 'ability to work without a design system', 'async communication skills for distributed team'"],
  "likely_dealbreakers": ["2-3 things that would actually kill the hire even if the CV looks good — e.g. 'only enterprise background', 'never owned a product end-to-end', 'no client-facing experience'"],
  "ideal_profile_summary": "3-4 sentence plain-English description of the ideal candidate for this specific role — who they are, where they come from, what they've done",
  "screening_lens": "one paragraph on how to READ candidate CVs for this specific role — what signals to weight heavily, what to discount, what patterns predict success vs failure here"
}`
}

// Analyze client rejection feedback patterns
export function buildRejectionAnalysisPrompt(feedbacks, role) {
  const entries = feedbacks.map((f, i) =>
    `${i + 1}. Candidate: ${f.name}\n   Feedback: ${f.feedback}`
  ).join('\n\n')

  return `You are a senior technical recruiter analyzing client rejection feedback to improve candidate screening criteria.

ROLE: ${role.title}
CURRENT MUST HAVE: ${role.must_have?.join(', ') || 'N/A'}
CURRENT NICE TO HAVE: ${role.nice_to_have?.join(', ') || 'N/A'}

CLIENT REJECTION FEEDBACK (${feedbacks.length} candidates rejected):
${entries}

Analyze the patterns and tell me what the client is really looking for that isn't captured in the current criteria.

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "patterns": ["recurring reasons across multiple rejections — be specific"],
  "hidden_must_haves": ["skills or traits the client keeps rejecting for — should move to must-have"],
  "false_must_haves": ["things currently in must-have that don't seem to matter based on rejections"],
  "screening_adjustments": ["concrete changes to make to the screening criteria"],
  "summary": "2-3 sentence plain summary of what the client is actually looking for vs what the JD says"
}`
}

// Generate LinkedIn Boolean strings for sourcing
export function buildBooleanPrompt(role) {
  const locationContext = role.location_type === 'latam'
    ? 'Candidates must be based in Latin America (LATAM). Relevant countries: Argentina, Brazil, Colombia, Mexico, Chile, Peru, Uruguay, Costa Rica, Ecuador, Bolivia, Paraguay, Venezuela.'
    : role.location_type === 'us_canada'
    ? 'Candidates must be based in the United States or Canada.'
    : `Location: ${role.location || 'Global/Remote'}`

  const latamGeo = role.location_type === 'latam'
    ? '(Argentina OR Colombia OR Mexico OR Brazil OR Chile OR Peru OR Uruguay OR "Costa Rica")'
    : ''

  return `You are a senior technical recruiter expert in LinkedIn sourcing and Boolean search.

ROLE: ${role.title}
${locationContext}
KEY TECHNOLOGIES: ${role.key_technologies?.join(', ') || 'N/A'}
MUST HAVE (these are mandatory — use AND in X-Ray, never inside an OR group with optional skills):
${role.must_have?.map(r => `- ${r}`).join('\n') || 'N/A'}

NICE TO HAVE (optional — can go inside OR groups):
${role.nice_to_have?.map(r => `- ${r}`).join('\n') || 'N/A'}

KEY TECHNOLOGIES (classify each as must-have or nice-to-have based on the lists above):
${role.key_technologies?.join(', ') || 'N/A'}

YEARS EXPERIENCE: ${role.years_experience_min ? `${role.years_experience_min}+` : 'N/A'}
${role.extra_requirements ? `ADDITIONAL REQUIREMENTS: ${role.extra_requirements}` : ''}
${role.rejection_feedback?.length > 0 ? `CLIENT REJECTION PATTERNS (avoid sourcing candidates with these traits):\n${role.rejection_feedback.map(f => `- ${f.name}: ${f.feedback}`).join('\n')}` : ''}
Generate sourcing strings optimized for SALES NAVIGATOR and Google X-Ray. Respond ONLY with valid JSON. No markdown, no code fences.

IMPORTANT RULES FOR SALES NAVIGATOR:
- The keywords field must be SHORT (max 3-4 terms with OR) — long Boolean strings in Sales Navigator keywords return 0 results
- Skills and technologies go in keywords
- Job titles go in the "titles" field (these map to the "Current job title" filter in Sales Navigator)
- Location is set via the Sales Navigator geography filter, NOT in the Boolean string
- Keep it simple — Sales Navigator filters do the heavy lifting
- If the role requires agency experience, generate a separate "agency_keywords" field with terms like "agency" OR "digital agency" OR "consultancy" OR "consulting" to add to the keywords search
- Also suggest Company type filter (Agency/Staffing if applicable) and Company headcount ranges typical of agencies (1-50, 51-200)
- If the role requires people management (managing direct reports, team lead with HR responsibilities, performance reviews), generate a "people_lead_keywords" field with terms like "engineering manager" OR "people manager" OR "team lead" and add people-management job titles to the titles list. Distinguish between technical leadership (architect, senior dev) and people leadership (manager, lead with direct reports). Only add this if must_have or extra_requirements explicitly mention managing people or direct reports.

IMPORTANT RULES FOR X-RAY:
- X-Ray searches Google for LinkedIn profiles using site:linkedin.com/in/
- You MUST include location terms directly in the X-Ray string — Google has no geography filter
- Location string to include: ${
    role.location_type === 'latam'
      ? '(Argentina OR Colombia OR Mexico OR Brazil OR Chile OR Peru OR Uruguay OR "Costa Rica")'
      : role.location_type === 'us_canada'
      ? '("United States" OR "USA" OR Canada)'
      : role.location || ''
  }
- Format: site:linkedin.com/in/ ("Title1" OR "Title2") AND ("core skill1" OR "core skill2") AND "must-have tool" AND LOCATION_STRING
- Must-have skills/tools go as separate AND terms (not inside an OR group)
- Optional/nice-to-have skills go inside an OR group
- X-Ray string should be a complete, paste-ready Google search query
- DO NOT mix must-haves and nice-to-haves inside the same OR group

{
  "sales_navigator": {
    "keywords": "short keyword string for the Sales Navigator keywords field — max 3-4 terms, use OR",
    "keywords_broad": "even broader version — fewer terms, more results",
    "agency_keywords": "keyword string to find agency-experienced candidates: 'agency' OR 'digital agency' OR 'consultancy' — combine with main keywords using AND",
    "titles": ["job title 1", "job title 2", "job title 3"],
    "company_type_tip": "recommended Company type filter in Sales Navigator (e.g. Privately Held, small headcount 1-200) to target agency profiles",
    "filters_tip": "brief instructions on which Sales Navigator sidebar filters to use (seniority, function, industry, etc.)"
  },
  "xray": {
    "broad": "complete Google X-Ray — site:linkedin.com/in/ + job titles + broad skills + location string",
    "targeted": "complete Google X-Ray — site:linkedin.com/in/ + job titles + must-have skills + location string",
    "tip": "one practical tip for using X-Ray for this role"
  },
  "notes": "which approach to start with and why"
}`
}

export function buildRefineBooleanPrompt(currentResult, feedback, role) {
  return `You are a senior technical recruiter expert in LinkedIn sourcing and Boolean search.

You previously generated these sourcing strings for the role "${role.title}":

CURRENT SALES NAVIGATOR KEYWORDS (targeted): ${currentResult.sales_navigator?.keywords || ''}
CURRENT SALES NAVIGATOR KEYWORDS (broad): ${currentResult.sales_navigator?.keywords_broad || ''}
CURRENT JOB TITLES: ${currentResult.sales_navigator?.titles?.join(', ') || ''}
CURRENT X-RAY (broad): ${currentResult.xray?.broad || ''}
CURRENT X-RAY (targeted): ${currentResult.xray?.targeted || ''}

THE RECRUITER'S FEEDBACK ON RESULTS:
"${feedback}"

Based on this feedback, generate REFINED versions. Common adjustments:
- "too few results" → broaden: remove less-critical AND terms, add more OR alternatives, simplify
- "too broad/irrelevant profiles" → tighten: add more specific must-have terms
- "wrong seniority" → adjust title list and experience indicators
- "wrong location" → fix or expand the location terms in X-Ray

IMPORTANT RULES:
- Sales Navigator keywords: SHORT (max 3-4 terms with OR) — long strings return 0 results
- X-Ray: include location terms directly in the string
- Keep the same JSON structure as before
- Respond ONLY with valid JSON. No markdown, no code fences.

{
  "sales_navigator": {
    "keywords": "refined keyword string",
    "keywords_broad": "broader version",
    "agency_keywords": "agency keyword string if applicable",
    "titles": ["title 1", "title 2"],
    "company_type_tip": "tip",
    "filters_tip": "tip"
  },
  "xray": {
    "broad": "refined broad X-Ray string",
    "targeted": "refined targeted X-Ray string",
    "tip": "tip for this refined search"
  },
  "notes": "explanation of what was changed and why",
  "refinement_summary": "one-line summary of the key change made (e.g. 'Removed WCAG requirement, added 3 new title variations')"
}`
}

// Analyze bitácora entries
export function buildBitacoraAnalysisPrompt(entries, period) {
  const formatted = entries.map(e => {
    const date = new Date(e.ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return `[${date}]${e.roleTag ? ` [${e.roleTag}]` : ''} ${e.text}`
  }).join('\n')

  return `You are analyzing a recruiter's daily log entries to identify patterns, pending items, and insights.

PERIOD: ${period}
LOG ENTRIES (most recent first):
---
${formatted}
---

The recruiter writes in a mix of Spanish and English — respond in the same language they use most. Be direct, practical, and specific. No fluff.

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "pending": ["concrete things that appear unresolved — follow-ups not done, candidates waiting, clients not answered. Max 6."],
  "highlights": ["things that went well this period — placements, good candidates found, positive feedback"],
  "patterns": ["recurring themes or issues — e.g. losing candidates at a specific stage, a role being hard to fill, fake profiles in a specific market"],
  "watch_out": ["risks or things to not forget in the coming days"],
  "summary": "2-3 sentence plain-language summary of how this period went — honest and direct",
  "tomorrow_focus": ["2-3 most important things to focus on next"]
}`
}

// Generate personalized outreach
export function buildOutreachPrompt(screeningResult, candidateName, role) {
  const dna = screeningResult.career_dna
  const dnaContext = dna ? `
CAREER DNA:
- Stage history: ${dna.stage_history || 'N/A'}
- Pattern: ${dna.builder_vs_scaler || 'N/A'} — ${dna.builder_vs_scaler_evidence || ''}
- Velocity: ${dna.promotion_velocity || 'N/A'}
- Hidden gems: ${dna.hidden_gems?.join(', ') || 'none'}` : ''

  return `You are a senior technical recruiter writing personalized outreach to a candidate who matched a role screening. Your outreach must feel genuinely personal — not a template blast.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
CANDIDATE: ${candidateName}
FIT SCORE: ${screeningResult.fit_score}/100
KEY STRENGTHS: ${screeningResult.strengths?.join(', ') || 'N/A'}${dnaContext}

Write TWO versions of outreach:
1. LinkedIn connection note (300 chars MAX — this is a hard LinkedIn limit)
2. Email (subject line + body, 120 words max)

RULES (non-negotiable):
- Reference something SPECIFIC from their background — a company name, a project, a career move — NOT a generic compliment
- Mention the role and what makes it relevant to THEIR specific background
- CTA must be low-friction: "15-min call" or "quick chat" — not "please apply" or "send your CV"
- Sound like a real recruiter, not a bot or a template
- NEVER use: "I came across your profile", "exciting opportunity", "passionate", "proven track record", "I was impressed"
- Be direct and brief — candidates get dozens of these

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "linkedin_note": "connection request message — 300 chars HARD MAX, no emojis, conversational tone",
  "email_subject": "short subject — 8 words max, specific not generic",
  "email_body": "email body — 120 words max, starts with the personalization hook",
  "personalization_hook": "the ONE specific thing from their background used to make this personal"
}`
}

// Generate pre-interview guide
export function buildInterviewGuidePrompt(screeningResult, candidateName, role) {
  return `You are a senior technical recruiter preparing an interview guide for a candidate who passed initial screening. Your job is to help the recruiter know exactly what to probe, validate, and clarify before deciding to present this candidate to the client.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
SENIORITY: ${role.seniority || 'Senior'}
MUST HAVE: ${role.must_have?.join(', ') || 'N/A'}
KEY TECHNOLOGIES: ${role.key_technologies?.join(', ') || 'N/A'}
${role.extra_requirements ? `ADDITIONAL REQUIREMENTS: ${role.extra_requirements}` : ''}

CANDIDATE: ${candidateName}
SCREENING VERDICT: ${screeningResult.verdict} (Fit: ${screeningResult.fit_score}/10)
STRENGTHS FROM CV: ${screeningResult.strengths?.join('; ') || 'N/A'}
GAPS FROM CV: ${screeningResult.gaps?.join('; ') || 'N/A'}
RED FLAGS: ${screeningResult.red_flags?.join('; ') || 'none'}
BORDERLINE: ${screeningResult.borderline ? 'Yes' : 'No'}

Your task: generate a focused interview guide. Be specific — every question must reference something concrete from this candidate's profile. No generic questions.

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "must_validate": ["2-3 things that MUST be confirmed in this call before presenting to client — deal-breakers if wrong"],
  "areas_to_probe": [
    {
      "area": "short label for the area",
      "why": "why this is uncertain based on the CV",
      "questions": ["specific question 1", "specific question 2"]
    }
  ],
  "salary_and_logistics": ["key logistics to confirm: notice period, salary expectation, availability, timezone"],
  "green_flags_to_listen_for": ["what answers would make you more confident about this candidate"],
  "red_flag_responses": ["answers or behaviors during the call that should make you pause or reject"],
  "quick_summary": "2-sentence briefing: who this candidate is and what the call needs to resolve"
}`
}

// Analyze post-interview transcript
export function buildPostInterviewPrompt(transcript, candidateName, screeningResult, role) {
  return `You are a senior technical recruiter analyzing a candidate interview to decide whether to present them to the client.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
SENIORITY: ${role.seniority || 'Senior'}
MUST HAVE: ${role.must_have?.join(', ') || 'N/A'}
${role.extra_requirements ? `ADDITIONAL REQUIREMENTS: ${role.extra_requirements}` : ''}

CANDIDATE: ${candidateName}
CV SCREENING VERDICT: ${screeningResult?.verdict || 'N/A'} (Fit: ${screeningResult?.fit_score || 'N/A'}/10)
CV GAPS FLAGGED: ${screeningResult?.gaps?.join('; ') || 'N/A'}

ENGLISH LEVEL REQUIREMENT FOR THIS ROLE:
Candidates will interact directly with clients (CQL). The client accepts any accent but requires fluid, confident spoken English — no long pauses, no searching for words mid-sentence, no hesitations that would feel awkward in a client call. Minimum bar: solid B2. B1 or below is a disqualifier for client-facing roles. Evaluate based on how the candidate actually spoke in the transcript — not just vocabulary, but confidence and flow.

INTERVIEW TRANSCRIPT / NOTES:
---
${transcript}
---

Based on the interview, decide whether to present this candidate to the client. Be direct and opinionated.

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "decision": "Present to Client" | "Do Not Present" | "Needs More Info",
  "confidence": "High" | "Medium" | "Low",
  "decision_reason": "2-3 sentences explaining exactly why. Reference specific things said in the interview.",
  "gaps_resolved": ["CV gaps that were clarified positively in the interview"],
  "gaps_confirmed": ["CV gaps that were confirmed as real concerns after the interview"],
  "new_concerns": ["issues that came up in the interview that were not visible in the CV"],
  "standout_moments": ["specific things the candidate said that impressed or concerned you"],
  "logistics": {
    "salary_expectation": "what they said or null",
    "notice_period": "what they said or null",
    "availability": "what they said or null",
    "timezone_confirmed": true | false
  },
  "english_level": {
    "level": "A2" | "B1" | "B2" | "C1" | "C2" | "Native",
    "confidence": "High" | "Medium" | "Low",
    "summary": "2-3 sentence assessment based on the transcript: fluency, vocabulary, comprehension, any hesitations or errors. Be specific — quote or reference actual moments from the transcript.",
    "concerns": "any specific English-related concern that could affect their performance in the role, or null if none"
  },
  "client_pitch": "If presenting: 3-4 sentence pitch to send the client. Recruiter tone, specific strengths referencing what was said in the interview, role fit, one honest caveat if any. Write as if you are the recruiter sending this to the hiring manager. Start with the candidate name. No generic phrases.",
  "bamboohr_note": "ATS note for BambooHR. Plain English, no AI language, no fluff. Use this exact structure:\n• Verdict: [Present to Client / Do Not Present / Needs More Info] — Confidence: [High/Medium/Low]\n• Interview: [date if known, else 'phone screen conducted'] — English: [level assessed]\n• Strengths confirmed: [2-3 specific things said or shown in the interview — quote or paraphrase directly]\n• Concerns: [gaps confirmed or new issues — if none write 'No new concerns raised']\n• Logistics: [salary expectation] | [notice period] | [availability] — timezone confirmed: [yes/no]\n• Next step: [concrete action — e.g. 'Send to client', 'Second call to clarify X', 'Reject with feedback']",
  "client_presentation": "Only if decision is Present to Client. Bullet point summary to send to the hiring manager. English. Specific, factual, no generic phrases. Use this exact structure:\n• Background: [Current title at current company] — [X years total experience] in [main domain]\n• Why them: [Top strength from the interview with a specific example they gave — e.g. 'Led a replatform from monolith to microservices at [Company], reduced deploy time by 40%']\n• Technical fit: [Exact tech match to the role's must-haves, with context from the interview]\n• Communication: [English level + one observation about how they communicated — fluency, clarity, client-readiness]\n• Caveat: [One honest gap or caveat if any — omit bullet if truly none]\n• Logistics: [Salary expectation] | [Notice period] | [Available from: date]",
  "next_step": "concrete next action — e.g. 'Send to client today', 'Request a take-home test first', 'Do a second call to clarify X', 'Reject and send feedback'"
}`
}

// Compare two CVs against a role
export function buildComparePrompt(cvA, nameA, cvB, nameB, role) {
  const locationCtx = role.location_type === 'latam_canada'
    ? 'LATAM or Canada'
    : role.location_type === 'latam'
    ? 'Latin America'
    : role.location_type === 'us_canada'
    ? 'US or Canada'
    : role.location || 'not specified'

  return `You are a senior technical recruiter comparing two candidates for the same role. Be direct and opinionated — pick a clear winner when one exists.

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
LOCATION: ${locationCtx}
SENIORITY: ${role.seniority || 'Senior'}
MIN YEARS: ${role.years_experience_min || 'not specified'}

MUST HAVE:
${role.must_have?.map(r => `- ${r}`).join('\n') || 'See key technologies'}

KEY TECHNOLOGIES: ${role.key_technologies?.join(', ') || 'N/A'}
${role.extra_requirements ? `\nADDITIONAL REQUIREMENTS: ${role.extra_requirements}` : ''}

--- CANDIDATE A: ${nameA} ---
${cvA}

--- CANDIDATE B: ${nameB} ---
${cvB}

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "winner": "A" | "B" | "Tie",
  "winner_name": "name of the winner or 'Tie'",
  "confidence": "High" | "Medium" | "Low",
  "summary": "2-3 sentences explaining who wins and why, with specific evidence. Be direct.",
  "candidate_a": {
    "name": "${nameA}",
    "fit_score": 1-10,
    "verdict": "Pass" | "No Pass" | "Flag for Review",
    "strengths": ["2-3 concrete strengths for this role"],
    "gaps": ["gaps or concerns"],
    "standout": "single best thing about this candidate for this role"
  },
  "candidate_b": {
    "name": "${nameB}",
    "fit_score": 1-10,
    "verdict": "Pass" | "No Pass" | "Flag for Review",
    "strengths": ["2-3 concrete strengths for this role"],
    "gaps": ["gaps or concerns"],
    "standout": "single best thing about this candidate for this role"
  },
  "recommendation": "concrete next step — e.g. move A to screen, reject B, or move both and compare on call",
  "if_you_can_only_pick_one": "direct answer: A or B and the one-line reason"
}`
}

// Screen a CV against a role
export function buildScreeningPrompt(cvText, role) {
  const locationCtx = role.location_type === 'latam_canada'
    ? 'Must be based in Latin America OR Canada. Accept candidates from LATAM countries (Argentina, Colombia, Mexico, Brazil, Chile, Peru, Uruguay, Costa Rica, etc.) AND Canada. Reject only if clearly outside both regions.'
    : role.location_type === 'latam'
    ? 'Must be based in Latin America. Accept candidates from Argentina, Colombia, Mexico, Brazil, Chile, Peru, Uruguay, Costa Rica, and other LATAM countries. Reject if clearly outside LATAM.'
    : role.location_type === 'us_canada'
    ? 'Must be based in US or Canada. Reject if outside these countries.'
    : `Location requirement: ${role.location || 'none specified'}`

  const intel = role.interpretation
  const intelBlock = intel ? `
ROLE INTELLIGENCE (AI interpretation of what this client REALLY needs — use this to calibrate your screening):
- Real need: ${intel.real_need}
- Pattern: ${intel.builder_or_scaler} — ${intel.builder_or_scaler_reason}
- Ideal background: ${intel.ideal_stage_background}
- Hidden requirements: ${intel.hidden_requirements?.join(' | ')}
- Likely dealbreakers: ${intel.likely_dealbreakers?.join(' | ')}
- How to read CVs for this role: ${intel.screening_lens}
` : ''

  return `You are a senior technical recruiter screening a candidate for the following role. You think like an experienced human recruiter — not a checkbox parser.${intelBlock}

ROLE: ${role.title}${role.company ? ` at ${role.company}` : ''}
LOCATION: ${locationCtx}
SENIORITY: ${role.seniority || 'Senior'}
MIN YEARS EXPERIENCE: ${role.years_experience_min || 'not specified'}
TIMEZONE: ${role.timezone_requirement || 'none'}

MUST HAVE:
${role.must_have?.map(r => `- ${r}`).join('\n') || 'See key technologies'}

KEY TECHNOLOGIES:
${role.key_technologies?.join(', ') || 'N/A'}

NICE TO HAVE:
${role.nice_to_have?.join(', ') || 'N/A'}

AUTO-REJECT IF:
${role.hard_reject_if?.map(r => `- ${r}`).join('\n') || 'none specified'}
${role.extra_requirements ? `\nADDITIONAL CLIENT REQUIREMENTS (treat as hard criteria — reject or flag if missing):\n${role.extra_requirements}` : ''}
${role.rejection_feedback?.length > 0 ? `\nCLIENT REJECTION FEEDBACK — LEARN FROM THESE (${role.rejection_feedback.length} rejected candidates):\nThe client previously rejected these candidates — use this to calibrate your screening:\n${role.rejection_feedback.map(f => `- ${f.name}: "${f.feedback}"`).join('\n')}\n` : ''}
FLAG FOR REVIEW (not auto-reject):
- No LinkedIn URL provided
- Email domain is unusual (non-gmail/outlook/yahoo/hotmail)
- Missing salary info (flag, do not reject)

RISK MULTIPLIERS — apply these BEFORE finalizing the score. Each one that applies reduces the hire probability:
- Weakness in CORE stack (must-have skills, not nice-to-have): -15 to -25 points on skills dimension. If the candidate is weakest exactly where the role needs them most, this is not a gap — it's a fundamental mismatch.
- Vague answers on technical topics in the phone screen (no specific examples, generic descriptions like "I do code reviews / component architecture"): treat as seniority red flag. Reduce seniority score by 10-20.
- Passive job seeker (not actively looking, currently employed and not seeking): increases counter-offer risk. Flag explicitly.
- Salary expectation significantly above role budget or market rate: increases offer rejection and counter-offer risk. Flag as logistics risk.
- Combination of passive + above-market salary + core stack gap = HIGH risk profile. Should not Pass unless every other signal is exceptional.

SCORING PHILOSOPHY — READ CAREFULLY:
- Score from 0 to 100. Not a keyword counter — a hire probability estimate.
- Score is multidimensional. Each dimension (skills, seniority, industry, trajectory) is scored independently 0-100, then combined into an overall fit_score.
- SKILLS (0-100): Match on required + preferred skills. Adjacent stacks count. Synonyms count. Depth in one area beats shallow breadth. Missing a skill is only a -10 if there's zero adjacent signal.
- SENIORITY (0-100): Years of RELEVANT experience weighted by recency and depth. A senior IC for 2 focused years > a junior title for 5. Scope of ownership matters more than title.
- INDUSTRY (0-100): Domain familiarity — sector, company stage, customer profile. Heavy weight for direct match. Adjacent domains with transferable patterns score 60-80.
- TRAJECTORY (0-100): Career direction and growth velocity. Is this person accelerating, plateauing, or pivoting? Builder vs. scaler fit for this specific role. Stage alignment (startup vs. enterprise history).
- OVERALL fit_score: weighted average (skills 35%, seniority 30%, industry 20%, trajectory 15%). Round to nearest integer.
- Compensating signals that raise score even when tools are missing:
  * Worked at the company that makes the tool (insider knowledge)
  * Promoted multiple times at the same employer (trusted, high performer)
  * Delivered at exactly the same company stage as this role requires
  * OSS contributions, patents, public talks in the domain
- "gaps" in the JSON should only list things that genuinely block the hire — not every missing keyword

FRAUD / FAKE PROFILE RED FLAGS TO DETECT:
- Employers that sound suspicious, unverifiable, or from CV mills (e.g. "Techmologics Innovations Pvt Ltd", "Adons Softech", generic IT company names with "Solutions/Systems/Innovations/Technologies" in the name)
- Identical or near-identical phrasing, metrics, or bullet points as if copied from a template
- Stack is unrealistically broad — claims expert-level in every major framework simultaneously
- Metrics are suspiciously perfect on every single bullet (e.g. "improved performance by 40%" on literally every task)
- CV reads as AI-generated: overly formal, no natural variation, generic phrasing, zero personality
- Employer prestige does not match declared seniority (e.g. claims to be a lead architect but all employers are unknown micro-firms)
- Gaps in employment not explained
- Location/timezone not matching stated location

CANDIDATE DOCUMENTS:
---
${cvText}
---

EVALUATION RULES — APPLY ALL OF THESE BEFORE PRODUCING OUTPUT:

## GROUNDING RULE (most important)
Every claim in your output must be traceable to a specific statement in the transcript or resume.
- The TRANSCRIPT always overrides the RESUME. If the resume lists a skill but in the call the candidate contradicts it, hedges significantly, or says they don't know it — reflect the transcript version, not the resume claim.
- Never upgrade, infer, or fill in a skill the candidate did not explicitly confirm. If the candidate says "I don't really know X" or "I've only messed around with it a little" — that is a gap. Write it as a gap. Do not omit or soften it into a strength.
- DO NOT infer tech skills from the CV when a transcript is present. A skill only counts as confirmed if the candidate demonstrated or spoke about it in the call.

## LOGISTICS EXTRACTION (mandatory)
Before writing "Not specified" for salary or availability, re-scan the transcript for:
- Any number tied to salary, comp, "per year," or a range
- Any answer to notice period or availability to start
If either was stated, even approximately, include it verbatim. Only write "Not specified" if truly absent from the transcript.

## NO GENERIC OR FILLER GAPS
Do not invent abstract gaps ("limited data-driven decision making", "unclear metrics orientation") unless the candidate was actually asked about it and gave a vague or negative answer. If you cannot find textual evidence for a gap, do not list it — write "no clear gaps surfaced in this call" or focus only on evidenced gaps.
Prioritize concrete, verifiable gaps: platform/tool mismatches, project scale mismatch, client type mismatch, stated lack of experience — over vague competency language.

## SCALE AND CLIENT-TYPE MATCH
Compare the candidate's actual named clients/projects (size, industry, complexity) against the role's context. A candidate who has only run small local projects is a meaningful gap for an enterprise or high-scale role. Flag this explicitly when relevant — do not treat all eCommerce experience as equivalent regardless of scale.

## SEPARATE VAGUE ANSWERS FROM MISSING SKILLS — these are different risk types:
- Skill/experience gap: candidate lacks a specific tool, platform, or type of experience the role needs.
- Response quality risk: candidate was asked a direct question and gave vague, generic, or non-concrete answers (no specific example, had to ask for question to be repeated, hedged without detail). Call this out separately in screening_questions — do not fold it into Gaps.

## OUTPUT REQUIREMENTS
- For every strength, gap, and tech match: be able to justify it against a specific transcript moment.
- When summarizing tech match: state the candidate's own framing of their proficiency (e.g. "primarily WordPress; has run some Shopify projects" rather than "5+ years Shopify") if the transcript shows a hierarchy of depth.
- If the transcript doesn't clearly answer something the JD requires, write "not addressed in this call" — never default to a generic positive or negative assumption.

Respond ONLY with valid JSON. No markdown, no code fences.

{
  "verdict": "Pass" | "No Pass" | "Flag for Review",
  "justification": "2-3 sentences explaining the decision. If a phone screen is present, reference BOTH the CV evidence AND what was said in the call — especially any discrepancies. Never base the verdict solely on CV keywords.",
  "hard_rejection_reason": "exact reason if No Pass due to hard criterion, else null",
  "fit_score": 0-100 overall fit (weighted: skills 35% + seniority 30% + industry 20% + trajectory 15%),
  "score_breakdown": {
    "skills": 0-100,
    "seniority": 0-100,
    "industry": 0-100,
    "trajectory": 0-100
  },
  "career_dna": {
    "stage_history": "1-2 sentences on the company stages this person has worked at — seed, series, enterprise, agency, etc. and what that implies",
    "builder_vs_scaler": "Builder" | "Scaler" | "Mixed" | "Unknown",
    "builder_vs_scaler_evidence": "one specific sentence of evidence from the CV",
    "promotion_velocity": "1 sentence on how fast they advanced — multiple promotions at same company, job hopping, plateaued, etc.",
    "seniority_depth": "1 sentence on real scope of responsibility — IC, lead, manager — and what it actually entailed based on CV evidence",
    "hidden_gems": ["notable signals not in the JD worth flagging — OSS contributions, patents, public talks, languages, side projects that show exceptional drive or domain depth"]
  },
  "years_experience": "CALCULATION RULE: sum actual job date ranges from the resume, or use a duration the candidate directly stated in the call (e.g. 'three years', 'almost 15 years'). Never estimate from job titles, seniority language, or number of employers. If the resume includes unrelated prior experience (different industry/role), do not add it to a domain-specific total unless the candidate explicitly framed it that way. If dates are ambiguous or missing, return a string like '3 years in Shopify ecosystem per transcript; total career unclear' rather than a single confident integer. Return null only if no date information exists at all.",
  "location_detected": "location found in CV or null",
  "red_flags": ["specific flag 1", "..."] or [],
  "fake_profile_risk": "Low" | "Medium" | "High",
  "fake_profile_signals": ["specific signals detected"] or [],
  "strengths": ["2-3 concrete strengths relevant to this role — grounded in transcript if present, CV otherwise"],
  "gaps": ["STEP 1 — scan the transcript for self-disclosed limitations FIRST, before anything else: (a) moments where the candidate describes their scope as narrower than the role requires ('I mainly do retainer work', 'I've only done a few implementations', 'I manage mid-market clients'), (b) explicit self-limiting language: 'I don't', 'I can't', 'I'm not familiar with', 'that's not really my responsibility', or any hedge on a claimed skill, (c) scope or client-type mismatch between what they described and what the role demands. Quote or closely paraphrase their exact words — these must be the FIRST gaps listed and treated as material if the role requires the opposite. STEP 2 — only after self-disclosed gaps: add platform/tool gaps IF that platform was actually named and discussed in the call or JD. NEVER invent a gap about a tool that was not raised in either document. If truly no limitation surfaced, write 'No material gaps surfaced in this call' — but this should be rare."],
  "borderline": true | false,
  "screening_questions": ["If borderline or Flag, 2-3 specific questions to ask in a screening call to validate the gaps. Each question should be direct and targeted to the specific uncertainty. Empty array if No Pass or clear Pass."],
  "english_written": {
    "level": "A2" | "B1" | "B2" | "C1" | "C2",
    "confidence": "Low" | "Medium" | "High",
    "summary": "1-2 sentences on the quality of written English in the CV — vocabulary range, sentence complexity, grammar, any errors. Note if CV appears translated or AI-written.",
    "passes_bar": true | false
  },
  "bamboohr_note": "ATS note for BambooHR. Plain English, no AI language, no fluff. Use this exact structure with bullet points:\n• Verdict: [Pass/Flag/No Pass] — [fit score]/100\n• Experience: [X years], last role: [Title at Company]\n• Strengths: [2-3 specific strengths with direct evidence — quote or paraphrase from transcript if present, otherwise from CV]\n• Concerns: [specific gaps or risks confirmed in transcript — quote the candidate's exact words when they stated a limitation; if none, write 'None flagged']\n• Logistics: [salary expectation stated in call] | [notice period stated in call] | [availability] — write 'Not specified' ONLY if truly absent from ALL documents. If the candidate said a number, write it verbatim.\n• Next step: [concrete action — e.g. 'Move to phone screen to validate X', 'Reject — hard miss on Y', 'Present to client']",
  "confidence_in_verdict": "High" | "Medium" | "Low",
  "client_presentation": "Slack message to present this candidate to the hiring manager. This is the actual message they will receive — write it ready to paste into Slack. CRITICAL RULES: (1) ALWAYS name actual companies — never 'current company' or 'previous employer'. (2) ALWAYS add context after each fact. (3) BANNED: 'strong background', 'proven track record', 'passionate', 'results-driven', 'solid experience', 'multiple projects', 'various clients'. (4) Slack formatting: use *bold* for labels, bullet points with •. (5) Logistics: include salary and notice period from the transcript — never write 'Not specified' if the candidate stated a number in the call.\n\nExact format:\n[✅/⚠️/❌] *[Candidate Name]* — [Role Title] — [fit_score]/100\n\n• *Experience:* [X years total] — [specific domain, e.g. 'Shopify storefronts for DTC brands in LATAM']\n• *Current role:* [Exact title] at [Exact Company Name] — [what they own: team size, systems built, scope]\n• *Relevant background:* [Previous role title] at [Exact Company Name] — [what's relevant to THIS role]\n• *Tech match:* [Each must-have tech with context — not a bare list. State the candidate's OWN framing of their proficiency as said in the call, not CV keywords]\n• *Standout:* [One concrete thing that makes them interesting — specific project, scope, achievement]\n• *Gaps:* [Gaps confirmed in the transcript — if candidate explicitly disclaimed a skill or described themselves as non-technical, quote their words. If none write 'No critical gaps flagged']\n• *Logistics:* [salary expectation from call] | [notice period from call] | [location] — extract from transcript, not CV\n• *Recommendation:* [One clear action — 'Move to technical interview', 'Present to client', 'Phone screen first to validate X', 'Reject — hard miss on Y']"
}`
}
