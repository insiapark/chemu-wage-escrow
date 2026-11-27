// usage: node textdump.mjs <html abs path> <out json abs> <count>
// Renders each PANEL item (?i=N) headless and dumps the visible screen text.
// Buttons are prefixed with "[버튼] ", headings (h1,h2,.title-like) with "[제목] ".
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const [html, outJson, countStr] = process.argv.slice(2);
const count = +countStr;
const src = fs.readFileSync(html, 'utf8');
const inject = `<script>addEventListener("load",()=>{setTimeout(()=>{
const scr=document.querySelector('.screen');
const eff=el=>{for(let e=el;e&&e!==scr;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden'||+c.opacity<0.05)return 0}return 1};
const modal=scr.querySelector('.modal.open');const views=[...scr.querySelectorAll('#viewport > .view')].filter(v=>!v.classList.contains('under'));
const roots=[];roots.push(['',modal||views[views.length-1]||scr.querySelector('#viewport')]);
const sh=scr.querySelector('.sheet-layer.open .sheet');if(sh)roots.push(['[시트] ',sh]);
const dl=scr.querySelector('.dialog-layer.open');if(dl)roots.push(['[대화창] ',dl]);
const out=[];
for(const [pre,root] of roots){if(!root)continue;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n,last=null;
while(n=w.nextNode()){const t=n.textContent.replace(/\\s+/g,' ').trim();if(!t)continue;const el=n.parentElement;if(!eff(el))continue;
const btn=el.closest('button,.btn,[role=button]');const h=el.closest('h1,h2');const tag=pre+(btn?'[버튼] ':(h?'[제목] ':''));const key=btn||el;
if(last&&last.key===key){last.t+=' '+t;continue}last={key,t:tag+t};out.push(last)}}
const p=document.createElement('pre');p.id='__dump';p.textContent=out.map(o=>o.t).join('\\n');document.body.appendChild(p);
const lab=document.createElement('pre');lab.id='__label';try{lab.textContent=PANEL_ITEMS[+(new URLSearchParams(location.search).get('i'))].l}catch(e){}document.body.appendChild(lab);
},1600)});</script>`;
const tmp = path.join(path.dirname(html), '__dump_' + path.basename(html));
fs.writeFileSync(tmp, src.replace(/<\/body>\s*<\/html>\s*$/i, inject + '</body></html>'));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + tmp.replace(/\\/g, '/').replace(/ /g, '%20');
const res = [];
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
for (let i = 0; i < count; i++) {
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=440,900',
    '--virtual-time-budget=9000', '--dump-dom', `${url}?i=${i}`], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  const dom = String(r.stdout);
  const m = dom.match(/<pre id="__dump">([\s\S]*?)<\/pre>/);
  const l = dom.match(/<pre id="__label">([\s\S]*?)<\/pre>/);
  res.push({ i, label: l ? dec(l[1]) : '', text: m ? dec(m[1]) : '(dump failed)' });
}
fs.unlinkSync(tmp);
fs.writeFileSync(outJson, JSON.stringify(res, null, 1));
console.log('dumped', res.length, 'failed', res.filter(x => x.text === '(dump failed)').length);
