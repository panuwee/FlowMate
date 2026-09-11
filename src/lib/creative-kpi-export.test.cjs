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
