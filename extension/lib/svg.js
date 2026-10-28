const SVG_NS = 'http://www.w3.org/2000/svg';
const elements = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'title', 'desc']);
const attributes = new Set(['id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-rule', 'clip-path', 'mask', 'maskUnits', 'maskContentUnits', 'clipPathUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'href', 'xlink:href', 'color', 'vector-effect']);
const styleProperties = new Set(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'stop-color', 'stop-opacity', 'clip-path', 'mask', 'color']);
function safeValue(value) {
  return !/[<>\\]|(?:javascript|https?|data|file):|@import|expression|\/\*/i.test(value) && (!/url\s*\(/i.test(value) || /^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/.test(value));
}

export function prepareSvg(icon, { size = 128, color = null } = {}) {
  const doc = new DOMParser().parseFromString(icon.svg, 'image/svg+xml');
  const source = doc.documentElement;
  if (doc.querySelector('parsererror') || source.localName !== 'svg' || source.namespaceURI !== SVG_NS) throw new Error('SVG 数据无效');
  const clean = document.implementation.createDocument(SVG_NS, 'svg', null);
  function copy(node) {
    if (node.nodeType === 3) return clean.createTextNode(node.textContent);
    if (node.nodeType !== 1 || node.namespaceURI !== SVG_NS || !elements.has(node.localName)) return null;
    const result = clean.createElementNS(SVG_NS, node.localName);
    for (const attr of node.attributes) {
      if (attributes.has(attr.name) && safeValue(attr.value) && (!/^(?:xlink:)?href$/.test(attr.name) || /^#[\w:.-]+$/.test(attr.value))) {
        if (attr.name === 'xlink:href') result.setAttribute('href', attr.value);
        else result.setAttribute(attr.name, attr.value);
      }
    }
    for (const property of styleProperties) {
      const value = node.style?.getPropertyValue(property).trim();
      if (value && safeValue(value)) result.setAttribute(property, value);
    }
    if (color) {
      for (const attr of ['fill', 'stroke', 'stop-color']) {
        if (result.hasAttribute(attr) && result.getAttribute(attr) !== 'none') result.setAttribute(attr, color);
      }
    }
    for (const child of node.childNodes) { const copied = copy(child); if (copied) result.append(copied); }
    return result;
  }
  const root = copy(source);
  clean.replaceChild(root, clean.documentElement);
  const viewBox = root.getAttribute('viewBox');
  if (!viewBox || !/^\s*-?[\d.]+[ ,]+-?[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+\s*$/.test(viewBox)) {
    root.setAttribute('viewBox', `0 0 ${Number(icon.width) > 0 ? Number(icon.width) : 1024} ${Number(icon.height) > 0 ? Number(icon.height) : 1024}`);
  }
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(size)); root.setAttribute('height', String(size));
  root.setAttribute('color', color || '#333333');
  if (color) root.setAttribute('fill', color);
  return new XMLSerializer().serializeToString(root);
}

export function svgDataUrl(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

export async function renderPng(svg, size, signal) {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      const abort = () => { img.src = ''; reject(new DOMException('已取消', 'AbortError')); };
      const cleanup = () => signal?.removeEventListener('abort', abort);
      img.onload = () => { cleanup(); resolve(); };
      img.onerror = () => { cleanup(); reject(new Error('PNG 转换失败')); };
      signal?.addEventListener('abort', abort, { once: true });
      img.src = url;
    });
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 编码失败');
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
