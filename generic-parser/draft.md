# Generic Parsing Algorithm

我們來設計通用資料爬取演算法
這個演算法會需要用到先前的紅框工具

使用者用紅框工具圈選任意元素，最多圈選三個 (以紅框框選 descendants)
圈選兩個以上時，透過演算法，自動框選所有距離 descendants 最近的共同 ancestor 元素 (越靠近 root 表示越遠)
以綠色框選共同祖先

決定共同祖先的同時, 演算法也得出查詢剩餘手足元素的判斷式 (更精確的說是同階層元素)
以藍色自動框選剩餘同階層元素
以下案例:
1. 皆以 XPath 呈現
2. "不對稱"的案例是指紅色框選的元素, 能取得相同的 XPath 結尾片段, 但整體 XPath 長度不一致
   - 為追求演算法簡化加上一條限制「至少要有另一個紅框的結尾與不對稱的結尾完全相等」, 才是合法的不對稱案例
3. 紅色框選所輸出的 XPath 都必須標注 `[]` predicate 以利於演算法計算
4. 所有案例皆以 `/root[1]/sect[1]` 出發

## 基本型案例: 紅框選二

### 情境1, 簡易共同父層

紅框圈選 `/root[1]/sect[1]/div[3]` 和 `/root[1]/sect[1]/div[4]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `./div[*]`
自動藍色框選 `/root[1]/sect[1]/div[*]`

### 情境2, 簡易共同祖先

紅框圈選 `/root[1]/sect[1]/div[3]/span[2]` 和 `/root[1]/sect[1]/div[4]/span[2]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `./div[*]/span[2]`
自動藍色框選 `/root[1]/sect[1]/div[*]/span[2]`

### 情境3, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]` 和 `/root[1]/sect[1]/div[1]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `null`
自動藍色框選 `null`

### 情境4, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[1]/span[2]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `null`
自動藍色框選 `null`

## 基本型案例: 紅框選三

### 情境1, 簡易共同祖先

紅框圈選 `/root[1]/sect[1]/div[3]/span[2]` 和 `/root[1]/sect[1]/div[4]/span[2]` 和 `/root[1]/sect[1]/div[3]/span[1]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `./div[*]/span[*]`
自動藍色框選 `/root[1]/sect[1]/div[*]/span[*]`

### 情境2, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]` 和 `/root[1]/sect[1]/aside[2]/div[1]` 和 `/root[1]/sect[1]/div[1]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `null`
自動藍色框選 `null`

### 情境3, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[2]/span[2]`
自動綠色框選 `/root[1]/sect[1]`
得查詢判斷式 `null`
自動藍色框選 `null`

## 進階型簡介

以上為基本型, 輸入比較單純, 只能動 decendants 紅框, 圈選 2-3 個, 其餘籃框, 綠框自動判斷
基本型的缺點就是無法處理不對稱的情況, 我們接著引入進階型演算法
進階型將判斷式從 `./` 改成 `.//` 藉此處理不對稱的案例
此外, 使用者除了紅框圈選兩個元素外, 還可以調整查詢判斷式以及綠框位置
(註: 進階型最多只允許圈選兩個紅框)

### 進階型的 UI

進階型的操作邏輯是「調整綠框獲取更大的查詢判斷式操作空間」
查詢判斷式的操作方法為切換 XPath 節點 `[]` predicate
使用者可以決定是否將 predicate 切換成星號
此外我們會將 UI 特化, 假如節點僅存在一個項目, 則禁止使用者將節點切換成星號

針對綠色框選, 我們採用自動偵測的方式
只要使用者點擊當前所有紅框的共同祖先, 就可以將綠色框選的位置"調遠"

### 進階型演算法



## 進階型案例: 紅框選二

### 情境1, 簡易共同父層

紅框圈選 `/root[1]/sect[1]/div[1]` 和 `/root[1]/sect[1]/div[2]`
- 綠色圈選 `/root[1]/sect[1]`
  - 查詢判斷式選項 `.//div[*]`
  - 自動藍色框選 `/root[1]/sect[1]//div[*]`
- 綠色圈選 `/root[1]`
  - 查詢判斷式選項 `.//sect[*]/div[*]`
  - 自動藍色框選 `/root[1]//sect[*]/div[*]`

### 情境2, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]` 和 `/root[1]/sect[1]/div[1]`
- 綠色圈選 `/root[1]/sect[1]`
  - 查詢判斷式選項 `.//div[*]`
  - 自動藍色框選 `/root[1]/sect[1]//div[*]`
- 綠色圈選 `/root[1]`
  - 查詢判斷式選項 `.//sect[*]/div[*]`
  - 自動藍色框選 `/root[1]//sect[*]/div[*]`

### 情境3, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[1]/span[2]`
- 綠色圈選 `/root[1]/sect[1]`
  - 查詢判斷式選項 `.//div[*]/span[2]`
  - 自動藍色框選 `/root[1]/sect[1]//div[*]/span[2]`
- 綠色圈選 `/root[1]`
  - 查詢判斷式選項 `./sect[*]//div[*]/span[2]`
  - 自動藍色框選 `/root[1]/sect[*]//div[*]/span[2]`

## 進階型案例: 紅框選三

### 情境1, 簡易共同祖先

紅框圈選 `/root[1]/sect[1]/div[3]/span[2]` 和 `/root[1]/sect[1]/div[4]/span[2]` 和 `/root[1]/sect[1]/div[3]/span[1]`
綠色框選選項 `/root[1]/sect[1]` or `/root[1]`
查詢判斷式選項 `.//div[*]/span[*]` or `.//div[*]/span[2]` or `.//div[3]/span[*]`
自動藍色框選:
- `/root[1]/sect[1]//div[*]/span[*]` or `/root[1]/sect[1]//div[*]/span[2]` or `/root[1]/sect[1]//div[3]/span[*]`
- `/root[1]//div[*]/span[*]` or `/root[1]//div[*]/span[2]` or `/root[1]//div[3]/span[*]`

### 情境2, 簡易共同祖先 (不對稱)

紅框圈選 (列表為兩種不同寫法, 同一個結果):
1. `/root[1]/sect[1]/aside[1]/div[1]` 和 `/root[1]/sect[1]/aside[2]/div[1]` 和 `/root[1]/sect[1]/div[1]`
2. `/root[1]/sect[1]/aside[1]/div[1]` 和 `/root[1]/sect[1]/div[1]` 和 `/root[1]/sect[1]/div[2]`
綠色框選選項 `/root[1]/sect[1]` or `/root[1]`
查詢判斷式選項 `.//div[*]`
自動藍色框選 `/root[1]/sect[1]//div[*]` or `/root[1]//div[*]`

### 情境3, 簡易共同祖先 (不對稱)

紅框圈選 `/root[1]/sect[1]/aside[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[1]/span[2]` 和 `/root[1]/sect[1]/div[2]/span[2]`
綠色框選選項 `/root[1]/sect[1]` or `/root[1]`
查詢判斷式選項 `.//div[*]/span[2]`
自動藍色框選 `/root[1]/sect[1]//div[*]/span[2]` or `/root[1]//div[*]/span[2]`
