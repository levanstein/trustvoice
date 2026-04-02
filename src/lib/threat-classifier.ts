// Workers AI threat classification — Llama 3.3 70B

export interface ThreatIndicator {
  type: string;
  evidence: string;
  severity: "high" | "medium" | "low";
  score: number;
}

export interface ThreatAnalysis {
  risk_score: number;
  threat_level: "safe" | "suspicious" | "dangerous";
  threat_type: string;
  indicators: ThreatIndicator[];
  summary: string;
  recommended_action: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are an enterprise security analyst specializing in voice-based social engineering (vishing) attack detection. You monitor corporate phone systems for a Fortune 500 company.

Analyze the following phone call transcript and evaluate it against these 6 threat categories, scoring each 0-100:

1. EXECUTIVE_IMPERSONATION — Name-dropping executives, claiming authority, "This comes directly from [executive]"
2. FINANCIAL_REQUEST — Wire transfers, payment changes, gift cards, specific dollar amounts, "urgent" payment instructions
3. CREDENTIAL_HARVEST — Passwords, MFA codes, remote access, "Verify your identity by telling me..."
4. URGENCY_PRESSURE — "Must be done immediately," "Don't tell anyone," threats of consequences, short deadlines
5. AUTHORITY_MANIPULATION — "You'll be in trouble," claiming special authorization, "This is confidential," threatening job consequences
6. CALLER_ANOMALIES — Resistance to verification, refusing normal channels, anger when questioned, inconsistent details

Respond with ONLY valid JSON (no markdown, no backticks, no explanation) in this exact format:
{
  "risk_score": <0-100 overall risk>,
  "threat_level": "<safe|suspicious|dangerous>",
  "threat_type": "<e.g. ceo_fraud, credential_theft, invoice_scam, safe_call>",
  "indicators": [
    { "type": "<CATEGORY_NAME>", "evidence": "<verbatim quote from transcript>", "severity": "<high|medium|low>", "score": <0-100> }
  ],
  "summary": "<one sentence summary>",
  "recommended_action": "<what the employee should do>",
  "confidence": <0-100>
}

Rules:
- risk_score < 30 = "safe", 30-60 = "suspicious", > 60 = "dangerous"
- Always include at least 2 indicators, even for safe calls
- Evidence must be verbatim quotes from the transcript
- Be precise and specific in your analysis`;

/**
 * Classify a phone call transcript for vishing threats using Workers AI (Llama 3.3 70B).
 */
export async function classifyThreats(
  transcript: string,
  ai: Ai
): Promise<ThreatAnalysis> {
  const response = await ai.run(
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this phone call transcript:\n\n"${transcript}"`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }
  );

  // Workers AI returns { response: string | object } — handle both
  const aiResult = response as Record<string, unknown>;
  const innerResponse = aiResult.response;

  let parsed: Record<string, unknown>;

  if (typeof innerResponse === "object" && innerResponse !== null) {
    // Local dev: AI already returns parsed JSON object
    parsed = innerResponse as Record<string, unknown>;
  } else {
    // Production: AI returns a JSON string
    const text = typeof innerResponse === "string" ? innerResponse : JSON.stringify(aiResult);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to extract JSON from AI response: ${text}`);
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  try {
    const raw = parsed;

    // Validate and coerce LLM output to expected shape
    const analysis: ThreatAnalysis = {
      risk_score: Math.max(0, Math.min(100, Number(raw.risk_score) || 0)),
      threat_level: "safe", // set below based on risk_score
      threat_type: String(raw.threat_type || "unknown"),
      indicators: Array.isArray(raw.indicators)
        ? raw.indicators.map((ind: Record<string, unknown>) => ({
            type: String(ind.type || "UNKNOWN"),
            evidence: String(ind.evidence || ""),
            severity: (["high", "medium", "low"].includes(ind.severity as string)
              ? ind.severity
              : "low") as "high" | "medium" | "low",
            score: Math.max(0, Math.min(100, Number(ind.score) || 0)),
          }))
        : [],
      summary: String(raw.summary || "No summary provided."),
      recommended_action: String(raw.recommended_action || ""),
      confidence: Math.max(0, Math.min(100, Number(raw.confidence) || 50)),
    };

    // Ensure threat_level matches risk_score
    if (analysis.risk_score < 30) analysis.threat_level = "safe";
    else if (analysis.risk_score <= 60) analysis.threat_level = "suspicious";
    else analysis.threat_level = "dangerous";

    return analysis;
  } catch (err) {
    throw new Error(
      `Failed to parse AI response as JSON: ${err}. Raw: ${JSON.stringify(parsed)}`
    );
  }
}
