import Anthropic from '@anthropic-ai/sdk';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'ollama'
  | 'compatible';
type ProviderApi = 'openai-responses' | 'anthropic' | 'chat-completions';
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  api: ProviderApi;
  defaultModel: string;
  modelHint: string;
  /** Fixed endpoint; providers without one need a configured base URL. */
  baseUrl: string;
  keyRequired: boolean;
  keyHint: string;
  /** A user-supplied base URL makes the server fetch arbitrary hosts. */
  customUrl: boolean;
};
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    api: 'openai-responses',
    defaultModel: 'gpt-6-astra',
    modelHint: 'gpt-6-astra',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    keyHint: 'sk-…',
    customUrl: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    api: 'anthropic',
    defaultModel: 'claude-opus-5-5',
    modelHint: 'claude-opus-5-5',
    baseUrl: 'https://api.anthropic.com',
    keyRequired: true,
    keyHint: 'sk-ant-…',
    customUrl: false,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    api: 'chat-completions',
    defaultModel: '',
    modelHint: 'Model name from Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyRequired: true,
    keyHint: 'Google AI Studio key',
    customUrl: false,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    api: 'chat-completions',
    defaultModel: '',
    modelHint: 'provider/model, e.g. anthropic/claude-opus-5-5',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyRequired: true,
    keyHint: 'sk-or-…',
    customUrl: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local models)',
    api: 'chat-completions',
    defaultModel: '',
    modelHint: 'Installed model name',
    baseUrl: 'http://127.0.0.1:11434/v1',
    keyRequired: false,
    keyHint: 'Not required',
    customUrl: true,
  },
  compatible: {
    id: 'compatible',
    label: 'OpenAI-compatible endpoint',
    api: 'chat-completions',
    defaultModel: '',
    modelHint: 'Model name served by the endpoint',
    baseUrl: '',
    keyRequired: false,
    keyHint: 'Optional',
    customUrl: true,
  },
};
export const isProvider = (v: unknown): v is ProviderId =>
  typeof v === 'string' && Object.hasOwn(PROVIDERS, v);

export type AIConnection = {
  provider: ProviderId;
  model: string;
  key: string;
  baseUrl?: string;
  source?: 'personal' | 'server';
};
/** A bare string is an OpenAI key, as used before multiple providers existed. */
export type AIAccess = string | AIConnection;
export function toConnection(access: AIAccess, model: string): AIConnection {
  return typeof access === 'string'
    ? { provider: 'openai', key: access, model }
    : access;
}
export const endpointOf = (ai: AIConnection) =>
  (ai.baseUrl || PROVIDERS[ai.provider].baseUrl).replace(/\/+$/, '');
export const keepsConversation = (ai: AIConnection) =>
  PROVIDERS[ai.provider].api === 'openai-responses';

type Schema = Record<string, unknown>;
/** Remove constraints that some providers reject; replies are validated locally. */
export function relaxSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(relaxSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Schema = {};
  for (const [k, v] of Object.entries(schema))
    if (
      ![
        'minimum',
        'maximum',
        'minItems',
        'maxItems',
        'minLength',
        'maxLength',
        'pattern',
      ].includes(k)
    )
      out[k] = relaxSchema(v);
  return out;
}

export type StructuredRequest = {
  instructions: string;
  input: { role: 'user' | 'assistant'; content: string }[];
  schema: Schema;
  conversationId?: string;
};
const providerError = (status: number) =>
  new Error(
    status === 401 || status === 403
      ? 'The API key was rejected. Check the AI connection.'
      : status === 429
        ? 'The API usage limit was reached. Check billing or try again later.'
        : status === 404
          ? 'The AI provider did not recognise the model or endpoint. Check the AI connection.'
          : `The AI service could not complete the request (${status}). Check your model access and try again.`,
  );
const incomplete = () =>
  new Error(
    'The AI answer was incomplete. Try a simpler request. Your model has not changed.',
  );
const refused = () =>
  new Error('The AI could not help with this request. Try a different design.');

/** Send one request for a JSON reply and return its raw text. */
export async function requestStructured(
  ai: AIConnection,
  req: StructuredRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const api = PROVIDERS[ai.provider].api;
  if (api === 'anthropic') return anthropic(ai, req, signal, fetcher);
  if (api === 'chat-completions') return chat(ai, req, signal, fetcher);
  return responses(ai, req, signal, fetcher);
}

async function responses(
  ai: AIConnection,
  req: StructuredRequest,
  signal: AbortSignal | undefined,
  fetcher: typeof fetch,
) {
  const response = await fetcher(`${endpointOf(ai)}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.key}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: ai.model,
      store: !!req.conversationId,
      ...(req.conversationId ? { conversation: req.conversationId } : {}),
      max_output_tokens: 7000,
      instructions: req.instructions,
      input: req.input,
      text: {
        format: {
          type: 'json_schema',
          name: 'cad_reply',
          strict: true,
          schema: req.schema,
        },
      },
    }),
  });
  if (!response.ok) throw providerError(response.status);
  const data = (await response.json()) as {
    status?: string;
    output?: {
      content?: { type: string; text?: string; refusal?: string }[];
    }[];
  };
  if (data.status !== 'completed') throw incomplete();
  const content = data.output?.flatMap((o) => o.content ?? []) ?? [];
  if (content.some((c) => c.type === 'refusal')) throw refused();
  return content
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
}

const stripFence = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

async function chat(
  ai: AIConnection,
  req: StructuredRequest,
  signal: AbortSignal | undefined,
  fetcher: typeof fetch,
) {
  const base = endpointOf(ai);
  if (!base) throw new Error('The AI connection needs an endpoint URL.');
  const response = await fetcher(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...(ai.key ? { Authorization: `Bearer ${ai.key}` } : {}),
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: ai.model,
      messages: [{ role: 'system', content: req.instructions }, ...req.input],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cad_reply',
          strict: true,
          schema: relaxSchema(req.schema),
        },
      },
    }),
  });
  if (!response.ok) throw providerError(response.status);
  const data = (await response.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string | null; refusal?: string | null };
    }[];
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw refused();
  if (!choice?.message?.content || choice.finish_reason === 'length')
    throw incomplete();
  return stripFence(choice.message.content);
}

// Server-side refusal fallbacks are accepted on these models only.
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);
async function anthropic(
  ai: AIConnection,
  req: StructuredRequest,
  signal: AbortSignal | undefined,
  fetcher: typeof fetch,
) {
  // No SDK retries: an uncertain paid request is never repeated automatically.
  const client = new Anthropic({
    apiKey: ai.key,
    fetch: fetcher,
    maxRetries: 0,
    ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}),
  });
  const fallback = FALLBACK_MODELS.has(ai.model);
  let message;
  try {
    message = await client.beta.messages.create(
      {
        model: ai.model,
        max_tokens: 16000,
        system: req.instructions,
        messages: req.input,
        output_config: {
          effort: 'high',
          format: {
            type: 'json_schema',
            schema: relaxSchema(req.schema) as Schema,
          },
        },
        ...(fallback
          ? {
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default' as const,
            }
          : {}),
      },
      { signal },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw e;
    if (e instanceof Anthropic.APIError && typeof e.status === 'number')
      throw providerError(e.status);
    throw new Error(
      'The AI provider could not be reached. Check the network connection.',
    );
  }
  if (message.stop_reason === 'refusal') throw refused();
  if (message.stop_reason === 'max_tokens') throw incomplete();
  return message.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('');
}
