export const config = { runtime: 'edge' };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;
const PROVIDER_TIMEOUT_MS = 25000;
const VALID_LOCATIONS = new Set(['fridge', 'freezer', 'pantry']);
const VALID_CATEGORIES = new Set([
  'Dairy',
  'Produce',
  'Meat & Seafood',
  'Beverages',
  'Condiments & Sauces',
  'Leftovers',
  'Grains & Pantry',
  'Snacks',
  'Other',
]);
const VALID_EXPIRY = new Set(['none', 'soon', 'urgent']);

function getAllowedOrigin(origin) {
  if (!origin) return null;

  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  const allowed = new Set([...configured, ...defaults]);
  const vercelUrl = process.env.VERCEL_URL;

  if (vercelUrl) {
    allowed.add(`https://${vercelUrl}`);
  }

  return allowed.has(origin) ? origin : null;
}

function buildHeaders(origin) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const allowedOrigin = getAllowedOrigin(origin);

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers.Vary = 'Origin';
  }

  return headers;
}

function jsonResponse(body, status = 200, origin = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildHeaders(origin),
  });
}

function optionsResponse(origin) {
  return new Response(null, {
    status: 204,
    headers: buildHeaders(origin),
  });
}

function estimateBase64Bytes(base64) {
  const cleaned = String(base64 || '').replace(/\s+/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function normalizeImageList(body) {
  if (Array.isArray(body.images)) {
    return body.images.filter(Boolean);
  }
  return body.base64 ? [body.base64] : [];
}

function extractJsonObject(rawText) {
  if (!rawText) {
    return { items: [], shopping: [] };
  }

  const cleaned = String(rawText).replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return { items: [], shopping: [] };
      }
    }

    return { items: [], shopping: [] };
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanEmoji(value, fallback) {
  const cleaned = cleanText(value, 8);
  return cleaned || fallback;
}

function sanitizeModelOutput(parsed) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const rawShopping = Array.isArray(parsed?.shopping) ? parsed.shopping : [];

  const items = rawItems
    .slice(0, 60)
    .map(item => {
      const name = cleanText(item?.name, 80);
      if (!name) return null;

      const category = VALID_CATEGORIES.has(item?.category) ? item.category : 'Other';
      const expiryConcern = VALID_EXPIRY.has(item?.expiry_concern) ? item.expiry_concern : 'none';

      return {
        name,
        category,
        emoji: cleanEmoji(item?.emoji, '🍽️'),
        quantity: cleanText(item?.quantity, 40),
        expiry_concern: expiryConcern,
      };
    })
    .filter(Boolean);

  const shopping = rawShopping
    .slice(0, 10)
    .map(item => {
      const name = cleanText(item?.name, 60);
      if (!name) return null;
      return {
        name,
        emoji: cleanEmoji(item?.emoji, '🛒'),
      };
    })
    .filter(Boolean);

  return { items, shopping };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req) {
  const origin = req.headers.get('origin');
  const allowedOrigin = getAllowedOrigin(origin);

  if (req.method === 'OPTIONS') {
    return optionsResponse(origin);
  }

  if (origin && !allowedOrigin) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    const body = await req.json();
    const location = cleanText(body?.location, 20).toLowerCase();
    const images = normalizeImageList(body);

    if (!VALID_LOCATIONS.has(location)) {
      return jsonResponse({ error: 'Invalid location' }, 400, origin);
    }

    if (!images.length) {
      return jsonResponse({ error: 'Missing image payload' }, 400, origin);
    }

    if (images.length > MAX_IMAGES) {
      return jsonResponse({ error: `Too many images. Max ${MAX_IMAGES}.` }, 400, origin);
    }

    const invalidImage = images.find(image => {
      if (typeof image !== 'string') return true;
      return estimateBase64Bytes(image) > MAX_IMAGE_BYTES;
    });

    if (invalidImage) {
      return jsonResponse({ error: `Image too large. Max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB per image.` }, 413, origin);
    }

    const prompt = `You are analyzing ${images.length} image(s) of a ${location}.

Identify only visible food and drink items that you can recognize with reasonable confidence. Do not invent hidden items.

Return ONLY a valid JSON object with exactly this structure:
{
  "items": [
    {
      "name": "item name",
      "category": "Dairy|Produce|Meat & Seafood|Beverages|Condiments & Sauces|Leftovers|Grains & Pantry|Snacks|Other",
      "emoji": "single emoji",
      "quantity": "short estimate such as 2 bottles or half-full carton",
      "expiry_concern": "none|soon|urgent"
    }
  ],
  "shopping": [
    { "name": "item", "emoji": "emoji" }
  ]
}

Rules:
- If uncertain, leave the item out.
- Deduplicate the same item seen in multiple images.
- Use "urgent" only when visible evidence strongly suggests it should be used immediately.
- Suggest at most 6 shopping items that appear missing or low.

Return ONLY valid JSON.`;

    const groqApiKey = process.env.GROQ_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    let raw = '{}';

    if (groqApiKey) {
      const groqRes = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...images.map(image => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image}` },
              })),
            ],
          }],
        }),
      });

      if (!groqRes.ok) {
        const err = await groqRes.text();
        console.error('Groq error:', groqRes.status, err);
        return jsonResponse({ error: 'Vision provider request failed' }, 502, origin);
      }

      const data = await groqRes.json();
      raw = data.choices?.[0]?.message?.content || '{}';
      return jsonResponse(sanitizeModelOutput(extractJsonObject(raw)), 200, origin);
    }

    if (anthropicApiKey) {
      const anthropicRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              ...images.map(image => ({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: image },
              })),
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!anthropicRes.ok) {
        const err = await anthropicRes.text();
        console.error('Anthropic error:', anthropicRes.status, err);
        return jsonResponse({ error: 'Vision provider request failed' }, 502, origin);
      }

      const data = await anthropicRes.json();
      raw = data.content?.[0]?.text || '{}';
      return jsonResponse(sanitizeModelOutput(extractJsonObject(raw)), 200, origin);
    }

    return jsonResponse({
      error: 'No AI provider configured',
      detail: 'Set GROQ_API_KEY for Groq or ANTHROPIC_API_KEY for Anthropic.',
    }, 500, origin);
  } catch (err) {
    if (err?.name === 'AbortError') {
      return jsonResponse({ error: 'Vision provider timed out' }, 504, origin);
    }

    console.error('Handler error:', err);
    return jsonResponse({ error: 'Invalid request' }, 400, origin);
  }
}
