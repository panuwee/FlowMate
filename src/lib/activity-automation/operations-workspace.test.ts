import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Window} from 'happy-dom';
import {it,expect,vi} from 'vitest';
const adapter=readFileSync('operations-workspace.jsx','utf8');
function redirected(href:string) {
  const parsed=new URL(href),replace=vi.fn();
  const window:any={};window.parent=window;
  runInNewContext(adapter,{window,location:{pathname:parsed.pathname,search:parsed.search,hash:parsed.hash,hostname:parsed.hostname,href,replace},URL,URLSearchParams,document:{documentElement:{dataset:{}}},localStorage:{getItem:()=>null}});
  return replace;
}
it('old Activity URLs retain TEST filters, search and deep-link identity inside the real shell',()=>{
  const r=redirected('https://example.test/FlowMate/home/Activity-Automation.html?mode=test&run=abc&search=A%26B#detail');
  const target=new URL(r.mock.calls[0][0]);
  expect(target.pathname).toBe('/FlowMate/home/index.html');
  expect(target.hash.split('/')[0]).toBe('#activity-automation');
  expect(decodeURIComponent(target.hash.split('/')[1])).toBe('?mode=test&run=abc&search=A%26B#detail');
});
it('Control URLs preserve section and local role; remote demo cannot bypass the shell',()=>{
  const r=redirected('https://example.test/FlowMate/home/control-center.html?view=history&demo=1&role=lead');
  expect(decodeURIComponent(new URL(r.mock.calls[0][0]).hash.split('/')[1])).toBe('?view=history&demo=1&role=lead');
});
it('embedded views mirror parent theme and address without rewriting another product route',()=>{
  const parent:any={document:{documentElement:{dataset:{theme:'dark'}}},location:{hash:'#activity-automation',pathname:'/FlowMate/home/index.html',search:''},history:{state:{keep:true},replaceState:vi.fn()}};
  const location=new URL('https://example.test/FlowMate/home/Activity-Automation.html?embedded=1&view=overview');
  const originalPush=vi.fn();const history:any={pushState:originalPush,replaceState:vi.fn()};let themeChanged:any;
  const document:any={documentElement:{dataset:{}},addEventListener:vi.fn()};
  const window:any={parent,addEventListener:vi.fn()};
  class Observer {constructor(callback:any){themeChanged=callback;}observe(){}disconnect(){}}
  runInNewContext(adapter,{window,document,location,history,MutationObserver:Observer,URL,URLSearchParams});
  expect(document.documentElement.dataset.theme).toBe('dark');
  parent.document.documentElement.dataset.theme='light';themeChanged();expect(document.documentElement.dataset.theme).toBe('light');
  location.search='?view=runs&mode=test&run=abc';history.pushState({},'',location.href);
  expect(originalPush).toHaveBeenCalledOnce();
  const url=parent.history.replaceState.mock.calls[0][2];
  expect(decodeURIComponent(url.split('/').at(-1))).toBe('?view=runs&mode=test&run=abc');
  parent.history.replaceState.mockClear();parent.location.hash='#my-work';history.replaceState({},'',location.href);
  expect(parent.history.replaceState).not.toHaveBeenCalled();
});
it('Control section restores on reload/back without live RPCs or sending actions',async()=>{
  const w:any=new Window({url:'http://localhost/home/control-center.html?view=history'});
  w.document.body.innerHTML='<div id="preview-root"></div>';
  w.eval(readFileSync('workgrid-control-center.jsx','utf8'));
  const client={rpc:vi.fn(),functions:{invoke:vi.fn()}};
  await w.WorkgridControlCenter.createApp(w.document.getElementById('preview-root'),client,{demo:true});
  expect(w.document.querySelector('nav [aria-current=page]').dataset.key).toBe('history');
  w.document.querySelector('[data-action=tab][data-key=profile]').click();
  expect(new URLSearchParams(w.location.search).get('view')).toBe('profile');
  w.history.replaceState({},'', '?view=history');w.dispatchEvent(new w.PopStateEvent('popstate'));
  expect(w.document.querySelector('nav [aria-current=page]').dataset.key).toBe('history');
  expect(client.rpc).not.toHaveBeenCalled();expect(client.functions.invoke).not.toHaveBeenCalled();
  await w.happyDOM.close();
});
