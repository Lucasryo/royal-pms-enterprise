import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlowStep {
  type: 'message' | 'wait' | 'condition' | 'tag';
  // message
  text?: string;
  // wait
  delay_minutes?: number;
  // condition
  field?: string;
  operator?: string;
  value?: unknown;
  branch_true?: FlowStep[];
  branch_false?: FlowStep[];
  // tag
  tags?: string[];
  action?: 'add' | 'remove';
}

interface ExecuteFlowRequest {
  flow_id: string;
  contact_identifier: string;
  trigger_type: string;
  context?: Record<string, unknown>;
}

async function executeSteps(
  steps: FlowStep[],
  ctx: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  contactId: string | null,
): Promise<{ stepsExecuted: number; log: string[] }> {
  let stepsExecuted = 0;
  const log: string[] = [];

  for (const step of steps) {
    switch (step.type) {
      case 'message': {
        // Record message that would be sent — no actual delivery yet
        const msg = step.text ?? '(empty message)';
        log.push(`[message] Would send: "${msg}"`);
        ctx.last_message_sent = msg;
        stepsExecuted++;
        break;
      }

      case 'wait': {
        const delay = step.delay_minutes ?? 0;
        log.push(`[wait] Delay of ${delay} minute(s) recorded — engine non-blocking`);
        ctx.pending_delay_minutes = delay;
        ctx.pending_since = new Date().toISOString();
        // In a real scheduler this would schedule a resumption job
        stepsExecuted++;
        break;
      }

      case 'condition': {
        const field = step.field ?? '';
        const operator = step.operator ?? 'eq';
        const expected = step.value;
        const actual = ctx[field];

        let result = false;
        if (operator === 'eq') result = actual === expected;
        else if (operator === 'neq') result = actual !== expected;
        else if (operator === 'gt') result = Number(actual) > Number(expected);
        else if (operator === 'lt') result = Number(actual) < Number(expected);
        else if (operator === 'contains')
          result = typeof actual === 'string' && actual.includes(String(expected));
        else if (operator === 'exists') result = actual !== undefined && actual !== null;

        log.push(`[condition] ${field} ${operator} ${expected} → ${result}`);
        ctx.last_condition_result = result;

        const branch = result ? (step.branch_true ?? []) : (step.branch_false ?? []);
        if (branch.length > 0) {
          const sub = await executeSteps(branch, ctx, supabase, contactId);
          stepsExecuted += sub.stepsExecuted;
          log.push(...sub.log);
        }
        stepsExecuted++;
        break;
      }

      case 'tag': {
        if (!contactId) {
          log.push(`[tag] Skipped — no contact_id resolved`);
          stepsExecuted++;
          break;
        }

        const tags = step.tags ?? [];
        const action = step.action ?? 'add';

        // Fetch current tags
        const { data: contact, error } = await supabase
          .from('marketing_contacts')
          .select('tags')
          .eq('id', contactId)
          .single();

        if (error) {
          log.push(`[tag] Error fetching contact: ${error.message}`);
        } else {
          const current: string[] = contact?.tags ?? [];
          const updated =
            action === 'add'
              ? [...new Set([...current, ...tags])]
              : current.filter((t) => !tags.includes(t));

          const { error: updateError } = await supabase
            .from('marketing_contacts')
            .update({ tags: updated, updated_at: new Date().toISOString() })
            .eq('id', contactId);

          if (updateError) {
            log.push(`[tag] Error updating tags: ${updateError.message}`);
          } else {
            log.push(`[tag] ${action} tags [${tags.join(', ')}] on contact ${contactId}`);
            ctx.tags_updated = updated;
          }
        }
        stepsExecuted++;
        break;
      }

      default:
        log.push(`[unknown] Step type "${(step as FlowStep).type}" skipped`);
        stepsExecuted++;
    }
  }

  return { stepsExecuted, log };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Use service role for internal operations; we still validate the caller's JWT
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Validate caller token (anon key / user JWT / service role all accepted)
  const callerToken = authHeader.replace('Bearer ', '');
  const { error: authError } = await supabase.auth.getUser(callerToken);
  const isServiceRole = callerToken === supabaseServiceKey;
  if (authError && !isServiceRole) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: ExecuteFlowRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { flow_id, contact_identifier, context: initialContext = {} } = body;

  if (!flow_id || !contact_identifier) {
    return new Response(
      JSON.stringify({ ok: false, error: 'flow_id and contact_identifier are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Load the active flow
  const { data: flow, error: flowError } = await supabase
    .from('marketing_flows')
    .select('*')
    .eq('id', flow_id)
    .eq('status', 'active')
    .single();

  if (flowError || !flow) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Flow not found or inactive' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Resolve contact_id if possible
  const { data: contact } = await supabase
    .from('marketing_contacts')
    .select('id')
    .or(`phone.eq.${contact_identifier},email.eq.${contact_identifier}`)
    .maybeSingle();

  const contactId: string | null = contact?.id ?? null;

  // Create execution record
  const { data: execution, error: execCreateError } = await supabase
    .from('marketing_flow_executions')
    .insert({
      flow_id,
      contact_id: contactId,
      contact_identifier,
      status: 'running',
      current_step: 0,
      context: { ...initialContext, contact_identifier },
    })
    .select('id')
    .single();

  if (execCreateError || !execution) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Failed to create execution record' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const executionId: string = execution.id;
  const steps: FlowStep[] = Array.isArray(flow.steps) ? flow.steps : [];
  const ctx: Record<string, unknown> = { ...initialContext, contact_identifier };

  let stepsExecuted = 0;
  let finalStatus: 'completed' | 'failed' = 'completed';
  let errorMsg: string | undefined;

  try {
    const result = await executeSteps(steps, ctx, supabase, contactId);
    stepsExecuted = result.stepsExecuted;
    ctx.execution_log = result.log;
  } catch (err) {
    finalStatus = 'failed';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Update execution to final state
  await supabase
    .from('marketing_flow_executions')
    .update({
      status: finalStatus,
      current_step: stepsExecuted,
      context: ctx,
      completed_at: new Date().toISOString(),
      error: errorMsg ?? null,
    })
    .eq('id', executionId);

  return new Response(
    JSON.stringify({
      ok: finalStatus === 'completed',
      execution_id: executionId,
      steps_executed: stepsExecuted,
      error: errorMsg,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
