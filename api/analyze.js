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

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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

function normalizeBox(box) {
  if (!box || typeof box !== 'object') {
    return null;
  }
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite)) {
    return null;
  }
  const clamped = {
    x: Math.max(0, Math.min(1000, x)),
    y: Math.max(0, Math.min(1000, y)),
    w: Math.max(1, Math.min(1000, w)),
    h: Math.max(1, Math.min(1000, h)),
  };
  if (clamped.x + clamped.w > 1000) {
    clamped.w = 1000 - clamped.x;
  }
  if (clamped.y + clamped.h > 1000) {
    clamped.h = 1000 - clamped.y;
  }
  return clamped.w > 0 && clamped.h > 0 ? clamped : null;
}

function specificityScore(name) {
  const value = String(name || '').trim();
  if (!value) {
    return 0;
  }
  return value.split(/\s+/).length * 10 + value.length;
}

function findMatchingKey(map, name) {
  const target = normalizeName(name);
  if (map.has(target)) {
    return target;
  }
  for (const key of map.keys()) {
    if (key.includes(target) || target.includes(key)) {
      return key;
    }
  }
  return null;
}

function normalizeResponse(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const uncertainItems = Array.isArray(payload?.uncertain_items) ? payload.uncertain_items : [];
  const shopping = Array.isArray(payload?.shopping) ? payload.shopping : [];
  const mergedItems = new Map();
  const mergedUncertain = new Map();
  const mergedShopping = new Map();

  items
    .filter((item) => item?.name)
    .map((item) => ({
      name: String(item.name).trim(),
      category: normalizeCategory(item.category),
      emoji: item.emoji || '📦',
      quantity: item.quantity || 'Visible in frame',
      expiry_concern: ['none', 'soon', 'urgent'].includes(item.expiry_concern) ? item.expiry_concern : 'none',
      confidence: clampConfidence(item.confidence, 0.85),
      frame_index: Number.isInteger(item.frame_index) ? Math.max(0, Math.min(5, item.frame_index)) : 0,
      box: normalizeBox(item.box),
    }))
    .filter((item) => item.confidence >= 0.72)
    .forEach((item) => {
      const key = `${normalizeName(item.name)}|${item.category}`;
      const prev = mergedItems.get(key);
      if (!prev || item.confidence > prev.confidence) {
        mergedItems.set(key, item);
      }
    });

  uncertainItems
    .filter((item) => item?.name)
    .map((item) => ({
      name: String(item.name).trim(),
      emoji: item.emoji || '👀',
      reason: item.reason || 'Visible, but too unclear to confirm',
      confidence: clampConfidence(item.confidence, 0.4),
    }))
    .forEach((item) => {
      const key = normalizeName(item.name);
      const prev = mergedUncertain.get(key);
      if (!prev || item.confidence > prev.confidence) {
        mergedUncertain.set(key, item);
      }
    });

  shopping
    .filter((item) => item?.name)
    .map((item) => ({
      name: String(item.name).trim(),
      emoji: item.emoji || '🛒',
      reason: item.reason || 'Suggested from visible low stock',
    }))
    .forEach((item) => {
      const key = normalizeName(item.name);
      if (!mergedShopping.has(key)) {
        mergedShopping.set(key, item);
      }
    });

  return {
    items: Array.from(mergedItems.values()),
    uncertain_items: Array.from(mergedUncertain.values()).slice(0, 8),
    shopping: Array.from(mergedShopping.values()).slice(0, 6),
    summary: {
      overview: payload?.summary?.overview || payload?.summary || '',
      confidence_note: payload?.summary?.confidence_note || '',
    },
  };
}

function normalizeReadPass(payload) {
  const reads = Array.isArray(payload?.reads) ? payload.reads : Array.isArray(payload?.items) ? payload.items : [];
  return reads
    .filter((item) => item?.name)
    .map((item) => ({
      name: String(item.name).trim(),
      category: normalizeCategory(item.category),
      emoji: item.emoji || '📦',
      quantity: item.quantity || 'Visible in crop',
      expiry_concern: ['none', 'soon', 'urgent'].includes(item.expiry_concern) ? item.expiry_concern : 'none',
      confidence: clampConfidence(item.confidence, 0.72),
      frame_index: Number.isInteger(item.frame_index) ? Math.max(0, Math.min(5, item.frame_index)) : 0,
      box: normalizeBox(item.box),
    }))
    .filter((item) => item.confidence >= 0.74);
}

function mergeVisionPasses(primary, secondaryReads) {
  const merged = {
    items: [...primary.items],
    uncertain_items: [...primary.uncertain_items],
    shopping: [...primary.shopping],
    summary: primary.summary,
  };
  const itemMap = new Map();
  merged.items.forEach((item) => itemMap.set(normalizeName(item.name), item));

  secondaryReads.forEach((read) => {
    const matchKey = findMatchingKey(itemMap, read.name);
    const existing = matchKey ? itemMap.get(matchKey) : null;
    if (existing) {
      if (specificityScore(read.name) > specificityScore(existing.name) && read.confidence >= existing.confidence - 0.03) {
        existing.name = read.name;
        existing.emoji = read.emoji || existing.emoji;
        existing.category = read.category || existing.category;
      }
      if ((!existing.quantity || existing.quantity === 'Visible in frame') && read.quantity) {
        existing.quantity = read.quantity;
      }
      if (!existing.box && read.frame_index === 0 && read.box) {
        existing.box = read.box;
      }
      existing.confidence = Math.max(existing.confidence, read.confidence);
      return;
    }
    merged.items.push(read);
    itemMap.set(normalizeName(read.name), read);
  });

  merged.uncertain_items = merged.uncertain_items.filter((item) => !findMatchingKey(itemMap, item.name));
  return merged;
}

async function callGroqVision(apiKey, frames, prompt) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
          ...frames.map((frame) => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${frame}` }
          }))
        ]
      }]
    })
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    console.error('Groq error:', err);
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await groqRes.json();
  return extractJsonObject(data.choices?.[0]?.message?.content || '{}');
}

async function callAnthropicVision(apiKey, frames, prompt) {
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          ...frames.map((frame) => ({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: frame }
          })),
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    console.error('Anthropic error:', err);
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await anthropicRes.json();
  return extractJsonObject(data.content?.[0]?.text || '{}');
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
    const { base64, frames, location, captureMode } = body;
    const normalizedFrames = Array.isArray(frames)
      ? frames.filter((frame) => typeof frame === 'string' && frame.length > 100).slice(0, 6)
      : [];
    if (!normalizedFrames.length && typeof base64 === 'string' && base64.length > 100) {
      normalizedFrames.push(base64);
    }

    if (!normalizedFrames.length || !location) {
      return jsonResponse({ error: 'Missing frames or location' }, 400);
    }

    const prompt = `You are analyzing ${normalizedFrames.length > 1 ? 'multiple frames from a sweep of' : 'a photo of'} a ${location} for a premium kitchen inventory app.

Image notes:
- Frame 0 is the canonical reference image for labeling when possible.
- If additional images are present in photo mode, they are support crops from the same photo for reading labels and small objects.
- If additional images are present in sweep mode, they are separate coverage views across the same space.

Your first job is TRUST, not completeness.

Rules:
- The input may contain 1 to 6 images from the same ${location}. Use all frames together as one inventory pass, and deduplicate the final result.
- Treat different frames as different coverage zones of the same space. If an item is clear in one frame and absent in another, it still counts.
- Look carefully at front rows, rear rows, door shelves, produce drawers, freezer bins, and partially occluded areas when visible.
- Prefer specific packaged food names when labels are readable. If not readable, use a truthful generic label like "yogurt cups" or "green condiment bottle".
- Only include items that are clearly and directly visible in at least one frame.
- Do NOT infer hidden items, likely groceries, or common household staples.
- Do NOT guess based on context, shelf type, packaging color, or what "should" be in a ${location}.
- If a container is too blurry, occluded, too far away, or partially visible, do not promote it to confirmed inventory.
- Put ambiguous detections into uncertain_items instead.
- If there are several similar visible units, consolidate them into one item with an honest quantity estimate.
- For each confirmed item, include "frame_index" for the frame where the item is best seen.
- If the item is clearly visible in frame 0, include a "box" with normalized coordinates on frame 0 using a 0..1000 space:
  { "x": left, "y": top, "w": width, "h": height }
- If you cannot place the item reliably on frame 0, set "box" to null.
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
      "confidence": 0.0,
      "frame_index": 0,
      "box": { "x": 0, "y": 0, "w": 0, "h": 0 }
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

    const cropReadPrompt = `You are doing a second-pass read on images from a ${location} inventory scan.

Goal:
- Recover small items, label text, and more specific product names from close-up support images.
- Be conservative. This pass should improve specificity, not invent groceries.

Rules:
- The first image may be the wide reference frame. Remaining images may be crops or additional sweep views.
- Return only items you can see well enough to name confidently.
- Prefer a more specific name when text or packaging makes it clear.
- Do not repeat the same item multiple times under slightly different names.
- If you cannot tell, omit it.
- If the item is visible on frame 0, include a normalized 0..1000 "box". Otherwise use null.

Return strict JSON:
{
  "reads": [
    {
      "name": "specific visible item name",
      "category": "Dairy|Produce|Meat & Seafood|Beverages|Condiments & Sauces|Leftovers|Grains & Pantry|Snacks|Frozen|Other",
      "emoji": "single emoji",
      "quantity": "brief visible estimate",
      "expiry_concern": "none|soon|urgent",
      "confidence": 0.0,
      "frame_index": 0,
      "box": { "x": 0, "y": 0, "w": 0, "h": 0 }
    }
  ]
}`;

    const groqApiKey = process.env.GROQ_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (groqApiKey) {
      const primary = normalizeResponse(await callGroqVision(groqApiKey, normalizedFrames, prompt));
      const secondaryFrames = captureMode === 'photo' ? normalizedFrames : normalizedFrames.slice(0, Math.min(4, normalizedFrames.length));
      const readPass = normalizeReadPass(await callGroqVision(groqApiKey, secondaryFrames, cropReadPrompt));
      return jsonResponse(mergeVisionPasses(primary, readPass), 200);
    }

    if (anthropicApiKey) {
      const primary = normalizeResponse(await callAnthropicVision(anthropicApiKey, normalizedFrames, prompt));
      const secondaryFrames = captureMode === 'photo' ? normalizedFrames : normalizedFrames.slice(0, Math.min(4, normalizedFrames.length));
      const readPass = normalizeReadPass(await callAnthropicVision(anthropicApiKey, secondaryFrames, cropReadPrompt));
      return jsonResponse(mergeVisionPasses(primary, readPass), 200);
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
