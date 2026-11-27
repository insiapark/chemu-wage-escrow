// usage: node isoaudit.mjs <html abs path> <out md abs> <count> [WxH]
// Lists which isometric images (assets/iso/iso_*.png) each PANEL screen shows, rendered width, alt text,
// and whether the image sits inside a sheet, dialog, list row or dark card. Then checks the v15 rules.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const [html, outMd, countStr, sizeArg] = process.argv.slice(2);
const count = +countStr; const WIN = (sizeArg || '480x1200').replace('x', ',');
const src = fs.readFileSync(html, 'utf8');
const inject = `<script>addEventListener("load",()=>{setTimeout(()=>{
const scr=document.querySelector('.screen');
const vis=el=>{for(let e=el;e&&e!==scr;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden'||+c.opacity<0.05)return false}return true};
const modal=scr.querySelector('.modal.open');const views=[...scr.querySelectorAll('#viewport > .view')].filter(v=>!v.classList.contains('under'));
const roots=[modal||views[views.length-1]||scr.querySelector('#viewport')];const sh=scr.querySelector('.sheet-layer.open .sheet');if(sh)roots.push(sh);const dl=scr.querySelector('.dialog-layer.open');if(dl)roots.push(dl);
const out=[];for(const root of roots){if(!root)continue;for(const im of root.querySelectorAll('img')){const s=im.getAttribute('src')||'';const m=s.match(/(iso_\\d\\d_[a-z_]+)\\.png/);if(!m||!vis(im))continue;const r=im.getBoundingClientRect();
const where=im.closest('.sheet,.dialog-layer,.dialog')?'시트/대화창':(im.closest('li,.row,[class*=row],[class*=list]')?'목록':(im.closest('[class*=dark],[class*=ink]')?'먹색 카드':'바탕'));
out.push({name:m[1],w:Math.round(r.width),alt:im.hasAttribute('alt')?(im.getAttribute('alt')||'(장식, 빈 alt)'):null,hidden:im.getAttribute('aria-hidden')==='true'||!!im.closest('[aria-hidden=true]'),where})}}
let label='';try{label=PANEL_ITEMS[+(new URLSearchParams(location.search).get('i'))].l}catch(e){}
const p=document.createElement('pre');p.id='__iso';p.textContent=JSON.stringify({label,imgs:out});document.body.appendChild(p);},1600)});</script>`;
const tmp = path.join(path.dirname(html), '__iso_' + path.basename(html));
fs.writeFileSync(tmp, src.replace(/<\/body>\s*<\/html>\s*$/i, inject + '</body></html>'));
const url = 'file:///' + tmp.replace(/\\/g, '/').replace(/ /g, '%20');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const rows = [];
for (let i = 0; i < count; i++) {
  const r = spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    `--window-size=${WIN}`, '--virtual-time-budget=9000', '--dump-dom', `${url}?i=${i}`], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  const m = String(r.stdout).match(/<pre id="__iso">([\s\S]*?)<\/pre>/);
  rows.push({ i, ...(m ? JSON.parse(dec(m[1])) : { label: '?', imgs: [] }) });
}
fs.unlinkSync(tmp);
const all = Array.from({ length: 16 }, (_, k) => 'iso_' + String(k).padStart(2, '0'));
const used = new Map(); const issues = [];
rows.forEach((r, k) => {
  if (r.imgs.length > 1) issues.push(`${r.i} ${r.label}: 그림 ${r.imgs.length}장 (한 화면 하나)`);
  for (const im of r.imgs) {
    const key = im.name.slice(0, 6); used.set(key, (used.get(key) || []).concat(r.i));
    if (im.alt === null) issues.push(`${r.i} ${r.label}: ${im.name} alt 속성 없음 (장식이면 alt="")`);
    if (im.where !== '바탕') issues.push(`${r.i} ${r.label}: ${im.name}이(가) ${im.where} 안에 있음`);
    if (im.w > 48 && (im.w < 200 || im.w > 260)) issues.push(`${r.i} ${r.label}: ${im.name} ${im.w}px (히어로는 200~260px, 아이콘은 48px 이하)`);
  }
  const prev = rows[k - 1];
  if (prev && r.imgs.length && prev.imgs.length && r.imgs[0].name === prev.imgs[0].name) issues.push(`${prev.i}과 ${r.i}: 이어지는 두 화면에 같은 그림 ${r.imgs[0].name}`);
});
const unused = all.filter(a => !used.has(a));
const md = ['# 아이소메트릭 그림 사용표', '', '| 번호 | 화면 | 그림 | 폭 | 자리 | alt |', '|---|---|---|---|---|---|',
  ...rows.filter(r => r.imgs.length).map(r => r.imgs.map(im => `| ${r.i} | ${r.label} | ${im.name} | ${im.w}px | ${im.where} | ${im.alt === null ? '(속성 없음)' : im.alt} |`).join('\n')),
  '', '## 그림별 쓰인 화면 수', '', ...all.map(a => `- ${a}: ${(used.get(a) || []).length}곳 ${(used.get(a) || []).join(', ')}`),
  '', '## 규칙 위반', '', ...(issues.length ? issues.map(s => '- ' + s) : ['- 없음']), '', '## 한 번도 쓰이지 않은 그림', '', unused.length ? unused.join(', ') : '없음'];
fs.writeFileSync(outMd, md.join('\n'));
console.log(`screens ${rows.length} | screens with iso ${rows.filter(r => r.imgs.length).length} | issues ${issues.length} | unused ${unused.join(' ') || 'none'}`);
