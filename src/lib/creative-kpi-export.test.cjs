const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function exporter(){
 const context={React:{createElement:()=>({}),Fragment:'fragment'},window:{},TextEncoder,Uint8Array,Blob};
 vm.createContext(context);vm.runInContext(fs.readFileSync('data.js','utf8'),context);
 return context;
}
test('report numeric cells and blank evidence inputs remain typed without formula injection',()=>{
 const xml=exporter().flowmateXlsxWorksheetXml({name:'Annual summary',reportStyle:true,rows:[['Count','Rate','Notes'],[12,12.3456,'=1+1'],[null,'','A & B']]});
 assert.match(xml,/<c r="A2" s="4"><v>12<\/v>/);
 assert.match(xml,/<c r="B2" s="2"><v>12.3456<\/v>/);
 assert.match(xml,/<c r="A3" s="3"\/>/);
 assert.match(xml,/t="inlineStr"><is><t xml:space="preserve">=1\+1/);
 assert.match(xml,/A &amp; B/);assert.doesNotMatch(xml,/<f>/);
 assert.match(xml,/state="frozen"/);assert.match(xml,/<autoFilter ref="A1:C3"/);
});
test('legacy workbooks preserve inline text cells without report styling',()=>{
 const xml=exporter().flowmateXlsxWorksheetXml({name:'Legacy',rows:[['Count'],[12]]});
 assert.match(xml,/<c r="A2" t="inlineStr"><is><t xml:space="preserve">12/);
 assert.doesNotMatch(xml,/autoFilter|customHeight|frozen/);
});
test('long context text has room to wrap in the workbook',()=>{
 const xml=exporter().flowmateXlsxWorksheetXml({name:'Quality & context',reportStyle:true,rows:[['Flags'],['Needs confirmation. '.repeat(16)]]});
 const height=Number(xml.match(/<row r="2" ht="(\d+)"/)[1]);
 assert.ok(height>100);
});

test('skill workbook serializes requested quantities as numbers and unverified output as text',()=>{
 const kpi=require('../../creative-kpi-report.js');
 const report=kpi.buildReport([{work_item_id:'a',title:'=HYPERLINK("unsafe")',owner_member_id_at_start:'p',owner_name_at_start:'Creative',owner_member_code:'ploy',asset_type:'static-graphic',asset_subtype:'kv-design',asset_count:'2',asset_type_2:'static-graphic',asset_subtype_2:'resize',asset_count_2:null,status:'delivered',created_at:'2026-08-01T00:00:00Z',delivered_at:'2026-08-02T00:00:00Z'}],{year:2026,asOf:'2026-11-11T00:00:00Z'});
 const context=exporter();
 for(const sheet of kpi.buildWorkbook(report)){
  const xml=context.flowmateXlsxWorksheetXml(sheet);
  assert.doesNotMatch(xml,/<f>/);
  assert.match(xml,/<\/worksheet>$/);
  if(sheet.name==='CR Type Skill detail'){
   assert.match(xml,/<c r="M2" s="4"><v>2<\/v>/);
   assert.match(xml,/<c r="M3" s="3"\/>/);
   assert.match(xml,/Not verified \/ not collected/);
   assert.match(xml,/t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
  }
 }
});
