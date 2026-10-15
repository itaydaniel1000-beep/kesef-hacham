import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the site's environment variables.
const client = new Anthropic();

const MODEL = "claude-opus-5-5";

const SYSTEM = `אתה Claude, עוזר בצ׳אט באתר "קלוד קוד".
ענה בשפה שבה המשתמש כותב (בדרך כלל עברית). כתוב בצורה ברורה וישירה, והשתמש ב-Markdown כשזה עוזר: כותרות, רשימות ובלוקי קוד.
אין לך גישה למחשבים, לקבצים או למכשירים של המשתמש, ואין לך כלים. אם מבקשים ממך לעשות פעולה כזו, הסבר שאין לך אפשרות לבצע אותה מכאן והצע איך המשתמש יכול לעשות אותה בעצמו.
תן קישורים רק כשהם קשורים ישירות למה שהמשתמש ביקש.`;

const TITLE_SYSTEM = `תן כותרת קצרה לשיחה לפי ההודעה הראשונה שלה: 2 עד 5 מילים, בשפת ההודעה, בלי מרכאות, בלי נקודה ובלי אימוג׳י. החזר רק את הכותרת.`;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_MESSAGES = 200;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Keep only the shapes this app sends: text, and base64 images in user turns.
// Consecutive turns from the same role are merged so the history always alternates.
function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    const blocks = [];
    const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (!Array.isArray(content)) return null;
    for (const b of content) {
      if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        blocks.push({ type: "text", text: b.text });
      } else if (
        m.role === "user" && b && b.type === "image" && b.source && b.source.type === "base64" &&
        IMAGE_TYPES.has(b.source.media_type) && typeof b.source.data === "string"
      ) {
        blocks.push({ type: "image", source: { type: "base64", media_type: b.source.media_type, data: b.source.data } });
      }
    }
    if (!blocks.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

function errorCode(e) {
  if (e instanceof Anthropic.AuthenticationError) return "auth";
  if (e instanceof Anthropic.RateLimitError) return "rate_limited";
  if (e instanceof Anthropic.BadRequestError) return "bad_request";
  if (e instanceof Anthropic.APIConnectionError) return "connection";
  if (e instanceof Anthropic.APIError) return "api";
  return "unknown";
}

async function makeTitle(messages) {
  const first = messages[0].content.filter((b) => b.type === "text").map((b) => b.text).join("\n").slice(0, 2000);
  if (!first) return "שיחה עם תמונה";
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: TITLE_SYSTEM,
    messages: [{ role: "user", content: first }],
  });
  if (res.stop_reason === "refusal") return "צ׳אט חדש";
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text.replace(/^["'״׳]+|["'״׳.]+$/g, "").slice(0, 60) || "צ׳אט חדש";
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const password = process.env.APP_PASSWORD;
  if (password && req.headers.get("x-app-password") !== password) {
    return json({ error: "bad_password" }, 401);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const messages = cleanMessages(body && body.messages);
  if (!messages) return json({ error: "bad_request" }, 400);

  if (body.mode === "title") {
    try { return json({ title: await makeTitle(messages) }); }
    catch (e) { return json({ error: errorCode(e) }, 502); }
  }

  // Stream the answer as newline-delimited JSON events:
  // {t:"d", v:text} a piece of the answer, {t:"reset"} discard what was shown (a fallback model took over),
  // {t:"refusal"} / {t:"cut"} how the answer ended, {t:"err", v:code}, {t:"done"}.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const s = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          output_config: { effort: "medium" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages,
        });
        for await (const ev of s) {
          if (ev.type === "content_block_start" && ev.content_block.type === "fallback") {
            send({ t: "reset" });
          } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            send({ t: "d", v: ev.delta.text });
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ t: "refusal" });
        else if (final.stop_reason === "max_tokens") send({ t: "cut" });
        send({ t: "done" });
      } catch (e) {
        console.error(e);
        send({ t: "err", v: errorCode(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  });
};

export const config = { path: "/api/chat" };
