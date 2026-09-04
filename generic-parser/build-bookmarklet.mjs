/* 從 index.html 的四段哨兵切出工具本體, 壓縮後組成 javascript: URL,
   寫回同一份檔案的安裝連結。
       npm i && node build-bookmarklet.mjs
   舊版 gpTool.toString() 那套沒有壓縮, 產出 73,655 字元 = Firefox 上限的 112%,
   書籤根本存不進去 —— 這支就是補上那一步。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { minify } from 'terser';
import CleanCSS from 'clean-css';

const FILE = new URL('./index.html', import.meta.url);
/* Firefox Places 的 MAX_URL_LENGTH。超過就存不進書籤列, 而且是靜默失敗。 */
const HARD = 65536, WARN = 55000;

const src = readFileSync(FILE, 'utf8');

const slice = (name, open, close) => {
  const a = src.indexOf(open), b = src.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`找不到 ${name} 的哨兵註解`);
  return src.slice(a + open.length, b).trim();
};
const tokens = slice('tokens',      '/*[tokens]*/',      '/*[/tokens]*/');
const toolCss = slice('tool-css',   '/*[tool-css]*/',    '/*[/tool-css]*/');
const markup = slice('tool-markup', '<!--[tool-markup]-->', '<!--[/tool-markup]-->');
const toolJs = slice('tool-js',     '/*[tool-js]*/',     '/*[/tool-js]*/');

/* 色票只手寫 :root 一份(沙盒自己也要用)。自訂屬性會穿過 shadow 邊界繼承,
   不在 :host 蓋一份就會吃到宿主頁的同名變數 —— --bg / --line / --panel
   這些名字 Tailwind、shadcn、Bootstrap 5.3 都在用。 */
const hostTokens = tokens.replace(/^\s*:root\b/, ':host');
if (hostTokens === tokens) throw new Error('[tokens] 區塊不是以 :root 開頭, 無法轉成 :host');

const css = new CleanCSS({ level: 2 }).minify(hostTokens + '\n' + toolCss);
if (css.errors.length) throw new Error('CSS 壓縮失敗: ' + css.errors.join('; '));

/* markup 沒有 <pre> 之類的空白敏感節點, 標籤之間的空白直接收掉 */
const html = markup.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();

/* 整包一起壓, 名稱才會一致 —— 分開壓 GPTool 會被 mangle 成呼叫端找不到的名字。
   window.__gp 是屬性存取, 不受 mangle 影響, 兩次點擊靠它接上。 */
const wrapper = `(function(){
if (window.__gp) { window.__gp.unmount(); return; }
${toolJs}
window.__gp = GPTool(${JSON.stringify(css.styles)}, ${JSON.stringify(html)},
                     { onEnd: function(){ window.__gp = null; } });
})();`;

const out = await minify(wrapper, {
  compress: { passes: 2 },
  mangle: { toplevel: true },
  format: { comments: false }
});
if (out.error) throw out.error;

/* red-outline 與舊版都用整包 encodeURIComponent, 沿用 —— 少一種可能出錯的邊界。
   省下的那幾 k 換不到什麼, 現在的餘裕夠。 */
const url = 'javascript:' + encodeURIComponent(out.code);

const pct = n => (n / HARD * 100).toFixed(0) + '%';
const row = (k, a, b) => console.log(`  ${k.padEnd(12)} ${String(a).padStart(7)} → ${String(b).padStart(7)}`);
console.log('切出來的四段:');
row('tokens', tokens.length, hostTokens.length);
row('tool-css', toolCss.length, css.styles.length);
row('tool-markup', markup.length, html.length);
row('tool-js', toolJs.length, out.code.length);
console.log(`\n  bookmarklet  ${url.length} / ${HARD} 字元  (${pct(url.length)})`);

if (url.length > HARD) {
  console.error(`\n✗ 超過 Firefox 的 ${HARD} 字元上限, 書籤會靜默存不進去。`);
  process.exit(1);
}
if (url.length > WARN) console.warn(`\n⚠ 已超過 ${WARN} 字元, 餘裕不多了。`);

/* 寫回安裝連結。href 用單引號包, 所以只需要處理 & < > 與單引號本身;
   encodeURIComponent 產出的字串裏本來就不會有引號, 但還是擋著。 */
const attr = url.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/'/g, '&#39;');
const re = /(<a class="bm" id="bm" href=)(?:"[^"]*"|'[^']*')/;
if (!re.test(src)) throw new Error('找不到安裝連結 <a class="bm" id="bm" href=...>');
writeFileSync(FILE, src.replace(re, `$1'${attr}'`), 'utf8');
console.log('\n✓ 已寫回 generic-parser/index.html 的安裝連結');
