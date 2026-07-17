import { mergeAiPlan } from "./prompt-planner.js";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export async function enhancePlanWithProxy(prompt, localPlan, proxyUrl) {
  const endpoint = normalizeUrl(proxyUrl);
  if (!endpoint) return localPlan;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "plan-vj-video-searches",
        prompt,
        responseShape: {
          queries: ["string"],
          exclusions: ["string"],
          suggestedScene: "Clean | Dream | VHS | Neon | Acid | Noir | Mono",
          suggestedInterval: "number",
          summary: "string"
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`AI planner returned ${response.status}`);
    const payload = await response.json();
    return mergeAiPlan(localPlan, payload?.plan || payload);
  } finally {
    clearTimeout(timeout);
  }
}
