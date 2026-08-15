function _(){
  const songPlayDict = {};
  const getSong = q=>(q.playlistPanelVideoRenderer?.title.runs[0].text || q.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.title.runs[0].text).trim();
  const getAlbum = q=>(q.playlistPanelVideoRenderer?.longBylineText.runs[2].text || q.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.longBylineText.runs[2].text).trim();
  const sortByPlays = (a,b)=>{
    const aKey = `${getAlbum(a)}\t${getSong(a)}`;
    const bKey = `${getAlbum(b)}\t${getSong(b)}`;
    const aVal = songPlayDict[aKey];
    const bVal = songPlayDict[bKey];
    // if (!aVal) console.warn(aKey, aVal);
    // if (!bVal) console.warn(bKey, bVal);
    return bVal - aVal;
  };
  const str2Val = str=>{
    switch (str.at(-1)) {
      case 'K': return +str.slice(0,-1) * 1000;
      case 'M': return +str.slice(0,-1) * 1000 * 1000;
      case 'B': return +str.slice(0,-1) * 1000 * 1000 * 1000;
    }
  };
  [...document.querySelector('div#contents.style-scope.ytmusic-playlist-shelf-renderer').children].forEach(q=>{
    const cat=q.querySelector('div:nth-child(3) > yt-formatted-string:nth-child(1) > a:nth-child(1)')?.textContent.trim();
    const key=q.querySelector('div:nth-child(1) > yt-formatted-string:nth-child(1) > a:nth-child(1)')?.textContent.trim();
    const str=q.querySelector('div:nth-child(2) > yt-formatted-string:nth-child(1)')?.textContent.trim().slice(0,-6);
    songPlayDict[`${cat}\t${key}`] = str2Val(str);
  });
  const store = document.querySelector('body > ytmusic-app').queue.store;
  const original = store.dispatch.bind(store);
  //monkey patching
  store.dispatch = q=>{
    // console.log(q.type, q);
    if (q.type === 'ADD_ITEMS') {
      const arr = q.payload.items;
      // console.log(arr.map(getSong));
      arr.sort(sortByPlays);
      // console.log(arr.map(getSong));
    }
    return original(q);
  }
}