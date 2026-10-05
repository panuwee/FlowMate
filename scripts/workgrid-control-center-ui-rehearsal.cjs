// Materialize public release sources into a plain directory; never changes Git state.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pkg=path.join(root,'output/control-center-release-20261005');
const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'manifest.json'),'utf8'));
const dir=path.join(root,'output/control-center-ui-rehearsal-20261005');
fs.mkdirSync(dir,{recursive:true});
const archive=cp.execFileSync('git',['archive','--format=tar',manifest.baseline],{cwd:root,maxBuffer:64*1024*1024});
const archivePath=path.join(root,'output/control-center-baseline-20261005.tar');
fs.writeFileSync(archivePath,archive);
cp.execFileSync('tar',['-xf',archivePath,'-C',dir]);
for(const entry of manifest.files){const dest=path.join(dir,entry.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(pkg,entry.file),dest);}
cp.execFileSync(process.execPath,[path.join(dir,'build-github.cjs')],{cwd:dir,stdio:'inherit'});
console.log('Rehearsal directory: '+dir+'; baseline '+manifest.baseline+'; no branch/commit/push.');
