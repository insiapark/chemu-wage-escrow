// usage: node shot.mjs <WxH> <scale> <out png abs> <file or url> [<out2> <url2> ...]
import { spawnSync } from 'child_process';
const [size, scale, ...pairs] = process.argv.slice(2);
for (let k = 0; k < pairs.length; k += 2) {
  const out = pairs[k]; let url = pairs[k + 1];
  if (!/^(file|https?):/.test(url)) url = 'file:///' + url.replace(/\\/g, '/').replace(/ /g, '%20');
  spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--allow-file-access-from-files', `--force-device-scale-factor=${scale}`, `--window-size=${size.replace('x', ',')}`,
    '--virtual-time-budget=8000', `--screenshot=${out}`, url], { timeout: 60000 });
  console.log('shot', out);
}
