import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReply } from '../lib/ai';
import { draftFirstSkill } from '../lib/ai-skills/draft-first';
import { sample, upgradeModel } from '../lib/cad/model';

// Offline contract tests: provider output is a fixture, not proof of live model quality.
void test('draft skill reaches both standalone and durable requests and preserves explanation', async () => {
  const model = upgradeModel(sample);
  for (const autoApply of [undefined, false, true]) {
    let calls = 0;
    const message = 'Drafted a tray using assumed dimensions; you can adjust them.';
    const fetcher: typeof fetch = async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      assert.ok(request.instructions.includes(draftFirstSkill));
      assert.ok(!request.instructions.includes('for questions and clarifications return model:null'));
      assert.ok(request.instructions.includes(autoApply ? 'saved automatically' : 'pending user review'));
      assert.equal(request.conversation, autoApply === undefined ? undefined : 'conv_test');
      return Response.json({status:'completed', output:[{content:[{type:'output_text', text:JSON.stringify({message, model, edits:null})}]}]});
    };
    const reply = await generateReply({messages:[{role:'user',content:'Can you make a tray?'}],model}, 'fake', 'offline', undefined, fetcher,
      autoApply === undefined ? undefined : {conversationId:'conv_test',projectContext:JSON.stringify({selectedModel:model}),autoApply});
    assert.equal(calls, 1);
    assert.equal(reply.message, message);
    assert.deepEqual(reply.model, model);
  }
});
void test('dimension refinement uses targeted edits; explanation-only responses leave model unchanged', async () => {
  const model = upgradeModel(sample), before = structuredClone(model);
  const fetcher: typeof fetch = async () => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({message:'Changed the width to 130 mm.',model:null,edits:{baseId:'current',commands:[{kind:'set-vector',featureId:model.operations[0].id,field:'size',value:[130,80,3]}]}})}]}]});
  const reply = await generateReply({messages:[{role:'user',content:'Make the width 130 mm.'}],model},'fake','offline',undefined,fetcher);
  assert.equal(reply.model?.operations[0].size[0],130);
  assert.deepEqual(reply.model?.operations.slice(1), model.operations.slice(1));
  assert.deepEqual(model,before);
  const answerOnly: typeof fetch = async () => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({message:'Wall thickness is measured in millimeters.',model:null,edits:null})}]}]});
  const answer = await generateReply({messages:[{role:'user',content:'What is wall thickness?'}],model},'fake','offline',undefined,answerOnly);
  assert.equal(answer.model,null);
});
