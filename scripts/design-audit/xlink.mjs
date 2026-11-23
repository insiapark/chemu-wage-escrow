// usage: node xlink.mjs <worker html> <owner html> <worker panel json> <owner panel json> <out report md>
// Injects "상대 앱에서 보기" links into both files' side panel, mapped from each note's peer-screen names.
import fs from 'fs';
import path from 'path';
const [wHtml, oHtml, wJson, oJson, report] = process.argv.slice(2);
const W = JSON.parse(fs.readFileSync(wJson, 'utf8'));
const O = JSON.parse(fs.readFileSync(oJson, 'utf8'));
const norm = s => s.replace(/\(.*?\)|[\s:·,'"“”]/g, '').replace(/화면$/, '');
function peerNames(note, key) {
  const m = note.match(new RegExp(key + '\\s*:?\\s*([^/]*)'));
  if (!m) return [];
  return m[1].split(/,|·| 또는 | 그리고 |와 |과 /).map(s => s.trim()).filter(s => s && !/^없음/.test(s));
}
const ALIAS = { '주휴수당풀이': '주휴수당 계산', '보관된돈설명': '채워 둔 돈과 보관된 돈', '어제확정을안한퇴근': '어제 확정 안 한 근무', '퇴근확정': '근무 확정', '보관못한일당': '아직 보관 못 한 돈', '채워둔돈이모자라보관못한날': '아직 보관 못 한 돈' };
function match(name, list) {
  let n = norm(name);
  if (!n) return null;
  if (ALIAS[n]) { const a = list.find(x => x.l === ALIAS[n]); if (a) return a; }
  let best = list.find(x => norm(x.l) === n)
    || list.find(x => norm(x.l).startsWith(n) || n.startsWith(norm(x.l)))
    || list.find(x => norm(x.l).includes(n) || n.includes(norm(x.l)));
  if (!best) {
    // token overlap fallback
    const toks = name.split(/[\s:,]+/).filter(t => t.length >= 2);
    let score = 0;
    for (const x of list) { const s = toks.filter(t => x.l.includes(t)).length; if (s > score) { score = s; best = x; } }
    if (score < 2) best = null;
  }
  return best;
}
function build(list, other, key) {
  const map = {}; const miss = [];
  for (const it of list) {
    const names = peerNames(it.note, key);
    const hits = [];
    for (const nm of names) { const b = match(nm, other); if (b && !hits.find(h => h[1] === b.i)) hits.push([b.l, b.i]); else if (!b) miss.push(`${it.i} ${it.l} → "${nm}"`); }
    if (hits.length) map[it.i] = hits;
  }
  return { map, miss };
}
const wRes = build(W, O, '(?:사장님 앱|상대 앱)');
const oRes = build(O, W, '(?:알바생 앱|상대 앱)');
function inject(file, map, otherFile, otherName) {
  let s = fs.readFileSync(file, 'utf8').replace(/<script id="xlink">[\s\S]*?<\/script>/, '');
  const js = `<script id="xlink">(function(){const PEER=${JSON.stringify(map)};const OTHER=${JSON.stringify(otherFile)};const NAME=${JSON.stringify(otherName)};
function esc(t){return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
let CUR=-1,OBS=null;
function render(k){CUR=k;const panel=document.getElementById('panel');if(!panel)return;
if(!OBS){OBS=new MutationObserver(()=>{const h=panel.querySelector('#pnote,.pnote')||panel.querySelector('[class*="note"]');if(CUR>=0&&h&&!h.querySelector('#peerBox'))render(CUR)});OBS.observe(panel,{childList:true,subtree:true});}
const host=panel.querySelector('#pnote,.pnote')||panel.querySelector('[class*="note"]')||panel;let box=document.getElementById('peerBox');
if(!box||box.parentElement!==host){if(box)box.remove();box=document.createElement('div');box.id='peerBox';box.style.cssText='margin:10px 0 0;padding:10px 0 0;border-top:1px solid #e3e0da;font-size:13px;line-height:1.5;color:#19181d';host.appendChild(box);}
const list=PEER[k]||[];box.style.display=list.length?'block':'none';
box.innerHTML=list.length?'<div style="font-weight:700;margin-bottom:6px">'+NAME+'에서 이어지는 화면</div>'+list.map(([l,i])=>'<a href="'+OTHER+'?i='+i+'" target="_blank" rel="noopener" style="display:block;color:#4a3cc4;text-decoration:none;padding:4px 0">'+esc(l)+' 열기</a>').join(''):'';}
addEventListener('load',()=>{if(typeof PANEL_ITEMS==='undefined')return;PANEL_ITEMS.forEach((it,k)=>{const r=it.run;it.run=function(){const v=r.apply(this,arguments);setTimeout(()=>{try{render(k)}catch(e){}},60);return v}});});})();</script>`;
  s = s.replace(/(<script>addEventListener\("load",\(\)=>\{setTimeout)/, js + '\n$1');
  if (!s.includes('id="xlink"')) s = s.replace(/<\/body>\s*<\/html>\s*$/i, js + '</body></html>');
  fs.writeFileSync(file, s);
}
inject(wHtml, wRes.map, path.basename(oHtml), '사장님 앱');
inject(oHtml, oRes.map, path.basename(wHtml), '알바생 앱');
const lines = ['# 두 앱 화면 연결 결과', '', `알바생 앱 → 사장님 앱: ${Object.keys(wRes.map).length}개 화면에 연결`, `사장님 앱 → 알바생 앱: ${Object.keys(oRes.map).length}개 화면에 연결`, '',
  '## 이름이 맞지 않아 연결하지 못한 것', '', ...wRes.miss.map(x => '- 알바생 ' + x), ...oRes.miss.map(x => '- 사장님 ' + x)];
fs.writeFileSync(report, lines.join('\n'));
console.log(lines.slice(2, 4).join('\n'), '| miss', wRes.miss.length + oRes.miss.length);
