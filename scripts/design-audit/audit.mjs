// usage: node audit.mjs <html abs path> <out json abs> <count>
// Measures each PANEL screen headless: small text, text contrast, touch targets,
// filled primary buttons per screen, distinct border-radius values.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const [html, outJson, countStr, sizeArg] = process.argv.slice(2);
const WIN = (sizeArg || '440x900').replace('x', ',');
const count = +countStr;
const src = fs.readFileSync(html, 'utf8');
const inject = `<script>addEventListener("load",()=>{setTimeout(()=>{
const scr=document.querySelector('.screen');const SR=scr.getBoundingClientRect();
const modal=scr.querySelector('.modal.open');const views=[...scr.querySelectorAll('#viewport > .view')].filter(v=>!v.classList.contains('under'));
const roots=[modal||views[views.length-1]||scr.querySelector('#viewport')];
const sh=scr.querySelector('.sheet-layer.open .sheet');if(sh)roots.push(sh);
const dl=scr.querySelector('.dialog-layer.open');if(dl)roots.push(dl);
const tb=scr.querySelector('#tabbar');if(tb&&getComputedStyle(tb).display!=='none'&&!modal)roots.push(tb);
const vis=el=>{for(let e=el;e&&e!==scr;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden'||+c.opacity<0.05)return false}return true};
const rgb=s=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
const blend=(top,bot)=>({r:top.r*top.a+bot.r*(1-top.a),g:top.g*top.a+bot.g*(1-top.a),b:top.b*top.a+bot.b*(1-top.a),a:1});
const bgOf=el=>{const stack=[];for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=1)break}}
let col={r:255,g:255,b:255,a:1};for(let k=stack.length-1;k>=0;k--)col=blend(stack[k],col);return col};
const cr=(a,b)=>{const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)};
const hex=c=>'#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const small=[],lowc=[],tiny=[],radii=new Set();let filled=0;const filledList=[];
for(const root of roots){if(!root)continue;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;const seen=new Set();
 while(n=w.nextNode()){const t=n.textContent.trim();if(!t)continue;const el=n.parentElement;if(seen.has(el)||!vis(el))continue;seen.add(el);
  const cs=getComputedStyle(el);const fs=parseFloat(cs.fontSize);const fw=parseInt(cs.fontWeight)||400;
  const r=el.getBoundingClientRect();if(r.width<1||r.right<SR.left||r.left>SR.right)continue;
  if(fs<13)small.push(t.slice(0,24)+' ('+fs+'px)');
  const fg=rgb(cs.color);if(fg){const bg=bgOf(el);const c=cr(blend(fg,bg),bg);const large=fs>=24||(fs>=18.66&&fw>=700);
   if(c<(large?3:4.5))lowc.push(t.slice(0,24)+' '+c.toFixed(2)+' '+hex(blend(fg,bg))+'/'+hex(bg))}}
 for(const el of root.querySelectorAll('button,a,[data-act],[role=button],input,select,label')){if(!vis(el))continue;const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1||r.right<SR.left||r.left>SR.right)continue;
  if(r.height<44||r.width<44){const lab=(el.innerText||el.getAttribute('aria-label')||el.tagName).replace(/\\s+/g,' ').trim().slice(0,20);tiny.push(lab+' '+Math.round(r.width)+'x'+Math.round(r.height))}
  const cs=getComputedStyle(el);const b=rgb(cs.backgroundColor);
  if(b&&b.a>0.9&&r.width>SR.width*0.4&&r.height>=40){const L=lum(b);if(L<0.2){filled++;filledList.push((el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,16))}}}
 for(const el of root.querySelectorAll('*')){if(!vis(el))continue;const v=getComputedStyle(el).borderTopLeftRadius;if(v&&v!=='0px'&&!v.includes('%'))radii.add(v)}}
const o={small,lowc,tiny,filled,filledList,radii:[...radii].sort((a,b)=>parseFloat(a)-parseFloat(b))};
const p=document.createElement('pre');p.id='__audit';p.textContent=JSON.stringify(o);document.body.appendChild(p);
},1600)});</script>`;
const tmp = path.join(path.dirname(html), '__audit_' + path.basename(html));
fs.writeFileSync(tmp, src.replace(/<\/body>\s*<\/html>\s*$/i, inject + '</body></html>'));
const url = 'file:///' + tmp.replace(/\\/g, '/').replace(/ /g, '%20');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const res = [];
for (let i = 0; i < count; i++) {
  const r = spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    `--window-size=${WIN}`, '--virtual-time-budget=9000', '--dump-dom', `${url}?i=${i}`], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  const m = String(r.stdout).match(/<pre id="__audit">([\s\S]*?)<\/pre>/);
  res.push({ i, ...(m ? JSON.parse(dec(m[1])) : { error: 'audit failed' }) });
}
fs.unlinkSync(tmp);
fs.writeFileSync(outJson, JSON.stringify(res, null, 1));
const sum = k => res.reduce((a, x) => a + (x[k] ? x[k].length : 0), 0);
const allR = new Set(res.flatMap(x => x.radii || []));
console.log(`screens ${res.length} | small text ${sum('small')} | low contrast ${sum('lowc')} | small targets ${sum('tiny')} | screens with >1 filled CTA ${res.filter(x => x.filled > 1).length} | radius values ${[...allR].join(' ')}`);
