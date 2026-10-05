const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function runtime(client){
  const context=vm.createContext({window:{flowmateSupabase:client},URL,console});
  vm.runInContext(fs.readFileSync('supabase-quick-task.js','utf8'),context);
  vm.runInContext(fs.readFileSync('supabase-list-data.js','utf8'),context);
  return context;
}
test('typed helper sends selected kind and stable request key; general keeps legacy RPC',async()=>{
  const calls=[];
  const c=runtime({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'link',link_kind:args.p_link_kind}};}});
  await c.window.addFlowMateCreativeAssetLink('CR-TEST','https://example.test/draft',' Draft ','first_draft','request-key');
  assert.equal(calls[0].name,'add_work_item_link_with_kind');
  assert.equal(calls[0].args.p_link_kind,'first_draft');
  assert.equal(calls[0].args.p_request_key,'request-key');
  assert.equal(calls[0].args.p_description,'Draft');
  await c.window.addFlowMateWorkItemLink('CR-TEST','https://example.test/general','Reference');
  assert.equal(calls[1].name,'add_work_item_link');
  assert.equal(calls[1].args.p_link_kind,undefined);
});
test('missing typed RPC and unconfirmed server type never silently save general',async()=>{
  for(const response of [{error:{code:'PGRST202'}},{data:{id:'link',link_kind:'general'}}]){
    let calls=0;const c=runtime({rpc:async()=>{calls++;return response;}});
    await assert.rejects(c.window.addFlowMateCreativeAssetLink('CR-TEST','https://example.test/final','','final_asset','key'),/not installed|did not confirm/);
    assert.equal(calls,1);
  }
});
test('invalid stage and unsafe URLs fail before calling server',async()=>{
  let calls=0;const c=runtime({rpc:async()=>{calls++;return {};}});
  await assert.rejects(c.window.addFlowMateCreativeAssetLink('CR-TEST','javascript:alert(1)','','first_draft','key'));
  await assert.rejects(c.window.addFlowMateCreativeAssetLink('CR-TEST','https://example.test','','general','key'));
  assert.equal(calls,0);
});
function readClient(responses){
  const columns=[];
  return {columns,from(table){assert.equal(table,'work_item_links');return {select(value){columns.push(value);return this;},in(){return this;},is(){return this;},order(){return Promise.resolve(responses.shift());}};}};
}
test('reload preserves server link kind',async()=>{
  const response={data:[{id:'link',link_kind:'final_asset'}],error:null};
  const client=readClient([response]),c=runtime(client);
  assert.equal((await c.flowmateReadWorkItemLinks(['item'])).data[0].link_kind,'final_asset');
  assert.equal(client.columns.length,1);
});
test('old schema fallback applies only to missing link_kind',async()=>{
  for(const code of ['42703','PGRST204']){
    const client=readClient([{error:{code,message:'column link_kind does not exist'}},{data:[{id:'old'}],error:null}]);
    assert.equal((await runtime(client).flowmateReadWorkItemLinks(['item'])).data[0].id,'old');
    assert.equal(client.columns.length,2);assert.ok(!client.columns[1].includes('link_kind'));
  }
  for(const error of [{code:'42501',message:'permission denied'},{code:'42703',message:'column another_field does not exist'},{message:'network failed'}]){
    const client=readClient([{error}]);assert.equal((await runtime(client).flowmateReadWorkItemLinks(['item'])).error,error);
    assert.equal(client.columns.length,1);
  }
});
