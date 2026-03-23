function extractTextPreservingEmojis(element) {
  if (!element) return '';

  const TEXT_NODE = (globalThis.Node && globalThis.Node.TEXT_NODE) || 3;
  const ELEMENT_NODE = (globalThis.Node && globalThis.Node.ELEMENT_NODE) || 1;

  const parts = [];

  const walk = (node) => {
    if (!node) return;

    if (node.nodeType === TEXT_NODE) {
      if (node.nodeValue) parts.push(node.nodeValue);
      return;
    }

    if (node.nodeType !== ELEMENT_NODE) return;

    const tag = node.tagName;

    if (tag === 'IMG') {
      const alt =
        (typeof node.getAttribute === 'function' && (node.getAttribute('alt') || node.getAttribute('aria-label'))) ||
        '';
      if (alt) parts.push(alt);
      return;
    }

    if (tag === 'BR') {
      parts.push('\n');
      return;
    }

    if (node.childNodes) {
      for (const child of node.childNodes) walk(child);
    }
  };

  walk(element);

  const joined = parts.join('').replace(/\u00A0/g, ' ');
  return joined.trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractTextPreservingEmojis };
}

if (typeof globalThis !== 'undefined') {
  globalThis.XScraperTextUtils = { extractTextPreservingEmojis };
}

