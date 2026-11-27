// usage: node cap.mjs <html abs path> <out dir abs> <count> [start]
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const [html, outDir, countStr, startStr] = process.argv.slice(2);
const count = +countStr, start = +(startStr || 0);
fs.mkdirSync(outDir, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + html.replace(/\\/g, '/').replace(/ /g, '%20');
let ok = 0;
for (let i = start; i < start + count; i++) {
  const out = path.join(outDir, String(i).padStart(2, '0') + '.png');
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=2', '--window-size=440,900', '--virtual-time-budget=8000',
    `--screenshot=${out}`, `${url}?i=${i}`], { timeout: 60000 });
  if (fs.existsSync(out)) ok++; else console.log('fail', i, r.status, String(r.stderr).slice(-200));
}
console.log('ok', ok);
