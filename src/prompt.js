export function buildScreeningPrompt(candidate, track) {
  const trackRequirements = {
    'Predictive Modeling': `Required skills: classical ML (regression, classification, time series/forecasting), experimentation (A/B testing, uplift modeling), feature engineering, scikit-learn, XGBoost/LightGBM, cloud ML platforms (SageMaker, Vertex AI, AzureML). Bonus: causal inference, Bayesian methods.`,
    'LLM/Generative AI': `Required skills: RAG pipelines, fine-tuning (LoRA, QLoRA, PEFT), LangChain/LangGraph, vector databases (Pinecone, Weaviate, pgvector), agent workflows, production LLM deployments, prompt engineering, evaluation frameworks. Bonus: RLHF, multimodal models.`,
    'Computer Vision': `Required skills: CNNs, image segmentation (U-Net, Mask R-CNN), object detection (YOLO, DETR), PyTorch or TensorFlow, production CV pipelines, model optimization (ONNX, TensorRT). Bonus: 3D vision, video understanding, edge deployment.`
  }

  const allTracks = Object.entries(trackRequirements)
    .map(([t, req]) => `${t}:\n${req}`)
    .join('\n\n')

  const emailDomain = (candidate.email || '').split('@')[1] || ''
  const commonDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'live.com', 'me.com', 'msn.com']
  const unusualEmail = emailDomain && !commonDomains.includes(emailDomain.toLowerCase())

  return `You are a senior technical recruiter screening candidates for a Senior Data Scientist role at a US-based data and AI consultancy. The role is 100% remote.

SELECTED TRACK: ${track}
${trackRequirements[track]}

ALL TRACKS (evaluate the candidate against all three independently):
${allTracks}

HARD REJECTION CRITERIA (auto reject = No Pass):
1. Not based in the US or Canada
2. Non-native or clearly non-fluent English writing (consistent grammar errors, awkward phrasing throughout CV)
3. Salary expectation outside $160K–$180K USD range (ONLY reject if salary is explicitly stated AND clearly out of range — if not mentioned, do NOT penalize)
4. Fewer than 5 years of hands-on ML/DS experience in production environments
5. Primary background is Data Analysis, BI, or generic AI enthusiast without production ML experience

FLAG FOR REVIEW (not auto-reject — raise as a flag and set verdict to "Flag for Review"):
- No LinkedIn URL provided: candidate may have it but not listed it — flag it, do not reject
- Unusual email domain (non-gmail/outlook/yahoo/hotmail): ${unusualEmail ? `candidate is using "${emailDomain}" — flag this` : 'not applicable for this candidate'}
- CV reads as AI-generated: suspiciously perfect metrics on every bullet, no natural writing variation
- Stack is unrealistically broad: claims expert-level across every major framework simultaneously
- Inflated job descriptions: only buzzwords, no concrete project details or outcomes
- LinkedIn inconsistencies if URL provided: dates, employers, or titles differ from CV

TRACK FIT LOGIC:
- Evaluate the candidate against all three tracks independently
- If the candidate does NOT fit the selected track (${track}) but clearly fits a different track, the verdict should be "No fit for ${track} — potential fit for [other track]" in the justification, and set verdict to "Flag for Review" rather than "No Pass"
- Only use "No Pass" if the candidate fails a hard rejection criterion OR shows no meaningful fit for any track

CANDIDATE DATA:
Name: ${candidate.name || 'N/A'}
Email: ${candidate.email || 'N/A'}
Location: ${candidate.location || 'N/A'}
LinkedIn URL: ${candidate.linkedin || 'NOT PROVIDED'}
Salary Expectation: ${candidate.salary || 'Not stated'}
CV / Summary:
---
${candidate.cv || 'Not provided'}
---

INSTRUCTIONS:
Respond ONLY with a valid JSON object. No markdown, no code fences, no explanation outside the JSON.

{
  "verdict": "Pass" | "No Pass" | "Flag for Review",
  "justification": "2-3 concise sentences explaining the decision. If no track fit for selected track but fits another, say so explicitly.",
  "hard_rejection_reason": "If No Pass due to a hard criterion, state exactly which one. Otherwise null.",
  "track_fit": {
    "Predictive Modeling": 1-10,
    "LLM/Generative AI": 1-10,
    "Computer Vision": 1-10
  },
  "best_fit_track": "The track this candidate fits best, or null if none",
  "years_experience": estimated number or null,
  "red_flags": ["list", "of", "specific", "flags"] or [],
  "bamboohr_note": "BambooHR note written like an experienced IT recruiter — concise bullet points, plain English, no AI-sounding language. Cover: verdict, key strengths, concerns, next steps. Max 5 bullets.",
  "slack_summary": "Slack message for the hiring team — lead with verdict emoji (✅ Pass / ❌ No Pass / ⚠️ Flag), candidate name and selected track, then 3-4 tight bullets: top strengths, track fit scores, red flags if any, recommendation. Recruiter tone, no corporate fluff."
}`
}
