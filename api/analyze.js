export const config = { runtime: 'edge' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function extractJsonObject(rawText) {
  if (!rawText) {
    return { items: [], shopping: [] };
  }

  const cleaned = rawText.replace(/```json|```/g, '').trim();

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

function clampConfidence(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, num));
}

function normalizeCategory(category) {
  const allowed = new Set([
    'Dairy',
    'Produce',
    'Meat & Seafood',
    'Beverages',
    'Condiments & Sauces',
    'Leftovers',
    'Grains & Pantry',
    'Snacks',
    'Frozen',
    'Other',
  ]);
  return allowed.has(category) ? category : 'Other';
}

function normalizeResponse(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const uncertainItems = Array.isArray(payload?.uncertain_items) ? payload.uncertain_items : [];
  const shopping = Array.isArray(payload?.shopping) ? payload.shopping : [];

  return {
    items: items
      .filter((item) => item?.name)
      .map((item) => ({
        name: String(item.name).trim(),
        category: normalizeCategory(item.category),
        emoji: item.emoji || '📦',
        quantity: item.quantity || 'Visible in frame',
        expiry_concern: ['none', 'soon', 'urgent'].includes(item.expiry_concern) ? item.expiry_concern : 'none',
        confidence: clampConfidence(item.confidence, 0.85),
      }))
      .filter((item) => item.confidence >= 0.72),
    uncertain_items: uncertainItems
      .filter((item) => item?.name)
      .map((item) => ({
        name: String(item.name).trim(),
        emoji: item.emoji || '👀',
        reason: item.reason || 'Visible, but too unclear to confirm',
        confidence: clampConfidence(item.confidence, 0.4),
      })),
    shopping: shopping
      .filter((item) => item?.name)
      .map((item) => ({
        name: String(item.name).trim(),
        emoji: item.emoji || '🛒',
        reason: item.reason || 'Suggested from visible low stock',
      }))
      .slice(0, 6),
    summary: {
      overview: payload?.summary?.overview || payload?.summary || '',
      confidence_note: payload?.summary?.confidence_note || '',
    },
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { base64, location } = body;

    if (!base64 || !location) {
      return jsonResponse({ error: 'Missing base64 or location' }, 400);
    }

    const prompt = `You are analyzing a photo of a ${location} for a premium kitchen inventory app.

Your first job is TRUST, not completeness.

Rules:
- Only include items that are clearly and directly visible in the image.
- Do NOT infer hidden items, likely groceries, or common household staples.
- Do NOT guess based on context, shelf type, packaging color, or what "should" be in a ${location}.
- If a container is too blurry, occluded, too far away, or partially visible, do not promote it to confirmed inventory.
- Put ambiguous detections into uncertain_items instead.
- shopping suggestions must only come from clearly visible low stock, obvious emptiness, or clearly missing basics implied by visible meal ingredients. If that evidence is not strong, return an empty shopping array.
- If the image quality is poor, it is acceptable to return zero confirmed items.

Return ONLY valid JSON with exactly this structure:
{
  "items": [
    {
      "name": "item name",
      "category": "Dairy|Produce|Meat & Seafood|Beverages|Condiments & Sauces|Leftovers|Grains & Pantry|Snacks|Frozen|Other",
      "emoji": "single emoji",
      "quantity": "brief visible estimate",
      "expiry_concern": "none|soon|urgent",
      "confidence": 0.0
    }
  ],
  "uncertain_items": [
    {
      "name": "possible item",
      "emoji": "single emoji",
      "reason": "why it is uncertain",
      "confidence": 0.0
    }
  ],
  "shopping": [
    {
      "name": "item",
      "emoji": "single emoji",
      "reason": "why it was suggested from visible evidence"
    }
  ],
  "summary": {
    "overview": "one short sentence about what was confidently visible",
    "confidence_note": "short sentence explaining overall scan confidence"
  }
}

Confidence rules:
- 0.90 to 1.00 = label/container is clearly identifiable
- 0.75 to 0.89 = likely correct and visibly distinct
- 0.50 to 0.74 = too uncertain for confirmed inventory; move to uncertain_items
- below 0.50 = omit unless useful in uncertain_items

Return strict JSON only.`;

    const groqApiKey = process.env.GROQ_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (groqApiKey) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
          temperature: 0,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` }
              }
            ]
          }]
        })
      });

      if (!groqRes.ok) {
        const err = await groqRes.text();
        console.error('Groq error:', err);
        return jsonResponse({ error: 'Groq API error', detail: err }, 500);
      }

      const data = await groqRes.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      return jsonResponse(normalizeResponse(extractJsonObject(raw)), 200);
    }

    if (anthropicApiKey) {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
              },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      if (!anthropicRes.ok) {
        const err = await anthropicRes.text();
        console.error('Anthropic error:', err);
        return jsonResponse({ error: 'Anthropic API error', detail: err }, 500);
      }

      const data = await anthropicRes.json();
      const raw = data.content?.[0]?.text || '{}';
      return jsonResponse(normalizeResponse(extractJsonObject(raw)), 200);
    }

    return jsonResponse({
      error: 'No AI provider configured',
      detail: 'Set GROQ_API_KEY for Groq or ANTHROPIC_API_KEY for Anthropic.',
    }, 500);

  } catch (err) {
    console.error('Handler error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}
