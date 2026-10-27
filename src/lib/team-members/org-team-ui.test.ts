// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
let root:Root, host:HTMLDivElement, members:any[], save:any;
const w=window as any;
const flush=async()=>{await act(async()=>{await Promise.resolve();});};
beforeEach(async()=>{
 w.IS_REACT_ACT_ENVIRONMENT=true;
 w.FLOWMATE_CURRENT_USER={role:'admin',email:'admin@garena.com'};
 w.MEMBERS=[];
 members=[{email:'legacy@sea.com',display_name:'Legacy',role:'member',org_team:null,access_active:true,skills:[],open_work:[]},
  {email:'viewer@sea.com',display_name:'Viewer',role:'viewer',org_team:'mkt',viewer_teams:['ops'],access_active:true,skills:[],open_work:[]}];
 w.loadFlowMateTeamMembers=async()=>members;
 w.loadFlowMateAllowedDomains=async()=>[{domain:'sea.com',enabled:true}];
 save=w.saveFlowMateTeamMember=vi.fn(async(input:any)=>{members=members.filter(m=>m.email!==input.email).concat({...input,access_active:true,skills:[],open_work:[]});});
 const source=readFileSync('screens-b.js','utf8');
 const start=source.indexOf('function TeamMembersScreen()');
 const end=source.indexOf('window.TeamMembersScreen = TeamMembersScreen;',start)+'window.TeamMembersScreen = TeamMembersScreen;'.length;
 if(start<0) throw Error('Build screens-b.js before UI regression tests');
 new Function('React','Icon',`const {useState:useStateB,useEffect:useEffectB}=React;\n${source.slice(start,end)}`)(React,()=>null);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(React.createElement(w.TeamMembersScreen)));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
function click(text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);if(!button)throw Error('Missing button: '+text);act(()=>button.click());}
function team(){return host.querySelector('#team-member-dialog select') as HTMLSelectElement;}
async function selectTeam(value:string){await act(async()=>{team().value=value;team().dispatchEvent(new Event('change',{bubbles:true}));});}
async function submit(){await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await flush();}
it('shows team and legacy fallback; editing retains Viewer scope and can clear affiliation',async()=>{
 expect(host.textContent).toContain('Marketing');expect(host.textContent).toContain('ยังไม่ระบุ');
 const manage=host.querySelector('button[aria-label="Manage Viewer"]') as HTMLButtonElement;
 act(()=>manage.click());expect(team().value).toBe('mkt');
 await selectTeam('esport');await submit();
 expect(save.mock.calls[0][0]).toMatchObject({org_team:'esport',role:'viewer',viewer_teams:['ops']});
 expect(host.textContent).toContain('eSport');
 act(()=>(host.querySelector('button[aria-label="Manage Viewer"]') as HTMLButtonElement).click());
 await selectTeam('');await submit();expect(save.mock.calls[1][0].org_team).toBe(null);
});
it('offers exactly one affiliation among the approved teams in Add Member',()=>{
 click('Add member');expect(team().multiple).toBe(false);
 expect([...team().options].map(o=>[o.value,o.text])).toEqual([['','ยังไม่ระบุ'],['mkt','Marketing'],['ops','Operation'],['esport','eSport'],['gdve','GD/VE']]);
});
it('searches by team label without dropping name or email search',async()=>{
 const search=host.querySelector('input[aria-label="Search members"]') as HTMLInputElement;
 for(const term of ['marketing','viewer@sea.com','Viewer']) {
  await act(async()=>Simulate.change(search,{target:{value:term}} as any));
  expect(host.textContent).toContain('Viewer');expect(host.textContent).not.toContain('Legacy');
 }
});
it('disables the team field for an older backend while preserving member save',async()=>{
 members=members.map(({org_team,...row})=>row);
 click('Refresh');await flush();click('Manage');
 expect(team().disabled).toBe(true);await submit();
 expect(save.mock.calls[0][0]).not.toHaveProperty('org_team');
});
it('keeps Team Members restricted to admins',async()=>{
 w.FLOWMATE_CURRENT_USER={role:'member'};
 await act(async()=>root.render(React.createElement(w.TeamMembersScreen)));
 expect(host.textContent).toBe('Admin access required.');expect(host.querySelector('form')).toBe(null);
});
