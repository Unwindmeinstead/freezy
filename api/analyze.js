export const config = { runtime: 'edge' };

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { base64, location } = body;

    if (!base64 || !location) {
      return new Response(JSON.stringify({ error: 'Missing base64 or location' }), { status: 400 });
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

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
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
      return new Response(JSON.stringify({ error: 'Anthropic API error', detail: err }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const data = await anthropicRes.json();
    let raw = data.content?.[0]?.text || '{}';
    raw = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { items: [], shopping: [] };
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
