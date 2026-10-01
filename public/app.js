(function initializeMetaScope() {
  const placeholder = "/preview-placeholder.svg";

  document.querySelectorAll("[data-input-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.inputMode;
      document.querySelectorAll("[data-input-mode]").forEach((tab) => {
        tab.setAttribute("aria-selected", String(tab === button));
      });
      document.querySelectorAll("[data-input-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.inputPanel !== mode;
      });
    });
  });

  const editor = document.querySelector("[data-metadata-editor]");
  if (!editor || !globalThis.MetaScopeTags) return;

  const form = editor.querySelector("form");
  const generatedTags = editor.querySelector("[data-generated-tags]");
  const copyStatus = editor.querySelector("[data-copy-status]");
  let lastOgImage = form.elements.ogImage.value;
  let lastTwitterImage = form.elements.twitterImage.value || lastOgImage;

  function draft() {
    return Object.fromEntries(new FormData(form).entries());
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function previewImage(value) {
    if (!value) return placeholder;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return placeholder;
      return `/preview-image?url=${encodeURIComponent(url.toString())}`;
    } catch {
      return placeholder;
    }
  }

  function updateDraft() {
    const values = draft();
    const ogTitle = values.ogTitle || values.title || "No Title";
    const ogDescription = values.ogDescription || values.description || "No Description";
    const displayUrl = values.ogUrl || values.canonical || "";
    const twitterTitle = values.twitterTitle || ogTitle;
    const twitterDescription = values.twitterDescription || ogDescription;

    setText('[data-preview="url"]', displayUrl);
    setText('[data-preview="search-title"]', values.title || "No Title Found");
    setText('[data-preview="search-description"]', values.description || "No Description Found");
    setText('[data-preview="og-title"]', ogTitle);
    setText('[data-preview="og-description"]', ogDescription);
    setText('[data-preview="twitter-title"]', twitterTitle);
    setText('[data-preview="twitter-description"]', twitterDescription);

    if (values.ogImage !== lastOgImage) {
      document.querySelectorAll('[data-preview-image="og"]').forEach((image) => {
        image.src = previewImage(values.ogImage);
      });
      lastOgImage = values.ogImage;
    }
    const nextTwitterImage = values.twitterImage || values.ogImage;
    if (nextTwitterImage !== lastTwitterImage) {
      document.querySelectorAll('[data-preview-image="twitter"]').forEach((image) => {
        image.src = previewImage(nextTwitterImage);
      });
      lastTwitterImage = nextTwitterImage;
    }
    generatedTags.value = globalThis.MetaScopeTags.generateTags(values);
    copyStatus.textContent = "";
  }

  form.addEventListener("input", updateDraft);
  form.addEventListener("reset", () => setTimeout(updateDraft, 0));
  editor.querySelector("[data-copy-tags]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(generatedTags.value);
      copyStatus.textContent = "Tags copied.";
    } catch {
      generatedTags.focus();
      generatedTags.select();
      copyStatus.textContent = "Select and copy the highlighted tags.";
    }
  });
})();
