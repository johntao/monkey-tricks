# 深入擷取(Field Extraction)

設計定稿(2026-08-25 grill 後收斂)。延續 @./draft.md 的紅框/綠框/藍框模型與 pill 判斷式,只擴充「一筆記錄內部怎麼讀」,不改動記錄集怎麼找。

一維「抽取文字」的取值契約另見文末〈[1D:抽取文字的取值模式](#1d抽取文字的取值模式)〉。

## 動機

現有工具以 `txt()` 只取直屬文字節點,刻意不遞迴 —— 這讓抽取精準,但面對文字深埋巢狀結構的頁面會回傳空白。Claude 對話清單即為典型:`<tbody>` 下的 `<tr>` 本身沒有任何直屬文字。

想改標更深層的節點也不可行:`elementFromPoint` 會被覆蓋整列的連結、hover 層、`pointer-events` 設定攔截,真正含文字的那個 parentNode 點不到。

所以解法不是改進游標選取,而是**繞過它** —— 用 modal 列出紅框內部所有可擷取的內容,以核取方塊選擇。

## 定位

**這是欄位發現,不是遞迴框選。** 藍框集合(記錄集)完全不變,一筆記錄輸出一列;深入擷取只決定那一列有哪些欄。不引入巢狀作用域、不需要 breadcrumb、不產生 1:N 展開。

## 三條路線

客製化程度遞增的階梯,同一個 modal 內三個分頁:

| 路線 | 客製程度 | 內容 |
|---|---|---|
| **UI mode** | 中 | 樹狀 checkbox + 分欄尺,預設分頁 |
| **script mode** | 重 | 每個 capturing group 一條 expression |
| **copy-raw** | 零 | 直接複製所有藍框的 `outerHTML`,不做任何解析 |

排序依據:最好的 HTML 解析程式就是什麼都不解析。UI 不行退 script,script 不行退 raw。

## 共同抽象:capturing group

借用 regex 的概念,**一個 group = 一個欄位**。

- group 之間以 `\t` 分隔
- 一個 group 內若有多個來源,以空白相接
- 欄位順序 = document order,不可重排

三條路線都輸出到這個抽象上,所以輸出契約(逃逸、分隔、複製)只有一套。

## 啟用條件

按鈕 `深入` 位於工具列「抽取文字」右側,啟用條件:

```
model && !model.err && matched.indexOf(reds[0]) >= 0
```

**不做任何「有沒有東西可抓」的預判。** 曾考慮以 `txt()` 與 `textContent` 比較作為 gate,但 attribute 升格為 leaf 之後兩種 proxy 都會產生假陰性(純 `@href` 的列、直屬文字與深層資料並存的列),而假陰性的方向是靜默隱藏資料。copy-raw 對任何 HTML 都成立,而它最有價值的時刻正是解析不出東西的時刻 —— gate 恰好會在那時把按鈕關掉。

`reds[0] ∉ matched`(最末 pill 切成 `[*]` 濾掉純文字元素時會發生)則 disable,tooltip 說明「紅框不在命中結果內,請調整最末 pill」。不靜默改用 `matched[0]`:那會讓黃色高亮出現在使用者沒選過的元素上。

---

# UI mode

## 樣本列

樹只從 `reds[0]`(樣本列)長出。不做跨列聯集 —— 聯集出來的樹不對應畫面上任何一個實際元素,選擇式出錯時無從推理。樣本列缺少的欄位,由使用者改選一個內容較完整的列當第一個紅框。

所有候選都會對記錄集求值並顯示 coverage,`reds[1]` 的差異會反映在那個數字上。

## Leaf 型別

| 型別 | 取值 |
|---|---|
| text node | `textContent`(經 `blank` 判定非空白者) |
| element(無子元素) | `innerText` |
| attribute | 屬性原始值 |
| root(`reds[0]` 本身) | `innerText` |

**最小顆粒度是 text node,不可設定。** 元素只要有子元素,就以其下的 text node 為選取單位;只有不含子元素的元素才以 element 為單位。root 是唯一例外。

**Attribute 白名單:`href`、`src`、`datetime`、`title`。** 不含 `data-*` —— 現代框架會噴出大量 `data-testid` / `data-state` / `data-radix-*`,樹會被淹沒。

Attribute 升格為 leaf 之後,原本「anchor link 即使無文字也保留」的特例消失,併入下方的存活規則。

## 空白判定

`trim()` 只剝除 WhiteSpace ∪ LineTerminator,不含 Cf 類零寬字元;而 PUA 圖示字元既非空白也**看得見**,是可能的資料(星號 = 已收藏)。

原則:**看得見的留下,看不見的剪掉。**

```js
function blank(s){
  return !s.trim().replace(/[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g, '');
}
```

`U+200B` ZWSP、`U+00AD` SHY 這類「有被 render 的零寬字元」會通過 `trim()`,若不處理會在樹上長出預覽空白、值也空白的 checkbox。PUA 不剝。

## 剪枝

| | 規則 | 可設定 |
|---|---|---|
| **A** | 移除 `blank()` 為真的 text node | 否 |
| **B** | 移除沒有任何存活子 leaf(text node 或 attribute)的元素 | 否 |
| **C** | 移除有文字但不可見的元素 | **是,預設開** |

A、B 寫死。關掉 A 只會得到一堆值為空的 checkbox;關掉 B 則所有 wrapper div 全部留下,樹立刻爆炸。它們是這棵樹能不能用的前提,不是偏好。

B 同時吸收了「元素 textContent 為空白則移除」與 anchor 特例 —— 空的 `<a href>` 因為有 `@href` 這個 leaf 而存活,`<img>`、`<input value>`、`<time datetime>` 一體適用。

### C 不能用 innerText 實作

HTML 規格對 `innerText` getter 有一條 fallback:元素**未被 render** 時回傳 descendant text content(即 textContent)。所以 `<div style="display:none">SECRET</div>` 的 `innerText` 是 `"SECRET"` 而非空字串 —— C 想剪掉的頭號目標正是它偵測不到的那一個。

改用 client rects:

```js
function unseen(el){ return !el.getClientRects().length; }
// text node:Range.selectNode(t) 後量 r.getClientRects().length
```

- **抓得到**:`display:none`(含整個子樹)、零尺寸、未掛載
- **抓不到**:`visibility:hidden`、`clip-path` / `left:-9999px` 這類 sr-only

抓不到的那些**刻意留下**。sr-only 正是「人眼看不到但語意精確」的資料 —— 相對時間旁邊的絕對時間戳就是這一類。代價是 sr-only 噪音(「載入中」「在新視窗開啟」)也留在樹上,但它們有預覽值,一眼可略過。

## 坍縮

剪枝後,**任何只有一個子節點的節點,與其子節點合併,標籤以 `/` 相接,重複到收斂**。root 不參與坍縮(它有獨立語意)。

坍縮只影響**顯示**。實際選擇式一律是從記錄根算起的完整嚴格路徑,標籤 `span/span` 只是 `./td[2]/span[1]/div[1]/div[1]/span[2]/span[1]` 的縮寫。

## 序號

序號一律取**剪枝前**的真實 DOM 位置,不能用剪枝後的排名,否則選擇式套到其他列會錯位。

- element:同標籤 sibling 中的序號(沿用 `tagIdx()`)
- text node:text node sibling 中的序號 → `text()[n]`
- attribute:`@name`

## 樹的每一列

```
☑  <path label>        <值預覽>              <coverage 徽章>
     └ <選擇式>                                     ← 僅已勾選時顯示
```

- **值預覽是必需品**,不是裝飾。兩個相鄰的 `_` leaf 在標籤與縮排上完全相同,沒有預覽就只能猜。預覽原樣顯示,不對不可列印字元做註記。
- 選擇式那一行**只在勾選時出現**,否則樹會被路徑字串淹掉。
- 初始狀態全展開(剪枝加坍縮後通常只剩十幾列)。

## 選擇式策略:只做嚴格路徑

每個 leaf 產生從記錄根算起的完整嚴格相對 XPath,**不做放寬、不做候選梯、徽章不可點**。

已知短板:可有可無的元素會造成序號位移。同一個 PUA 圖示 span 若代表「已收藏」,標題在有收藏的列是 `span[2]/span[1]`、沒收藏的列是 `span[1]/span[1]`,嚴格路徑在後者回傳空字串。

放寬的需求由 script mode 承接 —— 使用者把轉移過去的 `./td[2]/span/div/div[1]/span[2]/span` 手改成 `.//div/span/span` 即可,預覽即時更新。這是刻意把複雜度推到階梯的下一階,而不是塞進樹裡。

錯誤方向的不對稱是這個取捨的依據:**嚴格路徑錯的時候會空白,空白在預覽裡看得見;寬鬆路徑錯的時候會抓到別的字,那看起來像是對的資料。**

## coverage 徽章

對每一列(含未勾選)顯示命中率。它是**選之前**的判斷依據 —— 兩個都能拿到標題的選擇式,使用者會挑 `14/14` 那個。

命中數是三態:

| 情況 | 徽章 | 該列輸出 |
|---|---|---|
| 全部列命中 1 個 | `14/14` 綠 | 值 |
| 部分列命中 0 個 | `9/14` 琥珀 | 空字串 |
| 任一列命中 > 1 個 | `14/14⚠` 橘 | 多值以空白 join |

**0 命中輸出空字串,不跳過該列** —— TSV 每行 tab 數必須固定,缺值必須佔位。

**N 命中 join 而非取第一個** —— 取第一個會靜默丟資料;join 之後那一格異常地長,預覽一眼看得出不對。與「一個 group 內多個 checkbox 以空白分隔」是同一條規則。

⚠ 不阻擋複製,只提醒。

### 取樣

coverage 只跑 `matched` 的**前 50 筆**,無使用者可調參數、無加權演算法。**擷取本身永遠跑全部。**

`matched.length > 50` 時在樹頂顯示:

```
診斷以前 50 筆取樣(共 1,203 筆);擷取仍為全部
```

徽章分母顯示 `50` 而非 `1203`,與這行說明互相印證。`≤ 50` 時這行不出現,徽章即精確值。

成本上界因此鎖死在 leaf 數 × 50。未取樣時,100 個 leaf × 1,000 筆 = 十萬次 `document.evaluate`,主執行緒會卡死數秒,而那正是這個工具最有價值的場合(捲了很久的無限捲動清單)。

已知代價:只在後段才失效的欄位診斷不到,徽章會顯示 `50/50`。那行說明即是在告知此限制。

## 選取與分欄

**modal 分成「欄位樹」與「分欄尺」兩區。**

斷點不畫在樹上,因為樹是二維而斷點只存在於一維序列:已勾選的項目在畫面上通常不相鄰(中間隔著未勾選的結構節點),線該畫在哪、點擊區怎麼定義都沒有好答案;而單擊(勾選)與雙擊在同一目標上會互相干擾。

```
├─ 分欄 ────────────────────────────────────────────────┤
│   ⟨icon⟩   ▼   /chat/7dbee47c-…   ▼   WebRTC vs W…    │
│  ─────────┴───────────────────┴──────────────────     │
│      ①                ②                  ③           │
```

- **樹**:唯一手勢是左鍵切換勾選。無右鍵、無雙擊、無 gutter 判定。
- **尺**:已勾選項目依 document order 攤平成的一維序列,仿試算表匯入精靈 —— 單擊間隙插入斷點(▼ + 水平線),雙擊斷點刪除,可拖曳移動。

### 狀態模型:切點,不是編號

group 編號**不是**每一項的自由變數。合法集合(document order 下從 1 開始、非遞減、每次最多 +1)與「把已勾選項目切成 g 段連續區間」一一對應,真正的自由變數是切點位置。

因此每個已勾選項目帶一個 boolean「此處開始新 group」,編號由前綴和推導。**任何操作序列都不可能產生非法狀態**,不需要驗證邏輯,也不會出現「使用者右鍵了中間那項該怎麼辦」的兩難。

取消勾選時該項的切點旗標一併消失,後面的 group 併回前一組並重新編號。

### 互斥規則

- 父層勾選 → 所有子孫 disable(避免值重複)
- **root 與任何子孫雙向互斥**:勾 root 則全樹 disable,勾任一子孫則 root disable。兩者必然重疊,不存在合法並存;雙向 disable 讓使用者從任一端都看得出互斥,不會以為工具壞了。

### 不做的事

**不提供「勾 root 且不逃逸 tab」的捷徑。** `<tr>` 的 `innerText` 本身就是 tab 分隔的,對表格型資料可以零設定產出 TSV —— 但同一個開關套在卡片式版面上,分隔符是 `\n`,一筆記錄會被拆成好幾列。正確性有條件而條件在 UI 上看不出來,正是要消除的那一類行為。表格型資料在樹上就是每個 `td` 一個 leaf,勾三個切兩刀,結果一樣而且每欄都看得見。

---

# script mode

## 版面

N 條單行 expression,一條對應一個 capturing group,`⊕` 新增 / `⊖` 刪除。

```
①  ./td[2]/a[1]/@href                                ⟨XPath⟩
    → /chat/7dbee47c-a40e-48dd-adf2-2605a69414f2

②  ['./td[1]/div/span/text()[1]',                    ⟨XPath⟩
     './td[2]/span/div/div[1]/span[2]/span']
    → xxx WebRTC vs WebSocket comparison

③  = el.querySelector('.star') ? '1' : ''            ⟨JS⟩
    → 1
```

不用單一大編輯器,理由三個:

1. **錯誤隔離。** 大編輯器裡打錯一個括號三欄全滅,而使用者正是在邊看預覽邊改,全滅會讓他失去對照基準。
2. **1:1 對應。** UI mode 的 g 段直接變成 g 條,轉移不需要生成任何膠水語法。
3. **group 抽象不溶解。** 自由 return 會讓欄位數變成執行期才知道,預覽與 ⚠ 無從掛載。

放棄的是共用 setup 程式碼。真的複雜到需要共用狀態,已超出 bookmarklet 該處理的範圍。

## 前綴與判別

| 開頭 | 解讀 | 是合法 XPath 起首? | 是合法 CSS 起首? |
|---|---|---|---|
| `=` | JS expression | ✗ | ✗ |
| `$` | CSS selector | ✗(變數參照,但無 resolver 必拋錯) | ✗ |
| 其餘 | XPath | — | — |

顯式前綴,不做啟發式猜測。曾考慮「以 `.`/`/`/`(`/`@` 開頭或含 `//` 判為 XPath」,但 `.title`(CSS class)與 `./foo`(XPath)撞在一起;也考慮過用單引號標記 CSS,但 `'foo'` 是合法的 XPath 字串字面值,而且使用者會習慣性在結尾再補一個引號。

`$` 沒有這些問題,而且是 querySelector 在所有前端人腦中的既定符號 —— `$.title span` 幾乎不需要學習。

**每一列右側顯示判別結果**(`⟨XPath⟩` / `⟨CSS⟩` / `⟨JS⟩`)。不要讓使用者猜工具怎麼理解他的輸入,尤其兩種理解都會給出「看起來合理但不同」的結果時。

已知殘留:裸標籤名(如 `time`)會被當成 XPath 的 `child::time`(只找直接子層),使用者若想要 CSS 的後代選擇會得到 0 命中。這個錯誤不靜默 —— `⟨XPath⟩` 標籤與 `0/14` 徽章同時亮。其他常見 CSS 寫法(`.title`、`div span`、`a.link`)在 XPath 下是語法錯誤,會標紅,更明顯。

## 求值與型別分派

每條 expression 對**每個藍框各求值一次**,`el` 綁定當下那一列(**不是** `reds[0]` —— 樣本列只用於建樹,若求值時以它為 context,所有列會輸出同一筆資料)。XPath 的 `.` 與 CSS 的 `:scope` 都指向 `el`。

| 回傳值 | 處理 |
|---|---|
| Element | `innerText` |
| 其他 Node(attribute / text) | `textContent.trim()` |
| string | 依前綴解析為 XPath 或 CSS → 取得節點 → **回到上面兩條** |
| Array | 逐項套用以上 → `join(' ')` |

原規格寫「string → 求值後取 innerText」,但 attribute 與 text node 沒有 `innerText`,而轉移生成的 `@href`、`@datetime`、`text()[1]` 全部會炸。改成先解析成節點再依型別分派之後,`'./a/@href'`(字串)與 `el.getAttributeNode('href')`(節點)結果一致。

**前綴慣例同樣適用於 JS 列回傳的字串。** 否則字串來源不同就有兩套解析規則,那是最難除錯的一種不一致。

## CSP

`=` 需要 `new Function`,受 `script-src` 管轄,站台未開 `unsafe-eval` 會直接拋錯。

**無前綴與 `$` 前綴的列不需要 eval**,在嚴格 CSP 站台照常運作;只有 JS 列停用並顯示「本站台禁用 eval」,其餘欄位不受影響。

由於 **UI mode 轉移出來的永遠是選擇式列**,無痛轉移這條主要路徑在 CSP 站台上完整存活。這是採用前綴制最重要的收穫。

## 錯誤處理

逐列隔離。某列語法錯誤或拋例外 → 該列標紅顯示訊息、預覽該欄顯示 `⚠`,其他欄照常。**複製不擋** —— 錯誤是可見的紅色而非靜默空白,使用者若明知故犯要留空欄是他的自由。

空白列輸出空欄並標記,不自動移除,以維持畫面欄數與輸出欄數一致。

## 由 UI mode 轉移

按鈕 `↧ 由 UI 選擇產生`。

- 一段一個 checkbox → 一個裸 XPath(**不加引號**,少一層跳脫、少一個會被誤刪的字元)
- 一段多個 checkbox → 字串陣列,落在「Array 逐項求值後 `join(' ')`」規則上
- **覆寫,不合併。** script 區已有內容時先跳確認。合併需要定義「哪些 group 保留」,但使用者對 group 編號的心智模型是位置而非身分,結果不可預期。
- **單向一次性快照。** UI mode 的狀態不因 script 被編輯而改變,切回去仍是原樣。

## 延後

`outerHTML` 結構預覽(sanitize + prettier)這版不做。

---

# copy-raw

所有藍框的 `outerHTML`,**不做任何處理**,以 `\n` 相接。無註解分隔、無格式化、無 sanitize。

按鈕上顯示大小:`⟨複製 14 筆 · 約 82 KB⟩`。raw mode 很容易噴出幾百 KB,使用者該在按下去之前知道。

---

# 輸出契約

三條路線在此匯流。

## 逃逸:Control Pictures

`innerText` 會在 table cell 之間插 `\t`、block 邊界插 `\n`。直接 join 會把一欄炸成三欄、一列炸成兩列 —— 列數對不上的錯比錯字難察覺得多。

所有需要引導字元的方案都要回答「引導字元自己怎麼辦」:

| 方案 | 引導字元 | 需改寫原始資料? | `C:\new\table` | `Q&A?a=1&b=2` |
|---|---|---|---|---|
| `\n` `\t` | `\` | 必須 `\`→`\\` | `C:\\new\\table` | 原樣 |
| `&#10;` | `&` | 必須 `&`→`&amp;` | 原樣 | `Q&amp;A?a=1&amp;b=2` |
| `\x0A` | `\` | 仍必須 `\`→`\\` | `C:\\new\\table` | 原樣 |
| **Control Pictures** | **無** | **不需要** | **原樣** | **原樣** |

`\x0A` 沒有解決問題:引導字元仍是反斜線,`C:\xed\temp` 會被解碼器當成合法 hex 逃逸。`&#10;` 最糟:`&` 在網頁文字與 href query string 裡遠比 `\` 常見,整欄 URL 會變成 `&amp;`。

採用 Unicode Control Pictures 區塊(U+2400–U+241F),它與 C0 控制碼一一對應:

```js
function esc(v){
  return v.replace(/[\x00-\x1F\x7F]/g, function(c){
    var n = c.charCodeAt(0);
    return String.fromCharCode(n === 0x7F ? 0x2421 : 0x2400 + n);
  });
}
```

換行 → `␊`、tab → `␉`、CR → `␍`。**反斜線、`&`、任何既有字元一個都不動。**

好處:
- 路徑歧義根本不存在(沒有需要保護的引導字元)
- 全 C0 覆蓋只要一行,不需要逐個列舉,也沒有「反斜線必須第一個換」的順序陷阱
- 解碼是一行 replace
- 貼進試算表,`␊` 一眼看得出原本是換行

殘餘風險:原始資料本身含 `␊` 會被誤判。相較於 `\` 與 `&` 這兩個日常字元,碰撞機率差好幾個數量級。

唯一取捨:輸出不再是純 ASCII。

**逃逸統一套用於所有欄位值,包含 attribute。** URL 裡本來就不該有控制字元,為它保留例外不划算。copy-raw 不套用。

## 分隔

| | |
|---|---|
| group 內多來源 | 空白 |
| 欄位之間 | `\t` |
| 記錄之間 | `\n` |

**不輸出標題列。** 唯一可用的欄名是選擇式字串,那是雜訊不是欄名;而多一個開關就多一個要在三條路線之間保持一致的狀態。

## 剪貼簿

三階 fallback,三條路線共用:

1. `navigator.clipboard.writeText`
2. 失敗 → 離屏 `<textarea>` + `select()` + `document.execCommand('copy')`(已 deprecated 但全瀏覽器支援,且不需要 secure context)
3. 再失敗 → textarea 顯示於 modal 內、內容全選,提示「請按 Ctrl+C」

取代現有 `copyTxt` 的 `window.prompt` fallback:prompt 的輸入框是單行且瀏覽器對預填值有長度上限(Chrome 約兩千字截斷),82 KB 進去只會拿到前段 —— 使用者以為成功,實際只拿到零頭。

## 複製規格(JSON)

modal 內與「複製 N 筆」並排。**一個複製資料,一個複製食譜。** 工具列既有的「複製查詢式」原封不動,它服務的是不開 modal 的一維流程。

```json
{
  "v": 1,
  "root": "/html[1]/body[1]/div[3]/table[1]",
  "record": "./tbody[1]/tr",
  "fields": [
    ["./td[2]/a[1]/@href"],
    ["./td[1]/div/span/text()[1]", "./td[2]/span/div/div[1]/span[2]/span"],
    ["./td[2]/span/div/div[2]/time/@datetime"]
  ],
  "join": { "part": " ", "field": "\t", "record": "\n" },
  "escape": "control-pictures"
}
```

`fields` 的巢狀陣列同時表達了斷點:外層一項 = 一個 group,內層多項 = 組內以空白相接。script mode 的列以原字串放入(含 `=` / `$` 前綴),讓消費端自行判斷 —— JS 表達式本來就無法移植到 Python,原樣帶過去比假裝它是選擇式好。

### 可攜性註記

`innerText` 依賴 layout,**在瀏覽器外不可重現**(lxml、BeautifulSoup 都算不出來)。

好消息是落差幾乎不存在,原因來自最小顆粒度規則:**element leaf 依定義沒有子元素**,其 `innerText` 與 `textContent` 只差在空白正規化;`text()[n]` 與 `@attr` 更是完全可重現。

唯一真正有落差的是 **root**(`.` → 整列 innerText,會插入 `\t` / `\n`)。root 被勾選時,JSON 多帶一個欄位:

```json
"note": "root uses innerText; not reproducible outside a browser"
```

只在該情況出現。

---

# Modal 與狀態

## 容器:`<dialog>` + `showModal()`

- **Top layer**,不吃 z-index 競賽。現有 `box` / `tip` / `bar` 靠 `z-index:2147483646/7` 硬頂,任何後插入且同樣開到最大值的頁面元素都會贏過它們。
- **`inert`**:頁面內容不接受點擊與焦點。
- 原生 Esc 與焦點鎖。

代價:**backdrop 連工具列一起蓋住並使其 inert**,modal 開啟期間不能點 pill。可接受 —— 因為失效規則只看 `reds[0]`,關閉 modal → 調整 pill → 重開,勾選與斷點完整保留,只多兩個動作。

替代方案(自建 overlay div 保留工具列、或把工具列搬進 dialog)都更貴:前者回到 z-index 競賽並要維護挖洞邏輯,後者要兩套定位 CSS 且開關時工具列會從畫面底部跳進 modal。

### 兩行守衛

`<dialog>` 蓋不掉這兩件事:

```js
// move():::backdrop 是虛擬元素不會被回傳,elementFromPoint 可能仍回傳底下的
// inert 頁面元素,橘框會繼續跟著游標跑。各家瀏覽器對 inert 與 hit test 的處理不一致。
if (dlg.open) return hide();

// key():掛在 window capture 階段,會早於 dialog 的 cancel 事件,直接把整個工具 off() 掉
if (dlg.open) return;
```

### 樣式

頁面 CSS 會命中 `dialog` 與 `::backdrop`(常見 reset:`dialog { padding:0; border:0; position:static }`)。需要與現有 button/span 上 `all:unset` 同等級的顯式覆寫,但**不能用 `all:unset`** —— 那會破壞 top layer 定位。

## Esc 分兩層

modal 開著時第一次 Esc 只關 modal,第二次才結束工具。誤按一下就把整個標註狀態連同工具炸掉,是不合比例的懲罰。

## 失效規則

依賴關係:

| 狀態 | 依賴 | pill / 綠框變動 | `reds[0]` 變動 |
|---|---|---|---|
| 樹的結構 | 只依賴 `reds[0]` | 不變 | 重建 |
| 勾選 + 斷點 | 掛在樹節點上 | 不變 | 清空 |
| coverage 徽章 | `matched` | 重算 | 重算 |
| 預覽 | `matched` | 重算 | 重算 |
| script 各列內容 | 使用者輸入 | 不變 | **不變** |

**以 `reds[0]` 的元素身分為唯一失效條件。**

- `reds[1]` 換掉而 `reds[0]` 沒變 → 樹不變,徽章重算
- `reds[0]` 換掉或被取消 → 樹重建、勾選清空,modal 頂端提示「樣本列已變更,欄位選擇已重置」
- **不嘗試用路徑字串把舊勾選比對回新樹** —— 換了樣本列意味著結構可能完全不同,勉強對回去只會產生看似成功實則錯位的選擇
- **script 各列永遠不動**。使用者手寫的內容,任何自動清空都不可接受;`reds[0]` 變了就讓徽章與預覽自己變紅

注意 `reds` 取消時會 `filter` 收縮,取消第一個紅框會讓 `reds[1]` 遞補為 `reds[0]` —— 落在重建那條,所以那行提示有必要。

## 版面預設

| 項目 | 值 |
|---|---|
| 預設分頁 | UI mode |
| 尺寸 | 寬 `min(760px, 92vw)`,高 `max 80vh`;樹區與預覽區各自捲動 |
| 預覽筆數 | 取樣的前 3 筆 |
| 未勾選任何欄位 | 「複製 N 筆」與「複製規格」皆 disable;raw 分頁不受影響 |
| 分頁切換 | 各分頁狀態獨立保留,切走再切回原樣 |
| 樹的捲動 | 內部捲動,不做虛擬捲動(leaf 數已被剪枝壓住) |

---

# 主題

明亮 / 暗黑兩套,**預設為頁面的相反**(頁面深色 → 工具亮色),目的是視覺區隔。

## 偵測

量頁面**實際背景亮度**,而非 `prefers-color-scheme`:後者測的是作業系統偏好,而「OS 深色 + 頁面白底」極為常見,那時會判定錯誤並選出白底配白工具。用什麼標準判斷,就該量什麼。

```js
function pageIsDark(){
  var els = [document.body, document.documentElement], c;
  for (var i = 0; i < els.length; i++){
    var m = getComputedStyle(els[i]).backgroundColor.match(/[\d.]+/g);
    if (m && (m.length < 4 || +m[3] > 0.5)) { c = m; break; }
  }
  if (!c) return matchMedia('(prefers-color-scheme: dark)').matches;
  return (+c[0] * 299 + +c[1] * 587 + +c[2] * 114) / 1000 < 128;
}
```

背景全透明時才退回 `prefers-color-scheme`。

- **只在啟用當下算一次。** 為了頁面中途切主題而掛 MutationObserver 不划算。
- **提供手動切換鈕**(工具列 `◐`,循環亮/暗)。自動判斷一定有猜錯的時候(漸層、背景圖、背景色設在中層容器),而使用者一眼就知道對不對 —— 讓他自己翻比把偵測做複雜可靠。

## 範圍

主題化的只有 `bar`、`tip`、dialog 三個容器。實作上把現在寫死在 `cssText` 裡的 `#1c2430` / `#fff` / `#3a4553` / `#2a3340` / `#7d8794` / `#9ecbff` 抽成六到八個 token 的物件,兩套值。

**紅 / 綠 / 藍 / 橘四色框不隨主題變。** 它們畫在頁面上而非工具 UI 上,而且是語意識別碼 —— 文件全篇以顏色指稱概念(紅框、綠框、藍框),跟著主題換色會讓文件與畫面對不上。現有四個色票在深淺底上對比都夠。

---

# 案例

輸入(Claude 對話清單的一列,`reds[0]`):

```html
<tr><td><div><span>xxx<span><span>&#xF0A2;</span>   </span></span><input /></div></td><td><a href="/chat/7dbee47c-a40e-48dd-adf2-2605a69414f2"></a><span><div><div>xxx<span>&#xF0A2;</span><span><span>WebRTC vs WebSocket comparison</span></span>   </div><div><time datetime="2026-08-20T06:02:21.992Z">4 days ago</time></div></div></span></td><td><div><button>xxx<span><span></span></span><span><span>&#xF0A2;</span></span>yyy</button></div></td></tr>
```

三個 `&#xF0A2;` 是圖示字型的 PUA 字元。它們 `trim()` 後長度為 1、`innerText` 也非空,因此存活 —— 這是「看得見的留下」原則的直接結果。

## 未剪枝

```
- [ ] tr (root)
  - td
    - div
      - span
        - [ ] _
        - span
          - [ ] span
          - [ ] _ (blank)
      - input (無存活 leaf)
  - td
    - [ ] a/@href
    - span
      - div
        - div
          - [ ] _
          - [ ] span
          - span
            - [ ] span
          - [ ] _ (blank)
        - div
          - time
            - [ ] _
            - [ ] @datetime
  - td
    - div
      - button
        - [ ] _
        - span
          - span (無存活 leaf)
        - span
          - [ ] span
        - [ ] _
```

## 剪枝後

移除 `blank()` 為真的 text node、以及沒有任何存活子 leaf 的元素(`<input>`、td3 第一個空 span 鏈)。

## 坍縮後(最終)

```
- [ ] tr (root)
  - td/div/span
    - [ ] _                xxx
    - [ ] span/span        ⟨PUA 圖示⟩
  - td
    - [ ] a/@href          /chat/7dbee47c-a40e-48dd-adf2-2605a69414f2
    - span/div
      - div
        - [ ] _            xxx
        - [ ] span         ⟨PUA 圖示⟩
        - [ ] span/span    WebRTC vs WebSocket comparison
      - div/time
        - [ ] _            4 days ago
        - [ ] @datetime    2026-08-20T06:02:21.992Z
  - td/div/button
    - [ ] _                xxx
    - [ ] span/span        ⟨PUA 圖示⟩
    - [ ] _                yyy
```

`<a href>` 存活不是因為它是 anchor,而是因為 `@href` 這個 leaf —— 特例變成規則的一個實例。

## 典型選擇

勾 `a/@href`(①)、`span/span` 標題(②)、`@datetime`(③),分欄尺切兩刀:

```
/chat/7dbee47c-a40e-48dd-adf2-2605a69414f2	WebRTC vs WebSocket comparison	2026-08-20T06:02:21.992Z
```

## 已知失效

若 `⟨PUA 圖示⟩` 代表「已收藏」,未收藏的列少一個 span,標題的嚴格路徑從 `span[2]/span[1]` 位移成 `span[1]/span[1]`,徽章顯示 `9/14`,那些列輸出空字串。處置:轉移到 script mode,把第 ② 條改成 `.//div/span/span`。

---

# 限制與拒絕條件一覽

| 情況 | 時機 | 行為 |
|---|---|---|
| `reds[0] ∉ matched` | 按鈕狀態 | `深入` disable + tooltip |
| 剪枝後樹無任何 checkbox | modal 開啟 | UI 分頁空狀態,指向 script / raw |
| 未勾選任何欄位 | 複製當下 | 「複製 N 筆」「複製規格」disable |
| 選擇式語法錯誤 / JS 拋例外 | 求值當下 | 該列標紅,該欄 `⚠`,其餘照常,不擋複製 |
| 站台禁用 eval | script 分頁 | JS 列停用並提示,選擇式列照常 |
| 記錄數 > 50 | modal 開啟 | coverage 取前 50 筆,樹頂顯示取樣說明 |
| 序號位移造成 0 命中 | 徽章 | 顯示部分命中,該列輸出空字串(不靜默) |
| 樣本列內容不完整 | — | 該欄位不在樹上;改選內容較完整的列當第一個紅框 |
| 空元素(presence 即資料) | 剪枝 | 剪掉;由 script mode 以 `el.querySelector(…) ? '1' : ''` 處理 |
| `visibility:hidden` / sr-only | 剪枝 | **保留**(可能是有價值的隱藏資料) |
| root 的 innerText | 複製規格 | JSON 加註不可在瀏覽器外重現 |

沿用 @./draft.md 的既有限制:嚴格 CSP 站台、iframe 內容、SVG / 命名空間元素。

---

# 實作備註

- 剪枝與坍縮在 `build()` 之外執行,只在 modal 開啟時跑一次(頁面與工具列在 modal 開啟期間 inert,`matched` 不可能改變)
- 序號沿用既有 `tagIdx()`;text node 序號另計
- 求值一律 `document.evaluate(expr, el, null, ORDERED_NODE_SNAPSHOT_TYPE, null)`,`el` 為當下藍框
- CSS 以 `el.querySelectorAll(sel)`,需支援 `:scope` 前綴
- `esc()` 套用於所有欄位值(含 attribute),不套用於 copy-raw
- `copyTxt` 改為三階 fallback,取代 `window.prompt`
- `move()` 與 `key()` 各加一行 `dlg.open` 守衛
- 主題 token 抽成物件,`bar` / `tip` / dialog 三處共用

---

# 1D:抽取文字的取值模式

深入擷取之外,原本的一維「抽取文字」也有一套取值契約。它與 2D 完全獨立,但兩者的分歧是刻意的,記在這裡以免日後被誤當成不一致而「修正」。

## 唯一的空白規則

**1D 的所有輸出都套用同一個正規化,沒有例外:**

```js
function norm(s){ return String(s).replace(/\s+/g, ' ').trim(); }
```

理由是 1D 的輸出契約是**一行一筆**。任何殘留的 `\n` 都會讓一筆記錄裂成兩行,而列數對不上是最難察覺的一種錯。

這條規則有一個免費的副作用:**它讓 `join('')` / `join(' ')` 的取捨消失。** 舊的 `getTxt` 是「先逐節點 trim,再 `join('')`」,所以 `<div>abc <span>X</span> def</div>` 會黏成 `abcdef`,於是需要一個 `join(' ')` 變體來補救。改成「原樣 join,最後才正規化」之後,同一段得到 `abc  def` → `abc def` —— 節點邊界原本就有的空白自己活了下來。分隔資訊一直都在原始文字裡,是過早 trim 把它殺掉的。

同樣地,「逐節點 trim」這個想法整個作廢:trim 只削節點的頭尾,節點**內部**的換行原封不動,而 HTML 原始碼的斷行常常就落在一個文字節點的中間。它想保留的東西 `textContent` 保留得更完整,它想清理的東西正規化清得更乾淨,兩頭不到岸。

## 三個模式

工具列上一顆循環 pill,點一下換下一個。預設為「文字」。

| 標籤 | 實作 | 用途 |
|---|---|---|
| **文字** | `norm(el.innerText)` | 預設。所見即所得 |
| **直屬** | `norm(直屬文字節點原樣 join(''))` | 舊預設。不展開巢狀元素 |
| **標記** | `norm(el.innerHTML)` | 連標籤一起輸出 |

### 為什麼「文字」用 innerText 而不是 textContent

正規化把 innerText 插入的 `\t` `\n` 都壓成空格之後,兩者只剩三處差別:

**其一:textContent 會把相鄰區塊黏在一起。**

```html
<div><div>abc</div><div>def</div></div>
```

`textContent` 正規化 → `abcdef`;`innerText` 正規化 → `abc def`。innerText 在 block 邊界插的那個 `\n`,正規化之後正好變成需要的詞界。卡片式版面(標題一個 div、時間一個 div)是列表頁常態,這個差異幾乎每次都會出現。

**其二:textContent 會把 `<script>` / `<style>` 的原始碼一起吐出來**,混進資料裡而且看起來像資料。innerText 天生排除。

**其三:innerText 會丟掉看不見的文字**(`display:none` 等)。這是 textContent 唯一佔優之處,但隱藏資料的需求已經有去處 —— 2D 的樹會把 sr-only 節點列出來讓使用者勾選。1D 的定位是「一鍵拿到看得見的東西」。

前兩項每次擷取都會遇到,第三項偶爾才想要,所以選 innerText。要接受的代價:它依賴版面(強制 reflow),而且會反映 `text-transform` —— 頁面用 CSS 轉成大寫,抓下來就是大寫。對「所見即所得」的定位而言這是一致的,但要知道它會發生。

### 「標記」也走 norm(),不走 Control Pictures

看起來比照 2D 用逃逸會更好(無損、單行、跨模式一致),但那會讓輸出**不再是合法 HTML**,每個消費端都得先解碼才能餵給 parser。`norm()` 後的 markup 仍是合法 HTML,重新解析出來幾乎是同一棵 DOM,因為標籤之間的空白在 HTML 裡本來就不顯著。唯一的例外是 `<pre>` / `<textarea>` 內部 —— 需要位元組級忠實的人,2D 的 Raw 分頁就是為此存在。

## 為什麼是循環 pill

三個模式、一個控制項,不需要「兩個 input 誰覆寫誰」那種需要使用者心算的關係。選循環 pill 而非分段按鈕或 `<select>`:

1. **它是這個工具的既有語法。** 判斷式的每個節點都是「點一下循環切換」的 pill,不需要學新東西。
2. **三態循環最遠兩下就到任何模式。**
3. **回饋迴路已經接好。** 工具列上 `選中 N 個:⋯` 那行預覽用的是同一個函式,pill 一點預覽當場變,不必「猜模式 → 複製 → 貼上 → 發現不對」。

原生 `<select>` 直接排除:它會吃頁面 CSS(站台 reset 常改 `select` 的 `appearance`),而整個檔案用 `all:unset` 重畫每個元件就是為了躲這件事。

配套:pill 的 `title` 帶完整說明;預覽每行截斷約 120 字(`標記` 模式一行可能數百字,而那個 span 是 `white-space:pre`,`text-overflow:ellipsis` 對多行不生效,會把工具列撐爆)。

## 複製查詢式

規格必須自我描述,否則外部爬蟲重現不出一樣的結果 —— 與 2D 的複製規格同一個理由。所以 `複製查詢式` 帶四行:

```
綠框: /html[1]/body[1]/div[3]/table[1]
判斷式: ./tbody[1]/tr
取值: innerText
空白: \s+ → 單一空格,前後 trim
```

`取值` 隨 pill 變動。維持純文字而不改 JSON:1D 的產出只有四行,不需要結構化。

## 與 2D 的契約分歧

同一個元素,兩條路線給出不同的字串:

| | `<div>abc<br>def</div>` |
|---|---|
| 1D 抽取文字 | `abc def`(正規化,有損) |
| 2D 複製 N 筆 | `abc␊def`(Control Pictures,無損) |

**這個分歧要保留。** 1D 是「一鍵拿到看得見的東西,貼進試算表」,2D 是「定義過欄位的結構化匯出」;消費者不同,契約不同,而兩邊各自內部一致。硬要統一,不是讓 1D 背上使用者沒要求的逃逸符號,就是讓 2D 變成有損。
