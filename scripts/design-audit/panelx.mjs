// usage: node panelx.mjs <html abs path> <out json abs>
// Loads the page headless and dumps PANEL groups, labels and notes as JSON.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const [html, outJson] = process.argv.slice(2);
const src = fs.readFileSync(html, 'utf8');
const inject = `<script>addEventListener("load",()=>{setTimeout(()=>{
const out=[];let i=0;
for(const [g,items] of PANEL){for(const it of items){let n=it.note;
if(n&&typeof n==='object'){n=['질문: '+(n.q||''),'들어옴: '+(n.i||''),'나감: '+(n.o||''),'상대 앱: '+(n.w||'')].join(' / ')}
out.push({i:i++,group:g,l:it.l,note:n||''})}}
const p=document.createElement('pre');p.id='__panel';p.textContent=JSON.stringify(out);document.body.appendChild(p);
},500)});</script>`;
const tmp = path.join(path.dirname(html), '__panel_' + path.basename(html));
fs.writeFileSync(tmp, src.replace(/<\/body>\s*<\/html>\s*$/i, inject + '</body></html>'));
const url = 'file:///' + tmp.replace(/\\/g, '/').replace(/ /g, '%20');
const r = spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu',
  '--allow-file-access-from-files', '--virtual-time-budget=5000', '--dump-dom', url], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
fs.unlinkSync(tmp);
const m = String(r.stdout).match(/<pre id="__panel">([\s\S]*?)<\/pre>/);
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
if (!m) { console.log('panel dump failed'); process.exit(1); }
fs.writeFileSync(outJson, JSON.stringify(JSON.parse(dec(m[1])), null, 1));
console.log('items', JSON.parse(dec(m[1])).length);
