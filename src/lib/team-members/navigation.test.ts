import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {it,expect} from 'vitest';
const source=readFileSync('app.jsx','utf8');
function fn(name:string){return source.slice(source.indexOf(`function ${name}(`),source.indexOf('\n}',source.indexOf(`function ${name}(`))+2);}
const sandbox:any={window:{location:{hash:''}}};
const taskMap=source.match(/const TASK_ASSIGN_HASH_TO_ROUTE = \{[\s\S]*?\n\};/);
if(taskMap) vm.runInNewContext(taskMap[0],sandbox);
vm.runInNewContext(source.slice(source.indexOf('const NAV = ['),source.indexOf('const MARKETING_PLAN_HASH_KEYS'))+'\n'+fn('getVisibleNavGroups')+'\n'+fn('isFlowMateRouteAllowedForRole')+'\n'+fn('getFlowMateHashRouteKey'),sandbox);
it('has one Team Members entry for admins and preserves member navigation restrictions',()=>{const admin=sandbox.getVisibleNavGroups('admin').flatMap((g:any)=>g.items);expect(admin.filter((i:any)=>i.key==='team-members')).toHaveLength(1);expect(admin.some((i:any)=>['settings','admin-whitelist'].includes(i.key))).toBe(false);expect(sandbox.isFlowMateRouteAllowedForRole('member','team-members')).toBe(false);expect(sandbox.isFlowMateRouteAllowedForRole('admin','team-members')).toBe(true);});
it('routes both old bookmarks to Team Members without breaking existing queue links',()=>{expect(sandbox.getFlowMateHashRouteKey('#settings')).toBe('team-members');expect(sandbox.getFlowMateHashRouteKey('#admin-whitelist')).toBe('team-members');expect(sandbox.getFlowMateHashRouteKey('#queue')).toBe('attention');});
it('viewer keeps read routes and has no create or admin destination',()=>{
 expect(sandbox.getVisibleNavGroups('viewer').flatMap((g:any)=>g.items).some((i:any)=>i.key==='create')).toBe(false);
 expect(sandbox.isFlowMateRouteAllowedForRole('viewer','create')).toBe(false);
 expect(sandbox.isFlowMateRouteAllowedForRole('viewer','board')).toBe(true);
 expect(sandbox.isFlowMateRouteAllowedForRole('viewer','detail')).toBe(true);
 expect(sandbox.isFlowMateRouteAllowedForRole('viewer','team-members')).toBe(false);
});
it('viewer has no detail mutation rights even for a previously requested or assigned task',()=>{
 const detail=readFileSync('screens-a.jsx','utf8');
 const start=detail.indexOf('  const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === "admin";');
 const end=detail.indexOf('  const detailAssignmentWarnings',start);
 const box:any={window:{FLOWMATE_CURRENT_USER:{role:'viewer'}},w:{archivedAt:null,requesterUserId:'u',assignee:'m',assigneeUserId:'u',isSupabaseRow:true,type:'creative',status:'unassigned'},owner:{userId:'u'},currentUserId:'u',currentTeamMemberId:'m',activeCreativeMembers:[{id:'m',active:true}],battlePassAssignmentHeld:false};
 vm.runInNewContext(detail.slice(start,end)+'\nresult={canModifyDetail,canManageAssignee,canSelfAssignUnassigned};',box);
 expect(box.result).toEqual({canModifyDetail:false,canManageAssignee:false,canSelfAssignUnassigned:false});
});
