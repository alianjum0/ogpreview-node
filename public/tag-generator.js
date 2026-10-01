(function exposeTagGenerator(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MetaScopeTags = api;
})(typeof globalThis === "object" ? globalThis : this, function createTagGenerator() {
  function escapeAttribute(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function absoluteWebUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function generateTags(draft = {}) {
    const tags = [];
    const text = (name) => String(draft[name] || "").trim();
    const addMeta = (attribute, name, value) => {
      if (value) tags.push(`<meta ${attribute}="${name}" content="${escapeAttribute(value)}">`);
    };

    if (text("title")) tags.push(`<title>${escapeAttribute(text("title"))}</title>`);
    addMeta("name", "description", text("description"));
    const canonical = absoluteWebUrl(text("canonical"));
    if (canonical) tags.push(`<link rel="canonical" href="${escapeAttribute(canonical)}">`);

    addMeta("property", "og:title", text("ogTitle"));
    addMeta("property", "og:description", text("ogDescription"));
    addMeta("property", "og:image", absoluteWebUrl(text("ogImage")));
    addMeta("property", "og:url", absoluteWebUrl(text("ogUrl")));

    addMeta("name", "twitter:card", text("twitterCard"));
    addMeta("name", "twitter:title", text("twitterTitle"));
    addMeta("name", "twitter:description", text("twitterDescription"));
    addMeta("name", "twitter:image", absoluteWebUrl(text("twitterImage")));
    return tags.join("\n");
  }

  return { escapeAttribute, generateTags };
});
