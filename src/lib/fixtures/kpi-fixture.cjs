/* Synthetic transport shared by isolated tests and the clearly labelled UI harness. */
(function(root){
  function createClient(tables,options={}) {
    const calls=[];
    class Query {
      constructor(name){this.name=name;this.filters=[];this.orders=[];this.start=0;this.end=199;calls.push(this);}
      select(){return this;} eq(k,v){this.filters.push(r=>r[k]===v);return this;}
      in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
      gte(k,v){this.filters.push(r=>Date.parse(r[k])>=Date.parse(v));return this;}
      lt(k,v){this.upperMonth=v;this.filters.push(r=>Date.parse(r[k])<Date.parse(v));return this;}
      lte(k,v){this.filters.push(r=>Date.parse(r[k])<=Date.parse(v));return this;}
      is(k,v){this.filters.push(r=>r[k]===v);return this;}
      not(k,op,v){const values=v.slice(1,-1).split(',');this.filters.push(r=>!values.includes(r[k]));return this;}
      contains(k,v){this.filters.push(r=>Object.entries(v).every(([key,value])=>r[k]?.[key]===value));return this;}
      order(k,o){this.orders.push([k,o.ascending]);return this;}
      range(a,b){this.start=a;this.end=b;return this;} abortSignal(s){this.signal=s;return this;}
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(options.hangQuery)return new Promise(()=>{});
        if(options.fail?.(this))return {data:null,count:null,error:{message:'Fixture error'}};
        let rows=(tables[this.name]||[]).filter(r=>this.filters.every(f=>f(r)));
        rows.sort((a,b)=>{for(const [key,asc] of this.orders){if(a[key]!==b[key])return (a[key]<b[key]?-1:1)*(asc?1:-1);}return 0;});
        const response={data:rows.slice(this.start,this.end+1),count:rows.length,error:null};
        return options.response?options.response(response,this):response;
      }).then(resolve,reject);}
    }
    return {calls,from:name=>new Query(name),rpc:(name,args)=>{
      calls.push({rpc:name,args});
      if(options.hangRpc)return new Promise(()=>{});
      if(name==='flowmate_kpi_can_view')return Promise.resolve({data:options.gate??true,error:options.gateError?{message:'gate error'}:null});
      if(name==='flowmate_kpi_evidence_context'&&options.capture)return Promise.resolve({data:{can_deadline:true,can_ready:true,can_sla:true,can_csat:true,fingerprint:'synthetic-current-brief'},error:null});
      if(name==='flowmate_kpi_record_evidence'&&options.capture){
        const rows=tables.flowmate_kpi_measurement_evidence||=([]),prior=rows.find(r=>r.request_key===args.p_request_key);if(prior)return Promise.resolve({data:prior,error:null});
        const row={id:10000+rows.length,actor_user_id:'synthetic-receiver',recorded_at:new Date().toISOString(),calendar_version:'organization-2026-v1',survey_definition:'internal-csat-1to5-v1',work_domain:args.p_work_item_id.startsWith('task-')?'quick_task':'creative_request'};
        for(const [k,v] of Object.entries(args))row[k.replace(/^p_/,'')]=v;rows.push(row);return Promise.resolve({data:row,error:null});
      }
      return Promise.resolve({data:options.tests?.includes(args.p_work_item)??false,error:options.classifierError?{message:'registry error'}:null});
    }};
  }
  function makeTables(){
    const tables={flowmate_creative_kpi_report_v:[],work_items:[],work_item_events:[],creative_kpi_milestones:[],creative_kpi_brief_evidence:[],creative_request_details:[]};
    const time=day=>`2026-09-${String(day).padStart(2,'0')}T05:00:00Z`;
    for(let i=1;i<=18;i++){
      const id=`creative-${i}`,day=i+2;
      tables.creative_request_details.push({work_item_id:id,brief_link:i%4?'https://example.com/brief/'+i:''});
      tables.flowmate_creative_kpi_report_v.push({work_item_id:id,display_id:`CR-DEMO-${i}`,title:i===1?'ตัวอย่างทดสอบเท่านั้น · ชื่อชิ้นงานยาวเพื่อทดสอบการตัดบรรทัดและการอ่านรายละเอียดด้วยคีย์บอร์ด 🎨'.repeat(3):`ตัวอย่างชิ้นงาน ${i}`,status:'delivered',created_at:time(1),requester_team:i%2?'Marketing':'eSports',archived_at:i===2?time(28):null});
      tables.work_item_events.push({id:i,work_item_id:id,created_at:time(day),from_status:'review',to_status:'delivered',metadata:{}});
      tables.creative_kpi_milestones.push({work_item_id:id,milestone:'delivered',occurred_at:time(day),owner_member_id:i===3?null:i%2?'designer-a':'designer-b',owner_name:i===3?null:i%2?'Designer A':'Designer B'});
      tables.creative_kpi_brief_evidence.push({id:i*2,work_item_id:id,action:'submitted',occurred_at:time(1),brief_link:'https://example.com/brief'});
      if(i%3)tables.creative_kpi_brief_evidence.push({id:i*2+1,work_item_id:id,action:'accepted',submission_id:i*2,actor_user_id:'receiver-demo',occurred_at:time(2),reason:'ตรวจบรีฟครบ',brief_link:'https://example.com/brief'});
    }
    tables.work_items.push(...tables.flowmate_creative_kpi_report_v.map(w=>({...w,id:w.work_item_id,work_type:'creative_request'})));
    for(let i=1;i<=17;i++){
      const id=`task-${i}`;
      tables.work_item_events.push({id:400+i,work_item_id:id,event_type:'created',created_at:time(1),metadata:{source:'task_assign_workspace',request_state:'accepted'}});
      tables.work_items.push({id,display_id:`QT-DEMO-${i}`,title:`ตัวอย่าง Task ข้ามทีม ${i}`,work_type:'quick_task',status:i<=14?'delivered':'in_progress',created_at:time(1),archived_at:null,requester_team:i%2?'Marketing':'Operations'});
      tables.work_item_events.push({id:100+i,work_item_id:id,created_at:time(4),from_status:'in_progress',to_status:'review',metadata:{source:'task_assign_workspace',action:'submit'}});
      if(i<=14)tables.work_item_events.push({id:200+i,work_item_id:id,created_at:time(8),from_status:'review',to_status:'delivered',metadata:{source:'task_assign_workspace',action:i===14?'legacy':'approve'}});
      if(i%4===0)tables.work_item_events.push({id:300+i,work_item_id:id,created_at:time(5),from_status:'review',to_status:'in_progress',metadata:{source:'task_assign_workspace',action:'request_changes'}});
    }
    return tables;
  }
  function makeEvidenceTables(){const t=makeTables();t.flowmate_kpi_measurement_evidence=[];
    for(const w of t.work_items){const task=w.work_type==='quick_task';const record=(kind,extra)=>t.flowmate_kpi_measurement_evidence.push({id:t.flowmate_kpi_measurement_evidence.length+1,work_item_id:w.id,work_domain:w.work_type,kind,actor_user_id:'synthetic-receiver',recorded_at:'2026-09-01T00:00:00+07:00',...extra});
      record('intake',{priority_at_intake:w.id.endsWith('1')?'urgent':'normal',plan_at_intake:w.id.endsWith('2')?'unplanned':'planned'});
      record('deadline',{endpoint:task?'task_submit':'creative_draft',due_date:'2026-09-04'});record('deadline',{endpoint:task?'task_approve':'creative_delivery',due_date:'2026-09-09'});
      if(task){record('ready',{brief_fingerprint:'synthetic-current-brief'});t.work_item_events.push({id:9000+t.work_item_events.length,work_item_id:w.id,created_at:'2026-09-02T00:00:00+07:00',to_status:'in_progress',metadata:{source:'task_assign_workspace',action:'start'}});if(w.status==='delivered')record('csat',{recorded_at:'2026-09-10T00:00:00+07:00',score:4,survey_definition:'internal-csat-1to5-v1',survey_period:'2026-Q3'});}
      else record('sla',{required_on:'2026-09-09',sla_workdays:3,calendar_version:'organization-2026-v1'});
    }return t;
  }
  const api={createClient,makeTables,makeEvidenceTables};if(typeof module!=='undefined')module.exports=api;else root.KpiFixture=api;
})(globalThis);
