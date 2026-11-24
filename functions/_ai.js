// One small text completion from whichever AI key the owner added (optional, for voice answers).
export async function complete(env, prompt, maxTokens = 300) {
  if (env.ANTHROPIC_API_KEY) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: maxTokens,
                             messages: [{ role: "user", content: prompt }] }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error("Anthropic: " + JSON.stringify(out).slice(0, 200));
    return out.content.map(c => c.text || "").join("").trim();
  }
  if (env.OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5-mini", messages: [{ role: "user", content: prompt }] }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error("OpenAI: " + JSON.stringify(out).slice(0, 200));
    return out.choices[0].message.content.trim();
  }
  throw new Error("no AI key");
}
