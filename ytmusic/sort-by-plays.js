function _(){
  // toggle: 第二次點書籤即還原
  if (window.__sbp) { window.__sbp.off(); return; }

  // ---------- 播放次數索引（跨頁累積，不再只抓一次） ----------
  const plays = new Map();   // "專輯\t歌名" -> 次數
  const loose = new Map();   // "歌名" -> 次數（專輯對不起來時的退路，取最大值）
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  const str2Val = str => {
    const m = norm(str).match(/([\d.,]+)\s*([KMB])?/i);
    if (!m) return undefined;
    const n = +m[1].replace(/,/g, '');
    if (!isFinite(n)) return undefined;
    return n * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1);
  };

  // 清單列的第 n 欄（1=歌名, 2=播放次數, 3=專輯）
  const cell = (row, n) => row.querySelector(`div:nth-child(${n}) > yt-formatted-string:nth-child(1)`);
  const cellText = (row, n) => { const c = cell(row, n); return c ? norm((c.querySelector('a') || c).textContent) : ''; };

  const ROWS = [
    'ytmusic-playlist-shelf-renderer #contents > ytmusic-responsive-list-item-renderer',
    'ytmusic-shelf-renderer #contents > ytmusic-responsive-list-item-renderer'
  ].join(',');

  // 每次要排序前重掃當前頁面，把新歌併進索引（Queen 換到 AC/DC 也認得）
  const scan = () => {
    document.querySelectorAll(ROWS).forEach(row => {
      const title = cellText(row, 1);
      const val = str2Val(cellText(row, 2));
      const album = cellText(row, 3);
      if (!title || val === undefined) return;
      plays.set(`${album}\t${title}`, val);
      loose.set(title, Math.max(val, loose.get(title) ?? 0));
    });
  };

  // ---------- 佇列項目 ----------
  const renderer = q =>
    q.playlistPanelVideoRenderer ||
    q.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer ||
    {};
  const getSong = q => norm(renderer(q).title?.runs?.[0]?.text);
  const getAlbum = q => norm(renderer(q).longBylineText?.runs?.[2]?.text);

  const lookup = q => {
    const title = getSong(q);
    if (!title) return undefined;
    const hit = plays.get(`${getAlbum(q)}\t${title}`);
    return hit !== undefined ? hit : loose.get(title);
  };

  // 查無次數者一律墊底；Array#sort 穩定排序，同分維持原順序
  const sortByPlays = (a, b) => {
    const av = lookup(a), bv = lookup(b);
    if (av === undefined) return bv === undefined ? 0 : 1;
    if (bv === undefined) return -1;
    return bv - av;
  };

  // ---------- 畫面指示器 ----------
  const bar = document.createElement('div');
  bar.setAttribute('data-sbp-ui', '1');
  bar.style.cssText = 'position:fixed;right:16px;bottom:88px;z-index:2147483647;background:#1c2430;color:#fff;font:13px/1.6 sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center';
  const text = document.createElement('span');
  const offBtn = document.createElement('button');
  offBtn.textContent = '結束';
  offBtn.setAttribute('data-sbp-ui', '1');
  offBtn.style.cssText = 'all:unset;cursor:pointer;background:#3a4553;color:#fff;font:13px/1 sans-serif;padding:5px 10px;border-radius:5px';
  bar.innerHTML = '<span style="color:#ff6b81">●</span>';
  bar.append(text, offBtn);
  document.body.appendChild(bar);
  const status = msg => { text.textContent = `依播放次數排序中（索引 ${plays.size} 首）${msg ? ' · ' + msg : ''}`; };
  status('');

  // ---------- monkey patching ----------
  // 用 Map 記住每個 store 的原始 dispatch：SPA 換頁若重建 store 也能重新掛上，
  // 且原始函式只擷取一次，避免重複包裝造成無限遞迴
  const armed = new Map();

  const transform = action => {
    if (action?.type !== 'ADD_ITEMS' || !Array.isArray(action.payload?.items)) return action;
    scan();
    const items = action.payload.items.slice().sort(sortByPlays);
    const miss = items.filter(q => lookup(q) === undefined).length;
    status(`剛排序 ${items.length} 首${miss ? `（${miss} 首查無次數，已墊底）` : ''}`);
    return { ...action, payload: { ...action.payload, items } };
  };

  const store = () => document.querySelector('ytmusic-app')?.queue?.store;

  const arm = () => {
    const s = store();
    if (!s) return;
    let rec = armed.get(s);
    if (rec && s.dispatch === rec.patched) return;   // 已掛好
    if (!rec) {
      rec = { orig: s.dispatch.bind(s), patched: null };
      rec.patched = action => rec.orig(transform(action));
      armed.set(s, rec);
    }
    s.dispatch = rec.patched;
    status('');
  };

  if (!store()) { bar.remove(); alert('找不到 ytmusic-app.queue.store，請在 YouTube Music 頁面執行'); return; }
  arm();
  scan();

  const onNav = () => setTimeout(() => { arm(); scan(); status(''); }, 500);
  addEventListener('yt-navigate-finish', onNav, true);
  const timer = setInterval(arm, 2000);   // 保險：store 被換掉時重新掛上

  offBtn.addEventListener('click', () => window.__sbp.off());
  window.__sbp = {
    plays, scan,
    off: () => {
      clearInterval(timer);
      removeEventListener('yt-navigate-finish', onNav, true);
      armed.forEach((rec, s) => { if (s.dispatch === rec.patched) s.dispatch = rec.orig; });
      armed.clear();
      bar.remove();
      delete window.__sbp;
    }
  };
}
