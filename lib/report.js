function serializeAnalysis(analysis) {
  return {
    schemaVersion: 1,
    url: analysis.source.finalUrl || analysis.source.requestedUrl || "",
    source: analysis.source,
    score: analysis.score,
    metadata: analysis.metadata,
    checks: analysis.checks,
    images: analysis.images || { openGraph: null, twitter: null },
  };
}

function markdownCell(value) {
  const normalized = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
  return normalized || "—";
}

function toMarkdownReport(analysis) {
  const report = serializeAnalysis(analysis);
  const { metadata, score } = report;
  const metadataRows = [
    ["Title", metadata.title],
    ["Meta description", metadata.description],
    ["Canonical URL", metadata.canonical?.url || metadata.canonical?.raw],
    ["Open Graph title", metadata.openGraph?.title],
    ["Open Graph description", metadata.openGraph?.description],
    ["Open Graph image", metadata.openGraph?.image?.url || metadata.openGraph?.image?.raw],
    ["Open Graph URL", metadata.openGraph?.url?.url || metadata.openGraph?.url?.raw],
    ["Twitter card", metadata.twitter?.card],
    ["Twitter title", metadata.twitter?.title],
    ["Twitter description", metadata.twitter?.description],
    ["Twitter image", metadata.twitter?.image?.url || metadata.twitter?.image?.raw],
  ];
  const findings = report.checks.map((check) =>
    `| ${markdownCell(check.status).toUpperCase()} | ${markdownCell(check.category)} | ${markdownCell(check.id)} | ${markdownCell(check.message)} | ${markdownCell(check.evidence)} |`,
  );

  return [
    `# MetaScope audit: ${markdownCell(report.url || "Pasted HTML")}`,
    "",
    `Score: **${score.value}/100**`,
    "",
    `${score.errors} errors · ${score.warnings} warnings · ${score.passed} passed · ${score.info || 0} informational`,
    "",
    "## Detected metadata",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...metadataRows.map(([label, value]) => `| ${label} | ${markdownCell(value)} |`),
    "",
    "## Findings",
    "",
    "| Status | Category | Check | Finding | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...findings,
    "",
  ].join("\n");
}

module.exports = { serializeAnalysis, toMarkdownReport };
