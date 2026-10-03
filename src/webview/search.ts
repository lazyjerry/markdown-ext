export interface TextMatch {
  start: number;
  end: number;
}

/** 不分大小寫，找出 query 在 text 中所有不重疊的位置；query 是字面字串，不當 regex。 */
export function findMatches(text: string, query: string): TextMatch[] {
  if (!query) {
    return [];
  }
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return Array.from(text.matchAll(pattern), (m) => ({ start: m.index, end: m.index + m[0].length }));
}

/**
 * 在 root 底下找出所有符合的文字範圍。文字節點先串成一份再比對，
 * 所以 `foo **bar**` 這種跨行內元素的字串也找得到；回傳的 Range 可以跨節點。
 */
export function findRanges(root: Node, query: string): Range[] {
  const doc = root.ownerDocument;
  if (!doc || !query) {
    return [];
  }
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).data;
  }

  const ranges: Range[] = [];
  let first = 0;
  for (const match of findMatches(text, query)) {
    while (first + 1 < nodes.length && starts[first + 1] <= match.start) {
      first++;
    }
    let last = first;
    while (last + 1 < nodes.length && starts[last + 1] < match.end) {
      last++;
    }
    const range = doc.createRange();
    range.setStart(nodes[first], match.start - starts[first]);
    range.setEnd(nodes[last], match.end - starts[last]);
    ranges.push(range);
  }
  return ranges;
}
