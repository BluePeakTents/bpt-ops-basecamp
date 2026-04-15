const { app } = require('@azure/functions');
const Anthropic = require('@anthropic-ai/sdk');

// ─── 5-minute memory cache for AI instruction prompts ───
const promptCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Fallback system prompts (used when Dataverse has no records) ───
const FALLBACK_PROMPTS = {
  ask_ops_system: `You are the Ops Base Camp AI assistant for Blue Peak Tents & Events. You help the operations team (AJ, Jake, Norma, PMs) with:

1. **Load Lists** — Expand invoice line items into full warehouse component pull lists using the BOM Master in Dataverse.
2. **Production Schedules** — Draft production schedules in Semarjian format with crew phasing, milestones, and site logistics.
3. **Inventory Checks** — Answer natural language queries about product availability (restroom trailers, hardwood flooring, tables, chairs, dance floors).
4. **Crew Availability** — Check who's available, find CDL drivers, suggest crew compositions based on job requirements.
5. **Job Q&A** — Pull from Dataverse, production schedules, crew assignments, JULIE/permit status for any job.

Blue Peak is a premium tent and event rental company based in Batavia, IL (Chicago suburbs). Peak season is May–October. The fleet includes ~80 vehicles, ~60 field employees, and 10 PMs.

Key operations context:
- JULIE tickets required for every tent job (7 days before install)
- Permits auto-flagged for all jobs (Norma toggles off exceptions)
- Overnight jobs = distance from Batavia exceeds ~100 miles
- Crew scheduler manages 60+ employees across 30+ department codes
- 10 PMs: Christhian Benitez, Anthony Devereux, Jeremy Pask, Jorge Hernandez, Nate Gorski, Carlos Rosales, Silvano Eugenio, Brendon French, Tim Lasfalk, Zach Schmitt

Be concise, direct, and actionable. The ops team is busy — give answers they can act on immediately.`,

  load_list_generator: `You are the Blue Peak Tents Load List Generator. Given a job's line items from the sales invoice, expand them into a full warehouse component pull list using the BOM Master.

For each line item (e.g., "40x80 Structure Tent"), break it down into:
- Every component needed (frames, legs, beams, pins, stakes, weights, sidewalls, fabric panels, gutters, etc.)
- Quantities based on tent size and configuration
- Warehouse locations if known
- Status: to pick, staged, loaded

Output format: structured JSON array of components with name, quantity, location, notes.
Group by category: Structure, Fabric, Hardware, Accessories, Flooring, Lighting, Climate, Furniture.`,

  production_schedule_generator: `You are Blue Peak Tents' Production Schedule Generator. Given a job's line items, dates, venue, and optionally a crew plan from job costing, you generate a detailed production schedule with milestones.

Phase Types: Pre-Event, Load Out, Install, Event Day, Strike, Post-Event

Think through the REAL order of operations:
1. Pre-Event: permits, engineering, site survey, load list creation
2. Load Out: pull inventory, stage trucks, verify quantities
3. Install: tent frame first, then flooring, walls, lighting, furniture
4. Event Day: tech on-site if booked
5. Strike: furniture out first, then flooring, walls, structure
6. Post-Event: return to warehouse, inventory check, damage log

Response Format: JSON with scheduleName, milestones array (name, type, date, crew, description, status), summary.`,

  bug_report_system: `You are a bug report assistant for the Blue Peak internal tools (Ops Base Camp, Sales Hub). Help users describe bugs clearly and completely.

When a user reports an issue, help them capture:
1. What they were trying to do
2. What happened instead
3. Steps to reproduce
4. Which tab/feature was involved
5. Any error messages they saw

Format the report as a structured summary the dev team can act on. Be empathetic — the user is frustrated — but keep the output concise and technical.`,

  crew_availability: `You are the Blue Peak Tents Crew Availability assistant. Help ops check who's available and suggest crew compositions.

When asked about availability:
- Check the crew scheduler data for the requested date(s)
- Report employees not assigned to any crew
- Highlight CDL drivers (A and B class) specifically
- Flag overtime warnings (5+ or 6+ days in a week)
- Suggest crew compositions based on job requirements (tent size, complexity)

License classes: A CDL (semi-capable), B CDL (C-class trucks), C (standard), D (basic), TVDL (temp)`,

  job_query: `You are the Blue Peak Tents Job Information assistant. Answer questions about any job by pulling from all connected data.

For any job query, check:
- Dataverse job record (dates, status, venue, crew, trucks, amount)
- JULIE ticket status and deadlines
- Permit status
- PM assignment
- Crew assignments and schedule
- Truck allocations
- Notes from sales team

Provide concise, complete answers with all relevant context.`
};

async function getDataverseToken() {
  const tenantId = process.env.DATAVERSE_TENANT_ID;
  const clientId = process.env.DATAVERSE_CLIENT_ID;
  const clientSecret = process.env.DATAVERSE_CLIENT_SECRET;
  const dataverseUrl = process.env.DATAVERSE_URL;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${dataverseUrl}/.default`
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) throw new Error(`Token request failed: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function fetchPrompts(context) {
  const now = Date.now();
  if (promptCache.data && (now - promptCache.fetchedAt) < CACHE_TTL_MS) {
    return promptCache.data;
  }

  try {
    const dataverseUrl = process.env.DATAVERSE_URL;
    if (!dataverseUrl) {
      context.warn('DATAVERSE_URL not configured — skipping prompt fetch');
      return null;
    }

    const token = await getDataverseToken();
    const url = `${dataverseUrl}/api/data/v9.2/cr55d_aiinstructions?$select=cr55d_name,cr55d_prompttext,cr55d_category&$filter=cr55d_isactive eq true`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });

    if (!resp.ok) {
      context.warn('Failed to fetch AI instructions:', resp.status);
      return promptCache.data;
    }

    const body = await resp.json();
    const map = {};
    for (const row of (body.value || [])) {
      map[row.cr55d_name] = row.cr55d_prompttext;
    }

    promptCache.data = map;
    promptCache.fetchedAt = now;
    context.log('Refreshed AI instruction cache:', Object.keys(map).join(', '));
    return map;
  } catch (err) {
    context.warn('Error fetching AI instructions:', err.message);
    return promptCache.data;
  }
}

async function buildClaudeRequest(reqBody, context) {
  const { messages, system, promptKey, skillPrompt, jobContext } = reqBody;
  const max_tokens = Math.min(reqBody.max_tokens || 4096, 16384);

  if (!messages || !Array.isArray(messages)) {
    throw { status: 400, message: 'messages array is required' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw { status: 500, message: 'ANTHROPIC_API_KEY not configured' };
  }

  // Resolve system prompt: explicit system > Dataverse promptKey > hardcoded fallback
  let systemPrompt = system || null;
  let promptSource = 'none';
  if (!systemPrompt && promptKey) {
    const prompts = await fetchPrompts(context);
    if (prompts && prompts[promptKey]) {
      systemPrompt = prompts[promptKey];
      promptSource = 'dataverse';
    } else if (FALLBACK_PROMPTS[promptKey]) {
      systemPrompt = FALLBACK_PROMPTS[promptKey];
      promptSource = 'fallback';
      context.warn(`Using fallback prompt for "${promptKey}"`);
    }
  }

  // Append skill-specific prompt and job context
  if (skillPrompt) {
    systemPrompt = (systemPrompt || '') + '\n\n' + skillPrompt;
  }
  if (jobContext) {
    systemPrompt = (systemPrompt || '') + `\n\nCurrent job context:\n${JSON.stringify(jobContext, null, 2)}`;
  }

  context.log(`[OPS] Prompt: ${promptSource} | ${systemPrompt ? systemPrompt.length + ' chars' : 'NONE'} | key: ${promptKey || 'inline'} | messages: ${messages.length}`);

  const model = 'claude-opus-4-6';
  const requestBody = { model, max_tokens, messages };
  if (systemPrompt) {
    requestBody.system = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
    ];
  }

  return { apiKey, requestBody, systemPrompt, promptKey };
}

// ─── Non-streaming handler ───
app.http('claude-proxy', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'claude-proxy',
  handler: async (request, context) => {
    const start = Date.now();
    try {
      let reqBody;
      try {
        reqBody = await request.json();
      } catch (parseErr) {
        return { status: 400, jsonBody: { error: 'Invalid JSON in request body' } };
      }

      // If client requests streaming, use stream handler
      if (reqBody.stream) {
        return handleStream(reqBody, context, start);
      }

      const { apiKey, requestBody, systemPrompt, promptKey } = await buildClaudeRequest(reqBody, context);
      const client = new Anthropic({ apiKey });

      // Retry with backoff for transient errors
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await client.messages.create(requestBody);
          break;
        } catch (apiErr) {
          if ([429, 500, 529].includes(apiErr.status) && attempt < 2) {
            const wait = (attempt + 1) * 15000;
            context.warn(`API error (${apiErr.status}), retrying in ${wait/1000}s (attempt ${attempt + 1}/3)`);
            await new Promise(r => setTimeout(r, wait));
          } else {
            throw apiErr;
          }
        }
      }

      context.log(`[OPS] Model: ${response.model} | In: ${response.usage?.input_tokens} | Out: ${response.usage?.output_tokens} | Cache W: ${response.usage?.cache_creation_input_tokens || 0} | Cache R: ${response.usage?.cache_read_input_tokens || 0}`);

      return {
        jsonBody: {
          content: response.content,
          model: response.model,
          usage: response.usage,
          stop_reason: response.stop_reason,
          _debug: {
            systemPromptLength: systemPrompt ? systemPrompt.length : 0,
            promptKey: promptKey || null
          }
        }
      };
    } catch (error) {
      context.error('Claude proxy error:', error);
      return {
        status: error.status || 500,
        jsonBody: { error: error.message }
      };
    }
  }
});

// ─── Streaming handler — SSE over POST ───
async function handleStream(reqBody, context, start) {
  try {
    const { apiKey, requestBody, systemPrompt, promptKey } = await buildClaudeRequest(reqBody, context);
    const client = new Anthropic({ apiKey });
    const stream = await client.messages.stream(requestBody);

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          let model = '';
          let usage = {};

          stream.on('message', (message) => {
            model = message.model || model;
            usage = message.usage || usage;
          });

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const sseData = JSON.stringify({ type: 'text', text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            } else if (event.type === 'message_start' && event.message) {
              model = event.message.model || model;
            } else if (event.type === 'message_delta' && event.usage) {
              usage = { ...usage, ...event.usage };
            }
          }

          const finalMessage = await stream.finalMessage();
          model = finalMessage.model || model;
          usage = finalMessage.usage || usage;

          const done = JSON.stringify({
            type: 'done', model, usage,
            stop_reason: finalMessage.stop_reason,
            _debug: { systemPromptLength: systemPrompt ? systemPrompt.length : 0, promptKey: promptKey || null }
          });
          controller.enqueue(encoder.encode(`data: ${done}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          context.log(`[OPS] Stream done | Model: ${model} | In: ${usage.input_tokens} | Out: ${usage.output_tokens} | Cache W: ${usage.cache_creation_input_tokens || 0} | Cache R: ${usage.cache_read_input_tokens || 0}`);
        } catch (streamErr) {
          const errData = JSON.stringify({ type: 'error', error: streamErr.message });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
          context.error('Stream error:', streamErr);
        }
      }
    });

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      },
      body
    };
  } catch (error) {
    context.error('Stream setup error:', error);
    return {
      status: error.status || 500,
      jsonBody: { error: error.message }
    };
  }
}
