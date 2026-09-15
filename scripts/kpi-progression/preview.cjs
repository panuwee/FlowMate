// Isolated synthetic preview. No Supabase client, credentials or live requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../..');
const person={owner_member_id:'preview-ploy',owner_name:'Ploy',owner_code:'ploy'};
const rows=[7,8,9].flatMap(month=>Array.from({length:month===9?20:month===8?16:12},(_,i)=>{
 const m=String(month).padStart(2,'0'),date=n=>`2026-${m}-${String(n).padStart(2,'0')}`;
 return {work_item_id:`demo-${m}-${i}`,display_id:`DEMO-${m}-${i+1}`,title:`Campaign creative ${i+1}`,status:'delivered',requester_name:'Requester (demo)',asset_type:'static-graphic',created_at:date(1)+'T02:00:00Z',assigned_at:date(2)+'T02:00:00Z',started_at:date(3)+'T02:00:00Z',acknowledge_at:date(3)+'T02:00:00Z',review_submitted_at:date(i%4===0?8:5)+'T02:00:00Z',delivery_at:date(10)+'T02:00:00Z',delivered_at:date(10)+'T02:00:00Z',due_date:date(6),evaluation_due:date(6),created_due:date(6),assigned_due:date(6),launch_date:date(12),evaluation_launch:date(12),created_buffer_working_days:4,assigned_buffer_working_days:i%5===0?1:3,acknowledge_working_days:2,queue_working_days:1,assigned_acknowledge_working_days:1,production_working_days:month===7?3:month===8?2.5:2,launch_buffer_working_days:i%4===0?2:5,delivered_ai_tags:i<8?['AI']:[],ai_tags:i<8?['AI']:[],ai_evidence_source:'delivery_snapshot',deadline_source:'first_assignment_snapshot',start_snapshot:person,review_snapshot:person,delivery_snapshot:person,data_quality_flags:[],exception_flags:[],brief_evidence:[],deadline_history:[]};
}));
const boot=`window.loadFlowMateCreativeReport=async()=>(${JSON.stringify({rows,asOf:'2026-09-15T05:00:00Z',calendarActiveN:8})});window.previewExports=[];window.flowmateDownloadWorkbook=(name,sheets)=>window.previewExports.push({name,sheets});ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(FlowMateCreativeReportScreen,{requesterView:()=>null}));`;
const react=path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js');
const reactDom=path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js');
const assets={'/react.js':react,'/react-dom.js':reactDom,'/garena/colors_and_type.css':path.join(root,'garena/colors_and_type.css')};
for(const name of ['app.css','creative-kpi-report.css','creative-kpi-report.js','screens-creative-kpi.js'])assets['/'+name]=path.join(root,name);
const html=`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Creative KPI — synthetic preview</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/creative-kpi-report.css"><style>body{margin:0;background:#f5f7f9}.preview-note{padding:8px 24px;background:#fff1ce;color:#5f4317;font:13px sans-serif}.creative-report{max-width:1400px;margin:auto;padding:24px}</style><body><div class="preview-note">ข้อมูลจำลองสำหรับตรวจหน้าจอ · ไม่ใช่ผลการประเมินจริง</div><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/creative-kpi-report.js"></script><script src="/screens-creative-kpi.js"></script><script>${boot}</script></body></html>`;
module.exports={rows,boot,react,reactDom,html};
if(require.main===module)http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 if(url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(!assets[url]){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',url.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(assets[url]));
}).listen(Number(process.argv[2])||4197,'127.0.0.1',()=>console.log('Synthetic KPI preview ready'));
