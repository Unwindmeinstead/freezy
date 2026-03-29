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

    const prompt = `You are analyzing a photo of a ${location}.

Identify ALL visible food and drink items. Return ONLY a valid JSON object — no markdown, no explanation — with exactly this structure:

{
  "items": [
    {
      "name": "item name",
      "category": "Dairy|Produce|Meat & Seafood|Beverages|Condiments & Sauces|Leftovers|Grains & Pantry|Snacks|Other",
      "emoji": "single emoji",
      "quantity": "e.g. '2 bottles', 'half-full carton', '1 bunch'",
      "expiry_concern": "none|soon|urgent"
    }
  ],
  "shopping": [
    { "name": "item", "emoji": "emoji" }
  ]
}

expiry_concern rules:
- "none" = looks fresh / long shelf life
- "soon" = might expire within a few days  
- "urgent" = should be used today / tomorrow

shopping: suggest 4-6 common items that appear to be missing or running low.

Return ONLY valid JSON.`;

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
          temperature: 0.2,
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
      return jsonResponse(extractJsonObject(raw), 200);
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
      return jsonResponse(extractJsonObject(raw), 200);
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
