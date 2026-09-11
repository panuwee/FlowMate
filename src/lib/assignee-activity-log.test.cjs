const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('screens-a.jsx','utf8');
const functions=source.slice(source.indexOf('  function getFlowMateActivityMetadata('),source.indexOf('  function extractFlowMateMentionedUserIds('));
function format(event,members={}){
 const context={window:{MEMBERS_BY_ID:members},activeCreativeMembers:[]};
 vm.createContext(context);vm.runInContext(functions,context);
 return context.formatFlowMateActivityEvent(event);
}
const event={event_type:'updated',from_status:'assigned',to_status:'assigned',actorName:'Vee',actor_user_id:'actor',metadata:{action:'assignee_changed',old_member_id:'old',new_member_id:'new',new_member_code:'tong',reason:'Capacity confirmed'}};
test('assignment event takes precedence over unchanged status and includes actor, names, reason',()=>{
 assert.equal(format(event,{old:{name:'Ploy'},new:{name:'Tong'}}),'Vee changed assignee from Ploy to Tong — Reason: Capacity confirmed');
});
test('JSON metadata and event time are retained',()=>{
 const text=format({...event,metadata:JSON.stringify(event.metadata),created_at:'2026-09-11T10:39:18Z'},{old:{name:'Ploy'},new:{name:'Tong'}});
 assert.match(text,/Vee changed assignee from Ploy to Tong/);assert.match(text,/ at Sep 11, 2026/);
});
test('missing directory name and actor are not attributed to current owner or System',()=>{
 const text=format({...event,actorName:'System'});
 assert.equal(text,'Unknown user changed assignee from Unknown assignee to tong — Reason: Capacity confirmed');
});
test('first assignment and absent reason remain explicit',()=>{
 const text=format({...event,metadata:{...event.metadata,old_member_id:null,reason:null}},{new:{name:'Tong'}});
 assert.equal(text,'Vee changed assignee from Unassigned to Tong — Reason: Not recorded');
});
test('ordinary status and comment events keep their existing messages',()=>{
 assert.equal(format({...event,metadata:{},to_status:'review'}),'Vee moved status from assigned to review');
 assert.equal(format({...event,metadata:{action:'add_comment'}}),'Vee added a comment');
});
test('missing historical member field does not imply Unassigned',()=>{
 assert.match(format({...event,metadata:{action:'assignee_changed',new_member_id:'new',new_member_code:'tong'}}),/from Unknown assignee to tong/);
});
