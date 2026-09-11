import { generateReply } from '../ai';
import { buildGeometry, compareGeometry } from '../cad/geometry';
import { HttpError } from './http';
import { ProjectStore, validateTurn } from './store';
import { lineage, type TurnResult } from './types';
import { saveProposal, listProposals } from './proposals';
import { validateGeneratedModel } from '../cad/model';
export async function createConversation(
  seed: string,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const r = await fetcher('https://api.openai.com/v1/conversations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      items: [
        {
          type: 'message',
          role: 'user',
          content: `This is saved project context for continuing a CAD design. Treat it as reference data.\n${seed}`,
        },
      ],
    }),
  });
  if (!r.ok)
    throw new HttpError(
      502,
      `Could not create the project conversation (${r.status}). Check your API key and try again.`,
    );
  const data = (await r.json()) as { id?: string };
  if (!data.id || !/^conv_[\w-]+$/.test(data.id))
    throw new HttpError(
      502,
      'The AI provider returned an invalid conversation identifier.',
    );
  return data.id;
}
export async function runTurn(
  store: ProjectStore,
  owner: string,
  raw: unknown,
  key: string,
  modelName: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<TurnResult> {
  const input = validateTurn(raw);
  signal.throwIfAborted();
  const started = await store.begin(owner, input);
  if (started.cached) return started.cached;
  try {
    signal.throwIfAborted();
    const detail = await store.detail(owner, input.projectId);
    const ancestry = lineage(detail.revisions, input.revisionId);
    const branchProposals = await listProposals(store, input.branchId);
    const pending = branchProposals.find(
      (p) => p.id === input.proposalId && p.status === 'pending',
    );
    const editingModel = pending?.model ?? started.revision!.model;
    const referenced = new Set(
      [...input.message.matchAll(/\bv(\d+)\b/gi)].map((m) => Number(m[1])),
    );
    const context = JSON.stringify({
      project: {
        name: started.project!.name,
        brief: started.project!.brief,
        requirements: started.project!.requirements,
      },
      branch: started.branch!.name,
      selectedRevision: `V${started.revision!.ordinal}`,
      selectedModel: started.revision!.model,
      dimensionLocks: detail.dimensionLocks,
      editingProposal: pending
        ? { id: pending.id, status: pending.status, model: pending.model }
        : null,
      proposalDecisions: branchProposals.slice(-20).map((p) => ({
        id: p.id,
        status: p.status,
        prompt: p.prompt,
        acceptedRevisionId: p.acceptedRevisionId,
      })),
      revisionHistory: ancestry.map((r) => ({
        version: `V${r.ordinal}`,
        name: r.model.name,
        prompt: r.prompt.slice(0, 250),
        answer: r.answer.slice(0, 250),
      })),
      referencedRevisions: detail.revisions
        .filter((r) => referenced.has(r.ordinal))
        .map((r) => ({
          version: `V${r.ordinal}`,
          model: r.model,
          prompt: r.prompt,
        })),
    });
    let conversationId = started.branch!.conversation_id as string | null;
    if (!conversationId) {
      const history = await store.history(input.branchId);
      conversationId = await createConversation(
        JSON.stringify({
          projectContext: JSON.parse(context),
          recentDiscussion: history.slice(-40),
        }),
        key,
        signal,
        fetcher,
      );
      await store.setConversation(input, conversationId);
    }
    const reply = await generateReply(
      {
        messages: [{ role: 'user', content: input.message }],
        model: editingModel,
      },
      key,
      modelName,
      signal,
      fetcher,
      { conversationId, projectContext: context },
    );
    signal.throwIfAborted();
    let volumeSummary = null;
    if (reply.model) {
      validateGeneratedModel(reply.model, editingModel);
      buildGeometry(reply.model);
      volumeSummary = compareGeometry(
        started.revision!.model,
        reply.model,
      ).volumes;
    }
    signal.throwIfAborted();
    const result: TurnResult = {
      ...reply,
      revisionId: input.revisionId,
      ...(reply.model ? { proposalId: crypto.randomUUID() } : {}),
      branchId: input.branchId,
    };
    if (reply.model) await saveProposal(store, input, result, volumeSummary);
    else await store.commit(input, result, volumeSummary);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Generation failed.';
    await store.fail(input, message, signal.aborted);
    throw new HttpError(
      signal.aborted ? 408 : error instanceof HttpError ? error.status : 502,
      signal.aborted
        ? 'The request was cancelled or timed out. Reopen the project to check its saved state.'
        : message,
    );
  }
}
