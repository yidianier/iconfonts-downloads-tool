(() => {
  if (document.getElementById('iconpack-extension-launcher')) return;
  const host = document.createElement('div');
  host.id = 'iconpack-extension-launcher';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;position:fixed;right:24px;bottom:28px;z-index:2147483646}:host([hidden]){display:none}button{display:flex;align-items:center;gap:9px;border:1px solid #ffffff40;background:#272b35;color:#fff;padding:13px 19px;border-radius:99px;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 5px 22px #17244a26;cursor:pointer;transition:transform .18s,background .18s}button:hover{background:#3d63e9;transform:translateY(-2px)}button:focus-visible{outline:3px solid #aabaff;outline-offset:3px}svg{width:17px;height:17px}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/></svg><span>批量下载</span>';
  button.title = '使用 Iconpack 下载当前图标库';
  button.addEventListener('click', () => {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_ICONPACK' }).catch(() => {
        button.textContent = '扩展已更新，请刷新页面';
      });
    } catch { button.textContent = '请刷新页面后重试'; }
  });
  shadow.append(style, button);
  document.documentElement.append(host);
  function update() {
    host.hidden = !/^\/(plus\/)?collections\/detail\/?$/.test(location.pathname) || !/^\d+$/.test(new URL(location.href).searchParams.get('cid') || '');
  }
  update();
  // iconfont uses client-side routing; this also handles pushState navigation.
  setInterval(update, 1000);
})();
