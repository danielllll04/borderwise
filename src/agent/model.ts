import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { DEMO_ASSIGNMENTS, DEMO_PARTICIPANTS } from '../receipts/adapters.js';

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}
export interface ModelAdapter {
  readonly provider: 'groq' | 'demo';
  readonly available: boolean;
  next(messages: ModelMessage[], tools: ToolDefinition[], signal: AbortSignal): Promise<ToolCall[]>;
}
export class ProviderError extends AppError {}

const toolCallSchema = z.object({
  id: z.string().min(1).max(200), type: z.literal('function'),
  function: z.object({ name: z.string().max(80), arguments: z.string().max(4000) }),
});
const responseSchema = z.object({ choices: z.array(z.object({
  message: z.object({ tool_calls: z.array(toolCallSchema).max(4).optional() }),
})).min(1).max(1) });

/** Server-only direct HTTP client; no SDK or user-supplied endpoint is needed. */
export class GroqAdapter implements ModelAdapter {
  readonly provider = 'groq' as const;
  readonly available: boolean;
  constructor(private readonly apiKey: string | undefined, private readonly model: string | undefined) {
    this.available = Boolean(apiKey?.trim() && model?.trim());
  }
  async next(messages: ModelMessage[], tools: ToolDefinition[], signal: AbortSignal): Promise<ToolCall[]> {
    if (!this.available) throw new ProviderError(503, 'AGENT_UNAVAILABLE', 'Configure GROQ_API_KEY and a tool-calling GROQ_MODEL on the server. Home and plan workflows remain available.');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, messages, tools, tool_choice: 'auto', max_completion_tokens: 1000, stream: false }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel(); // Never surface or log provider error bodies or credentials.
          if ((response.status === 429 || response.status >= 500) && attempt === 0 && !signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, 250));
            continue;
          }
          throw new ProviderError(response.status === 429 ? 429 : 503,
            response.status === 429 ? 'AGENT_RATE_LIMITED' : 'AGENT_PROVIDER_UNAVAILABLE',
            response.status === 429 ? 'The model provider is rate limited; retry later with a new message key.' : 'The model provider is unavailable or rejected its server configuration.');
        }
        // Bound bytes before parsing; model prose/reasoning is discarded and never persisted.
        const reader = response.body?.getReader();
        if (!reader) throw new ProviderError(502, 'AGENT_PROVIDER_RESPONSE_INVALID', 'The model provider returned an invalid response.');
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65536) { await reader.cancel(); throw new ProviderError(502, 'AGENT_PROVIDER_RESPONSE_INVALID', 'The model response exceeded the allowed size.'); }
          chunks.push(value);
        }
        const parsed = responseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        if (!parsed.success) throw new ProviderError(502, 'AGENT_PROVIDER_RESPONSE_INVALID', 'The model provider returned invalid tool calls.');
        return parsed.data.choices[0]!.message.tool_calls ?? [];
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (attempt === 0 && !signal.aborted) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
        const timedOut = signal.aborted || error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        throw new ProviderError(503, timedOut ? 'AGENT_TIMEOUT' : 'AGENT_PROVIDER_UNAVAILABLE', 'The model provider could not complete this request; retry later with a new message key.');
      }
    }
    throw new ProviderError(503, 'AGENT_PROVIDER_UNAVAILABLE', 'The model provider is unavailable.');
  }
}

/** Explicit development-only scripted adapter. It is never selected as a fallback. */
export class DemoAdapter implements ModelAdapter {
  readonly provider = 'demo' as const;
  readonly available = true;
  constructor(private readonly failure?: string) {}
  async next(messages: ModelMessage[]): Promise<ToolCall[]> {
    if (this.failure) throw new ProviderError(this.failure === 'rate_limit' ? 429 : 503, 'AGENT_DEMO_PROVIDER_ERROR', 'Explicit demo adapter: simulated provider failure.');
    const context = JSON.parse(messages[1]!.content!) as { message: string; purchase: boolean; unsupported_currency: boolean; missing: string[]; decision_request: boolean; active_snapshot_id: string | null; selected_snapshot_id: string | null; attachment_id?: string; receipt_draft?: { draft_id: string; version: number } };
    const completed = messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content!) as Record<string, unknown>);
    const call = (name: string, args: unknown = {}): ToolCall[] => [{ id: `demo-${completed.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }];
    if (completed.length === 0) {
      if (context.attachment_id) return call('extract_receipt_review', { attachment_id: context.attachment_id });
      if (context.receipt_draft) {
        if (/\b(?:split|allocat\w*|assign\w*|daniel|tze loon)\b/i.test(context.message) && !/^(?:yes|confirm|save)[.! ]*$/i.test(context.message)) {
          const exact = /\bfood\b.*\b(?:all|three)\b/i.test(context.message) && /\b(?:drinks|beverages)\b.*\bdaniel only\b/i.test(context.message) && /\b(?:additional|extra)\b.*\b(?:payer only|mine)\b/i.test(context.message);
          const account = /krw cash/i.test(context.message) ? 'krw_cash' : /krw card/i.test(context.message) ? 'krw_card' : /myr funding/i.test(context.message) ? 'myr_funding' : undefined;
          const paidAt = context.message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/)?.[0];
          return call('propose_receipt_allocation', { draft_id: context.receipt_draft.draft_id, expected_version: context.receipt_draft.version,
            participant_ids: DEMO_PARTICIPANTS.map(item => item.participant_id), payer_id: 'demo-profile', assignments: exact ? DEMO_ASSIGNMENTS : [],
            ...(account ? { paid_from_account: account } : {}), ...(paidAt ? { paid_at: paidAt } : {}), payment_mode: 'new_payment' });
        }
        return call('read_receipt_review', { draft_id: context.receipt_draft.draft_id });
      }
      if (context.purchase || context.unsupported_currency) return call('show_limitation');
      if (context.selected_snapshot_id) return call('preview_quote', { snapshot_id: context.selected_snapshot_id });
      if (/\b(?:save|confirm|cancel|yes|do it)\b|(?:保存|确认|取消|好的|执行)/iu.test(context.message) && !context.decision_request) return call('get_home');
      if (/\b(?:(?:pending[- ]?)?plans?.*(?:risks?|assess\w*|afford\w*|reserves?)|(?:risks?|assess\w*|afford\w*|reserves?).*plans?)\b/i.test(context.message)) return call('read_pending_plan_risks', { limit: 3 });
      if (/(?:计划.*(?:风险|储备|评估)|(?:风险|储备|评估).*计划)/u.test(context.message)) return call('read_pending_plan_risks', { limit: 3 });
      if (/\b(?:ledger|history)\b|(?:账本|交易历史|交易记录)/iu.test(context.message)) return call('read_ledger', { limit: 3 });
      if (/\b(?:pending plans|list plans)\b|(?:待处理计划|计划列表|查看计划)/iu.test(context.message)) return call('list_plans', { limit: 3 });
      if (context.decision_request) return context.missing.length ? call('request_clarification') : call('compare_options');
      if (/\b(?:balance|budget|reserve)\b|(?:余额|预算|储备金)/iu.test(context.message)) return call('get_home');
      return [];
    }
    const comparison = completed.find(result => result.kind === 'comparison');
    if (comparison && Array.isArray(comparison.snapshot_ids) && comparison.snapshot_ids.length && !completed.some(result => result.kind === 'proposal')) {
      return call('preview_quote', { snapshot_id: comparison.snapshot_ids[0] });
    }
    if (context.active_snapshot_id && /\b(?:resume|yes|continue)\b/i.test(context.message) && !completed.some(result => result.kind === 'proposal')) return call('preview_quote', { snapshot_id: context.active_snapshot_id });
    return [];
  }
}

export function configuredModel(): ModelAdapter {
  if (process.env.AGENT_PROVIDER === 'demo') return new DemoAdapter(process.env.AGENT_DEMO_FAILURE || undefined);
  return new GroqAdapter(process.env.GROQ_API_KEY, process.env.GROQ_MODEL);
}
