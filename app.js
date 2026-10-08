"use strict";

const fileInput = document.querySelector("#file-input");
const openFilesButton = document.querySelector("#open-files");
const browseFilesButton = document.querySelector("#browse-files");
const dropzone = document.querySelector("#dropzone");
const dashboard = document.querySelector("#dashboard");
const queryRows = document.querySelector("#query-rows");
const emptyState = document.querySelector("#empty-state");
const detailPanel = document.querySelector("#detail-panel");
const detailContent = document.querySelector("#detail-content");
const searchInput = document.querySelector("#search-input");
const typeFilter = document.querySelector("#type-filter");
const planFilter = document.querySelector("#plan-filter");
const sortSelect = document.querySelector("#sort-select");
const toast = document.querySelector("#toast");

let queries = [];
let selectedId = null;
let toastTimer;

const ignoredCommandKeys = new Set([
  "lsid", "$clusterTime", "$db", "$readPreference", "clientOperationKey",
  "txnNumber", "stmtId", "cursor", "comment"
]);

openFilesButton.addEventListener("click", () => fileInput.click());
browseFilesButton.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});
dropzone.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  fileInput.click();
});
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", async () => {
  await importFiles([...fileInput.files]);
  fileInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-active");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-active");
  });
}
dropzone.addEventListener("drop", async (event) => {
  const files = [...event.dataTransfer.files].filter((file) => isSupportedFile(file));
  if (!files.length) {
    showToast("Choose a .log, .txt, .json, or .jsonl file.");
    return;
  }
  await importFiles(files);
});

searchInput.addEventListener("input", render);
typeFilter.addEventListener("change", render);
planFilter.addEventListener("change", render);
sortSelect.addEventListener("change", render);

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    render();
    searchInput.blur();
  }
});

function isTypingTarget(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function isSupportedFile(file) {
  return /\.(log|txt|json|jsonl)$/i.test(file.name);
}

async function importFiles(files) {
  if (!files.length) return;
  const fileContents = [];
  for (const file of files) {
    if (!isSupportedFile(file)) {
      showToast(`Unsupported file: ${file.name}`);
      continue;
    }
    try {
      fileContents.push({ name: file.name, text: await file.text() });
    } catch (error) {
      showToast(`Could not read ${file.name}: ${error.message}`);
    }
  }
  if (!fileContents.length) return;

  const parsed = fileContents.map(({ name, text }) => parseLog(text, name));
  queries = parsed.flatMap((result) => result.queries);
  queries.sort((a, b) => b.duration - a.duration);
  selectedId = queries[0]?.id ?? null;
  document.querySelector("#loaded-files").textContent =
    `${fileContents.length} file${fileContents.length === 1 ? "" : "s"} · ${formatNumber(queries.length)} slow quer${queries.length === 1 ? "y" : "ies"}`;
  document.querySelector("#loaded-files").hidden = false;
  dashboard.hidden = false;
  dropzone.hidden = true;
  const malformed = parsed.reduce((sum, result) => sum + result.malformed, 0);
  const nonSlow = parsed.reduce((sum, result) => sum + result.nonSlow, 0);
  const notice = document.querySelector("#parse-notice");
  if (malformed || nonSlow) {
    const notes = [];
    if (nonSlow) notes.push(`${formatNumber(nonSlow)} non-slow log entries skipped`);
    if (malformed) notes.push(`${formatNumber(malformed)} lines could not be parsed`);
    notice.textContent = notes.join(" · ");
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
  render();
  if (queries.length) showToast(`Loaded ${formatNumber(queries.length)} slow quer${queries.length === 1 ? "y" : "ies"}.`);
  else showToast("No slow query entries were found in the selected files.");
}

function parseLog(text, sourceName) {
  const parsedQueries = [];
  let malformed = 0;
  let nonSlow = 0;
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const start = line.indexOf("{");
    if (start === -1) {
      if (line.trim()) malformed++;
      return;
    }
    let event;
    try {
      event = JSON.parse(line.slice(start));
    } catch {
      malformed++;
      return;
    }

    const attr = event?.attr;
    if (!attr || typeof attr !== "object") {
      nonSlow++;
      return;
    }
    const command = attr.command || attr.originatingCommand;
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      nonSlow++;
      return;
    }
    const operation = getOperation(command, attr);
    if (!operation) {
      nonSlow++;
      return;
    }

    const namespace = typeof attr.ns === "string" ? attr.ns : "";
    const namespaceParts = namespace.split(".");
    const namespaceDatabase = namespaceParts.shift() || "";
    const database = command.$db || namespaceDatabase || "unknown";
    const namespaceCollection = namespaceParts.join(".");
    const collection = !namespaceCollection || namespaceCollection === "$cmd"
      ? getCollection(command, operation)
      : namespaceCollection;
    const id = `${sourceName}:${index}:${parsedQueries.length}`;
    parsedQueries.push({
      id,
      sourceName,
      lineNumber: index + 1,
      timestamp: event.t?.$date || event.t || null,
      database,
      collection: collection || "unknown",
      namespace: namespace || `${database}.${collection || "unknown"}`,
      operation,
      duration: numeric(attr.durationMillis),
      docsExamined: numeric(attr.docsExamined),
      keysExamined: numeric(attr.keysExamined),
      returned: numeric(attr.nreturned),
      plan: attr.planSummary || "Plan unavailable",
      query: cleanCommand(command),
      attr,
      event
    });
  });

  return { queries: parsedQueries, malformed, nonSlow };
}

function getOperation(command, attr) {
  if (command.getMore !== undefined) return "getMore";
  for (const operation of ["find", "aggregate", "update", "insert", "delete", "count", "distinct", "findAndModify"]) {
    if (Object.hasOwn(command, operation)) return operation;
  }
  return eventIsSlowQuery(attr) ? "other" : null;
}

function eventIsSlowQuery(attr) {
  return attr.type === "command" || attr.durationMillis !== undefined;
}

function getCollection(command, operation) {
  if (operation === "getMore") return command.collection;
  return command[operation];
}

function cleanCommand(command) {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !ignoredCommandKeys.has(key)));
}

function render() {
  const visible = getVisibleQueries();
  renderStats(visible);
  document.querySelector("#result-count").textContent = formatNumber(visible.length);
  document.querySelector("#result-subtitle").textContent =
    visible.length === queries.length
      ? `${formatNumber(queries.length)} slow quer${queries.length === 1 ? "y" : "ies"} found in your imported logs`
      : `Showing ${formatNumber(visible.length)} of ${formatNumber(queries.length)} slow queries`;

  queryRows.replaceChildren(...visible.map(createRow));
  emptyState.classList.toggle("visible", visible.length === 0);
  queryRows.hidden = visible.length === 0;
  document.querySelector("#table-footer").textContent = visible.length
    ? `Showing ${formatNumber(visible.length)} quer${visible.length === 1 ? "y" : "ies"} · Sorted by ${sortSelect.options[sortSelect.selectedIndex].text.toLowerCase()}`
    : "";
  if (!visible.some((query) => query.id === selectedId)) selectedId = visible[0]?.id ?? null;
  updateSelectedRow();
  renderDetail(queries.find((query) => query.id === selectedId) || null);
}

function getVisibleQueries() {
  const search = searchInput.value.trim().toLowerCase();
  const operation = typeFilter.value;
  const plan = planFilter.value;
  const filtered = queries.filter((query) => {
    if (operation !== "all" && (operation === "other" ? !isKnownOperation(query.operation) : query.operation !== operation)) return false;
    if (plan === "COLLSCAN" && !query.plan.includes("COLLSCAN")) return false;
    if (plan === "indexed" && !/(IXSCAN|COUNT_SCAN|DISTINCT_SCAN)/i.test(query.plan)) return false;
    if (!search) return true;
    const haystack = `${query.database} ${query.collection} ${query.operation} ${query.plan} ${JSON.stringify(query.query)} ${query.sourceName}`.toLowerCase();
    return haystack.includes(search);
  });

  return filtered.sort((a, b) => {
    if (sortSelect.value === "time") return getTimestamp(b) - getTimestamp(a);
    if (sortSelect.value === "docs") return b.docsExamined - a.docsExamined || b.duration - a.duration;
    return b.duration - a.duration || b.docsExamined - a.docsExamined;
  });
}

function isKnownOperation(operation) {
  return ["find", "aggregate", "update", "insert", "delete", "getMore"].includes(operation);
}

function createRow(query) {
  const row = document.createElement("tr");
  row.dataset.id = query.id;
  row.classList.toggle("selected", query.id === selectedId);
  row.setAttribute("aria-label", `Open ${query.operation} query on ${query.namespace}, ${formatDuration(query.duration)}`);

  const namespaceCell = document.createElement("td");
  const namespace = document.createElement("div");
  namespace.className = "namespace";
  const database = document.createElement("strong");
  database.textContent = query.database;
  const collection = document.createElement("span");
  collection.textContent = query.collection;
  namespace.append(database, collection);
  namespaceCell.append(namespace);

  const operationCell = document.createElement("td");
  operationCell.append(makeBadge(operationLabel(query.operation), "op-badge"));

  const durationCell = document.createElement("td");
  durationCell.className = "duration";
  durationCell.textContent = formatDuration(query.duration);

  const docsCell = document.createElement("td");
  docsCell.innerHTML = `<div class="docs-cell"><strong>${escapeHtml(formatNumber(query.docsExamined))} docs</strong><span>${escapeHtml(formatNumber(query.keysExamined))} keys</span></div>`;

  const planCell = document.createElement("td");
  const isScan = query.plan.includes("COLLSCAN");
  const planBadge = makeBadge(query.plan, `plan-badge ${planClass(query.plan)}`);
  planBadge.title = query.plan;
  planCell.append(planBadge);

  const arrowCell = document.createElement("td");
  arrowCell.className = "row-arrow";
  arrowCell.textContent = "›";
  row.append(namespaceCell, operationCell, durationCell, docsCell, planCell, arrowCell);
  row.addEventListener("click", () => {
    selectedId = query.id;
    updateSelectedRow();
    renderDetail(query);
  });
  return row;
}

function makeBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function planClass(plan) {
  if (plan.includes("COLLSCAN")) return "scan";
  if (/(IXSCAN|COUNT_SCAN|DISTINCT_SCAN)/i.test(plan)) return "index";
  return "";
}

function updateSelectedRow() {
  for (const row of queryRows.rows) row.classList.toggle("selected", row.dataset.id === selectedId);
}

function renderStats(visible) {
  const count = visible.length;
  const average = count ? visible.reduce((sum, query) => sum + query.duration, 0) / count : 0;
  const collectionScans = visible.filter((query) => query.plan.includes("COLLSCAN")).length;
  const slowest = visible.reduce((max, query) => Math.max(max, query.duration), 0);
  const stats = [
    ["SLOW QUERIES", formatNumber(count), "Matching current filters", "green"],
    ["AVERAGE DURATION", formatDuration(average), "Across visible queries", ""],
    ["COLLECTION SCANS", formatNumber(collectionScans), count ? `${((collectionScans / count) * 100).toFixed(1)}% of visible queries` : "No queries match filters", collectionScans ? "red" : ""],
    ["SLOWEST QUERY", formatDuration(slowest), "Maximum execution time", ""]
  ];
  document.querySelector("#stats").replaceChildren(...stats.map(([label, value, foot, style]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const title = document.createElement("div");
    title.className = "stat-label";
    title.textContent = label;
    const metric = document.createElement("div");
    metric.className = `stat-value ${style}`;
    metric.textContent = value;
    const note = document.createElement("div");
    note.className = "stat-foot";
    note.textContent = foot;
    card.append(title, metric, note);
    return card;
  }));
}

function renderDetail(query) {
  const placeholder = detailPanel.querySelector(".detail-placeholder");
  if (!query) {
    placeholder.hidden = false;
    detailContent.hidden = true;
    detailContent.replaceChildren();
    return;
  }
  placeholder.hidden = true;
  detailContent.hidden = false;
  detailContent.replaceChildren();

  const header = document.createElement("div");
  header.className = "detail-header";
  const titleBlock = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "detail-title";
  title.textContent = `${query.database}.${query.collection}`;
  const time = document.createElement("div");
  time.className = "detail-time";
  time.textContent = `${operationLabel(query.operation)}${query.timestamp ? ` · ${formatTimestamp(query.timestamp)}` : ""}`;
  titleBlock.append(title, time);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "copy-button";
  copyButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M10.5 5V3.8A.8.8 0 0 0 9.7 3H3.8a.8.8 0 0 0-.8.8v6.4a.8.8 0 0 0 .8.8H5"/></svg><span>Copy</span>';
  copyButton.addEventListener("click", () => copyQuery(query, copyButton));
  header.append(titleBlock, copyButton);

  const metrics = document.createElement("div");
  metrics.className = "detail-metrics";
  const metricsData = [
    ["Duration", formatDuration(query.duration)],
    ["Returned", formatNumber(query.returned)],
    ["Docs examined", formatNumber(query.docsExamined)],
    ["Keys examined", formatNumber(query.keysExamined)]
  ];
  for (const [label, value] of metricsData) {
    const metric = document.createElement("div");
    metric.className = "detail-metric";
    const metricLabel = document.createElement("span");
    metricLabel.textContent = label;
    const metricValue = document.createElement("strong");
    metricValue.textContent = value;
    metric.append(metricLabel, metricValue);
    metrics.append(metric);
  }

  const planLabel = document.createElement("div");
  planLabel.className = "detail-section-title";
  planLabel.textContent = "Query plan";
  const planBadge = makeBadge(query.plan, `plan-badge ${planClass(query.plan)}`);
  planLabel.append(planBadge);

  const ratio = query.returned > 0 ? query.docsExamined / query.returned : null;
  const advice = document.createElement("div");
  const isScan = query.plan.includes("COLLSCAN");
  advice.className = `warning-box ${isScan ? "" : "good"}`;
  advice.textContent = isScan
    ? "Collection scan: MongoDB examined documents without using an index. Check whether an index on the filter or sort fields could help."
    : ratio !== null && ratio >= 100
      ? `High scan-to-result ratio: ${formatNumber(query.docsExamined)} documents examined for ${formatNumber(query.returned)} returned (${ratio.toFixed(0)}:1). Review your filter and index coverage.`
      : /(IXSCAN|COUNT_SCAN|DISTINCT_SCAN)/i.test(query.plan)
        ? "Index scan detected. Compare examined documents with returned results to assess how selective the query is."
        : "Execution plan details are not available for this log entry.";
  if (!isScan && !/(IXSCAN|COUNT_SCAN|DISTINCT_SCAN)/i.test(query.plan)) advice.classList.remove("good");

  const queryTitle = document.createElement("div");
  queryTitle.className = "detail-section-title";
  queryTitle.textContent = "Command";
  const code = document.createElement("pre");
  code.className = "query-code";
  code.innerHTML = highlightJson(JSON.stringify(query.query, null, 2));

  const rawDetails = document.createElement("details");
  rawDetails.className = "raw-details";
  const summary = document.createElement("summary");
  summary.textContent = "View raw log event";
  const raw = document.createElement("pre");
  raw.textContent = JSON.stringify(query.event, null, 2);
  rawDetails.append(summary, raw);

  detailContent.append(header, metrics, planLabel, advice, queryTitle, code, rawDetails);
}

async function copyQuery(query, button) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(query.query, null, 2));
    button.querySelector("span").textContent = "Copied";
    window.setTimeout(() => {
      if (button.isConnected) button.querySelector("span").textContent = "Copy";
    }, 1400);
  } catch (error) {
    showToast(`Could not copy to clipboard: ${error.message}`);
  }
}

function highlightJson(json) {
  return json.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    (match, _token, offset) => {
      let style = "json-number";
      if (match.startsWith('"')) style = /^\s*:/.test(json.slice(offset + match.length)) ? "json-key" : "json-string";
      else if (/^(true|false|null)$/.test(match)) style = "json-boolean";
      return `<span class="${style}">${escapeHtml(match)}</span>`;
    }
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0 ms";
  if (milliseconds >= 1000) return `${(milliseconds / 1000).toFixed(milliseconds >= 10000 ? 1 : 2)} s`;
  return `${Number.isInteger(milliseconds) ? milliseconds : milliseconds.toFixed(1)} ms`;
}

function getTimestamp(query) {
  if (!query.timestamp) return 0;
  const date = new Date(query.timestamp).getTime();
  return Number.isFinite(date) ? date : 0;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
}

function operationLabel(operation) {
  if (operation === "getMore") return "GET MORE";
  if (operation === "findAndModify") return "FIND & MODIFY";
  return operation.toUpperCase();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}
