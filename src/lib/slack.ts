// Slack webhook alert sender — Block Kit formatted vishing alerts

import type { ThreatAnalysis } from "./threat-classifier";

/**
 * Send a vishing alert to Slack via incoming webhook.
 * Uses Block Kit for rich formatting.
 */
export async function sendSlackAlert(
  transcript: string,
  analysis: ThreatAnalysis,
  webhookUrl: string
): Promise<void> {
  const topIndicators = analysis.indicators
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const indicatorBlocks = topIndicators.map((ind) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${ind.type}* (${ind.severity} · ${ind.score}/100)\n> _"${ind.evidence}"_`,
    },
  }));

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 VISHING ALERT",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Caller:*\n+1-555-234-8901`,
          },
          {
            type: "mrkdwn",
            text: `*Employee:*\nSarah Chen, Finance`,
          },
          {
            type: "mrkdwn",
            text: `*Risk Score:*\n${analysis.risk_score}/100`,
          },
          {
            type: "mrkdwn",
            text: `*Threat Type:*\n${analysis.threat_type}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary:* ${analysis.summary}`,
        },
      },
      { type: "divider" },
      ...indicatorBlocks,
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recommended Action:* ${analysis.recommended_action}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Full Analysis" },
            style: "primary",
            action_id: "view_analysis",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Mark False Positive" },
            action_id: "false_positive",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Escalate to SOC" },
            style: "danger",
            action_id: "escalate",
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed (${response.status})`);
  }
}
