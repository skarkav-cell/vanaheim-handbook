(function (root) {
  'use strict';
  const PAGE_WIDTH = 794, PAGE_HEIGHT = 1123, GAP = 20;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function layout(view, width, height, active = 0, count = 2) {
    active = clamp(Math.floor(active), 0, count - 1);
    const visible = Array.from({ length: count }, (_, i) => i);
    const columns = view === 'spread' ? Math.min(2, count) : 1;
    const scale = Math.max(.001, view === 'wide' ? width / PAGE_WIDTH : Math.min(width / (PAGE_WIDTH * columns), height / PAGE_HEIGHT));
    const pageHeight = PAGE_HEIGHT * scale;
    return { visible, columns, scale, width: PAGE_WIDTH * scale, height: pageHeight, rowHeight: view === 'wide' ? pageHeight : height, gap: GAP };
  }
  function bookmark(scrollTop, pageHeight, count = 2, view = 'wide', preferredPage = 0) {
    const stride = pageHeight + GAP;
    const columns = view === 'spread' ? 2 : 1;
    const row = clamp(Math.floor(Math.max(0, scrollTop) / stride), 0, Math.ceil(count / columns) - 1);
    const page = Math.min(row * columns + (columns === 2 ? preferredPage % 2 : 0), count - 1);
    return { page, fraction: clamp((scrollTop - row * stride) / pageHeight, 0, 1) };
  }
  function scrollPosition(mark, pageHeight, view = 'wide') { return Math.floor(mark.page / (view === 'spread' ? 2 : 1)) * (pageHeight + GAP) + mark.fraction * pageHeight; }
  const api = { PAGE_WIDTH, PAGE_HEIGHT, GAP, clamp, layout, bookmark, scrollPosition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VanaheimBookGeometry = api;
})(typeof window === 'undefined' ? this : window);
