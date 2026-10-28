function collectionId(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://www.iconfont.cn' || !/^\/(plus\/)?collections\/detail\/?$/.test(url.pathname)) return '';
    const id = url.searchParams.get('cid');
    return /^\d+$/.test(id || '') ? id : '';
  } catch { return ''; }
}

function openWorkspace(url) {
  const id = collectionId(url);
  const target = new URL(chrome.runtime.getURL('workspace.html'));
  if (id) target.searchParams.set('cid', id);
  target.searchParams.set('panel', '1');
  // The page applies the current monitor's available size after it opens.
  return chrome.windows.create({ url: target.href, type: 'popup', width: 480, height: 680, focused: true });
}

chrome.action.onClicked.addListener(tab => { openWorkspace(tab.url).catch(console.error); });
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'OPEN_ICONPACK' && sender.tab && collectionId(sender.url)) {
    openWorkspace(sender.url).catch(console.error);
  }
});
