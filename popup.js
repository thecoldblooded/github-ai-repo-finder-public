"use strict";

const SETTINGS_KEY = "repo_finder_settings";
const AUTH_KEY = "repo_finder_auth";
const DEFAULT_SETTINGS = Object.freeze({
  theme: "system",
  includePrivate: false,
  includeStarred: false,
  includeForks: true,
  includeArchived: false,
  apiEnabled: false,
  apiEndpoint: "",
  apiKey: "",
  apiModel: "gpt-4o-mini"
});

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Rust: "#dea584",
  Go: "#00add8",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Shell: "#89e051",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600"
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  auth: null,
  repos: [],
  searchResults: [],
  deviceSession: null,
  searchSequence: 0
};

const $ = (id) => document.getElementById(id);

function storageGet(keys) {
  if (!globalThis.chrome?.storage?.local) return Promise.resolve({});
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  if (!globalThis.chrome?.storage?.local) return Promise.resolve();
  return chrome.storage.local.set(value);
}

function storageRemove(keys) {
  if (!globalThis.chrome?.storage?.local) return Promise.resolve();
  return chrome.storage.local.remove(keys);
}

function showNotice(element, message, kind = "info") {
  if (!element) return;
  element.textContent = message;
  element.className = `notice${kind === "info" ? "" : ` ${kind}`}`;
  element.hidden = !message;
}

function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    delete button.dataset.label;
  }
}

function formatDate(value) {
  if (!value) return "Never synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return `Synced ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

function escapeText(value) {
  return String(value ?? "");
}

function normalizeAuth(raw) {
  if (!raw || typeof raw !== "object" || !raw.accessToken) return null;
  return {
    accessToken: raw.accessToken,
    tokenType: raw.tokenType || "bearer",
    scope: raw.scope || "",
    user: raw.user || null
  };
}

async function loadState() {
  const stored = await storageGet([SETTINGS_KEY, AUTH_KEY, "gitai_settings", "githubToken"]);
  const legacy = stored.gitai_settings || {};
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] || {}),
    ...(!stored[SETTINGS_KEY] ? {
      includePrivate: Boolean(legacy.includePrivate),
      includeStarred: Boolean(legacy.includeStarred),
      includeForks: legacy.includeForks !== false,
      includeArchived: Boolean(legacy.includeArchived),
      apiEnabled: Boolean(legacy.aiEnabled || legacy.apiEnabled),
      apiEndpoint: legacy.aiEndpoint || legacy.apiEndpoint || "",
      apiKey: legacy.aiApiKey || legacy.apiKey || "",
      apiModel: legacy.aiModel || legacy.apiModel || DEFAULT_SETTINGS.apiModel,
      theme: legacy.theme || DEFAULT_SETTINGS.theme
    } : {})
  };
  state.auth = normalizeAuth(stored[AUTH_KEY]);

  if (stored.githubToken || stored.gitai_settings) {
    await storageRemove(["githubToken", "gitai_settings"]);
  }

  const cache = await GitHubService.getCache().catch(() => null);
  state.repos = Array.isArray(cache?.repos) ? cache.repos : [];
}

function applyTheme(theme = state.settings.theme) {
  const resolved = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.dataset.theme = resolved;
  $("btn-theme").setAttribute("aria-label", `Switch to ${resolved === "dark" ? "light" : "dark"} theme`);
}

function setView(view) {
  const settings = view === "settings";
  $("search-view").hidden = settings;
  $("settings-view").hidden = !settings;
  if (settings) {
    renderSettings();
    $("settings-view").focus();
  } else {
    $("search-input").focus();
  }
}

function renderSettings() {
  const s = state.settings;
  $("include-private").checked = s.includePrivate;
  $("include-starred").checked = s.includeStarred;
  $("include-forks").checked = s.includeForks;
  $("include-archived").checked = s.includeArchived;
  $("api-enabled").checked = s.apiEnabled;
  $("api-endpoint").value = s.apiEndpoint;
  $("api-key").value = s.apiKey;
  $("api-model").value = s.apiModel;
  setApiFieldsEnabled();
  renderAuth();
  $("version").textContent = `Version ${chrome?.runtime?.getManifest?.().version || "2.0.0"}`;
}

function authClientConfigured() {
  return Boolean(globalThis.APP_CONFIG?.githubClientId && !String(APP_CONFIG.githubClientId).includes("YOUR_GITHUB_CLIENT_ID"));
}

function renderAuth() {
  const connected = Boolean(state.auth?.accessToken && state.auth?.user);
  $("github-signed-out").hidden = connected || Boolean(state.deviceSession);
  $("github-signed-in").hidden = !connected;
  $("device-flow").hidden = !state.deviceSession;
  $("github-status").textContent = connected ? "CONNECTED" : (state.deviceSession ? "PENDING" : "NOT CONNECTED");
  $("github-status").classList.toggle("connected", connected);
  $("btn-connect-github").disabled = !authClientConfigured();

  const help = $("oauth-config-help");
  if (help) {
    help.textContent = authClientConfigured()
      ? "You will approve a short code on github.com. The extension never receives your password."
      : "Release setup required: add your public GitHub OAuth App Client ID to config.js.";
  }

  if (connected) {
    const user = state.auth.user;
    $("github-avatar").src = user.avatar_url || "";
    $("github-avatar").alt = user.login ? `${user.login} avatar` : "GitHub avatar";
    $("github-name").textContent = user.name || user.login || "GitHub user";
    $("github-profile").textContent = `@${user.login || "github"}`;
    $("github-profile").href = user.html_url || "https://github.com";
  }

  const lastSync = state.repos.length ? Math.max(...state.repos.map((repo) => Date.parse(repo.cached_at || repo.updated_at || 0))) : 0;
  $("last-sync").textContent = formatDate(lastSync || null);
}

function setApiFieldsEnabled() {
  const enabled = $("api-enabled").checked;
  $("api-fields").classList.toggle("disabled", !enabled);
  for (const field of $("api-fields").querySelectorAll("input, button")) field.disabled = !enabled;
}

function collectSettings() {
  return {
    ...state.settings,
    includePrivate: $("include-private").checked,
    includeStarred: $("include-starred").checked,
    includeForks: $("include-forks").checked,
    includeArchived: $("include-archived").checked,
    apiEnabled: $("api-enabled").checked,
    apiEndpoint: $("api-endpoint").value.trim(),
    apiKey: $("api-key").value.trim(),
    apiModel: $("api-model").value.trim() || DEFAULT_SETTINGS.apiModel
  };
}

async function saveSettings() {
  const previousPrivate = state.settings.includePrivate;
  state.settings = collectSettings();
  if (state.settings.apiEnabled && !state.settings.apiEndpoint) {
    showNotice($("settings-notice"), "Add an OpenAI-compatible endpoint or turn off enhanced search.", "error");
    $("api-endpoint").focus();
    return;
  }

  if (state.settings.includePrivate && !previousPrivate && state.auth && !String(state.auth.scope).split(/[ ,]+/).includes("repo")) {
    showNotice($("settings-notice"), "Reconnect GitHub to grant private repository access.", "warning");
  } else {
    showNotice($("settings-notice"), "Settings saved.");
  }
  await storageSet({ [SETTINGS_KEY]: state.settings });
  updateModeUi();
}

function updateModeUi() {
  const configured = Boolean(state.settings.apiEnabled && state.settings.apiEndpoint);
  $("enhanced-toggle-wrap").hidden = !configured;
  if (!configured) $("enhanced-search").checked = false;
  $("search-mode-badge").textContent = $("enhanced-search").checked ? "ENHANCED" : "LOCAL";
  $("search-mode-badge").classList.toggle("enhanced", $("enhanced-search").checked);
  $("repo-count").textContent = `${state.repos.length} ${state.repos.length === 1 ? "repo" : "repos"}`;
}

function populateLanguages() {
  const select = $("language-filter");
  const current = select.value;
  const languages = [...new Set(state.repos.map((repo) => repo.language).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.replaceChildren(new Option("All languages", "all"), ...languages.map((language) => new Option(language, language)));
  select.value = languages.includes(current) ? current : "all";
}

function renderHomeState() {
  const hasRepos = state.repos.length > 0;
  $("welcome-copy").textContent = hasRepos
    ? `${state.repos.length} repositories are ready. Search above or sync to refresh your index.`
    : (state.auth ? "Your GitHub account is connected. Sync repositories to build the local index." : "Connect GitHub in settings, then sync your repositories.");
  $("btn-welcome-action").textContent = state.auth ? (hasRepos ? "Refresh index" : "Sync repositories") : "Connect GitHub";
}

function repoMatchesLanguage(repo) {
  const language = $("language-filter").value;
  return language === "all" || repo.language === language;
}

function showSearchPanel(panel) {
  $("loading-state").hidden = panel !== "loading";
  $("welcome-state").hidden = panel !== "welcome";
  $("empty-results").hidden = panel !== "empty";
  $("results-section").hidden = panel !== "results";
}

function renderResults(results, query) {
  const filtered = results.filter(repoMatchesLanguage);
  state.searchResults = filtered;
  $("repo-list").replaceChildren(...filtered.map(createRepoCard));
  $("result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`;
  if (filtered.length) showSearchPanel("results");
  else if (query) showSearchPanel("empty");
  else showSearchPanel("welcome");
}

function createRepoCard(repo) {
  const article = document.createElement("article");
  article.className = `repo-card${repo.archived ? " archived" : ""}`;

  const title = document.createElement("div");
  title.className = "repo-card-title";
  const link = document.createElement("a");
  link.href = repo.html_url || repo.url || `https://github.com/${repo.full_name || repo.name}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = escapeText(repo.full_name || repo.name || "Untitled repository");
  title.append(link);
  article.append(title);

  if (Number.isFinite(Number(repo.relevance_score))) {
    const score = document.createElement("span");
    score.className = "repo-score";
    score.textContent = `${Math.round(Number(repo.relevance_score))}%`;
    score.title = "Search relevance";
    article.append(score);
  }

  const description = document.createElement("p");
  description.className = "repo-card-description";
  description.textContent = escapeText(repo.description || "No description provided.");
  article.append(description);

  const meta = document.createElement("div");
  meta.className = "repo-meta";
  if (repo.language) {
    const language = document.createElement("span");
    language.className = "language";
    language.style.setProperty("--language-color", LANGUAGE_COLORS[repo.language] || "#8b949e");
    language.textContent = repo.language;
    meta.append(language);
  }
  const stars = document.createElement("span");
  stars.textContent = `★ ${Number(repo.stargazers_count || repo.stars || 0).toLocaleString()}`;
  meta.append(stars);
  const updated = document.createElement("span");
  updated.textContent = repo.updated_at ? `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(repo.updated_at))}` : "Update unknown";
  meta.append(updated);
  if (repo.private) {
    const badge = document.createElement("span");
    badge.textContent = "Private";
    meta.append(badge);
  }
  if (repo.fork) {
    const badge = document.createElement("span");
    badge.textContent = "Fork";
    meta.append(badge);
  }
  article.append(meta);

  const topics = (repo.topics || []).slice(0, 5);
  if (topics.length) {
    const list = document.createElement("div");
    list.className = "topic-list";
    for (const topic of topics) {
      const item = document.createElement("span");
      item.textContent = topic;
      list.append(item);
    }
    article.append(list);
  }
  return article;
}

async function runSearch() {
  const query = $("search-input").value.trim();
  $("btn-clear").hidden = !query;
  showNotice($("notice"), "");

  if (!query) {
    renderResults([], "");
    return;
  }
  if (!state.repos.length) {
    showNotice($("notice"), "Connect GitHub and sync repositories before searching.", "warning");
    showSearchPanel("welcome");
    return;
  }

  const sequence = ++state.searchSequence;
  showSearchPanel("loading");
  $("btn-search").disabled = true;
  try {
    const enhanced = $("enhanced-search").checked;
    const config = enhanced ? {
      endpoint: state.settings.apiEndpoint,
      apiKey: state.settings.apiKey,
      model: state.settings.apiModel
    } : null;
    const results = await AIService.searchRepositories(query, state.repos, config);
    if (sequence !== state.searchSequence) return;
    renderResults(Array.isArray(results) ? results : [], query);
    if (enhanced && AIService.lastSearchUsedFallback) {
      showNotice($("notice"), "The custom API was unavailable, so results use private local matching.", "warning");
    }
  } catch (error) {
    if (sequence !== state.searchSequence) return;
    showNotice($("notice"), error.message || "Search failed.", "error");
    showSearchPanel("empty");
  } finally {
    if (sequence === state.searchSequence) $("btn-search").disabled = false;
  }
}

function requiredOrigin(endpoint) {
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return `${url.origin}/*`;
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS endpoint.");
  }
}

async function ensureEndpointPermission(endpoint) {
  const origin = requiredOrigin(endpoint);
  if (!chrome?.permissions) return true;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

async function testApi() {
  const endpoint = $("api-endpoint").value.trim();
  const resultNode = $("api-test-result");
  resultNode.textContent = "";
  resultNode.className = "inline-status";
  try {
    if (!(await ensureEndpointPermission(endpoint))) throw new Error("Endpoint access was not granted.");
    setBusy($("btn-test-api"), true, "Testing…");
    const result = await AIService.testConnection(endpoint, $("api-key").value.trim(), $("api-model").value.trim());
    resultNode.textContent = result.message || (result.success ? "Connection works." : "Connection failed.");
    resultNode.classList.add(result.success ? "success" : "error");
  } catch (error) {
    resultNode.textContent = error.message || "Connection failed.";
    resultNode.classList.add("error");
  } finally {
    setBusy($("btn-test-api"), false);
  }
}

async function beginGitHubConnection() {
  if (!authClientConfigured()) {
    showNotice($("settings-notice"), "Add the public GitHub OAuth Client ID to config.js before connecting.", "error");
    return;
  }
  setBusy($("btn-connect-github"), true, "Starting…");
  showNotice($("settings-notice"), "");
  try {
    const scopes = state.settings.includePrivate ? ["read:user", "repo"] : ["read:user"];
    const session = await GitHubAuth.startDeviceFlow(scopes);
    state.deviceSession = session;
    $("device-code").textContent = session.userCode || session.user_code;
    $("verification-link").href = session.verificationUri || session.verification_uri || "https://github.com/login/device";
    $("device-expiry").textContent = `Code expires in about ${Math.max(1, Math.round((session.expiresIn || session.expires_in || 900) / 60))} minutes.`;
    renderAuth();
    window.open($("verification-link").href, "_blank", "noopener");
  } catch (error) {
    showNotice($("settings-notice"), error.message || "Could not start GitHub authorization.", "error");
  } finally {
    setBusy($("btn-connect-github"), false);
  }
}

async function finishGitHubConnection() {
  if (!state.deviceSession) return;
  setBusy($("btn-check-authorization"), true, "Checking…");
  try {
    const token = await GitHubAuth.pollForToken(state.deviceSession, { singleAttempt: true });
    if (!token) {
      showNotice($("settings-notice"), "GitHub is still waiting for approval. Complete the code step, then check again.", "warning");
      return;
    }
    const accessToken = token.accessToken || token.access_token;
    const user = token.user || await GitHubAuth.getUser(accessToken);
    state.auth = {
      accessToken,
      tokenType: token.tokenType || token.token_type || "bearer",
      scope: token.scope || "",
      user
    };
    await storageSet({ [AUTH_KEY]: state.auth });
    state.deviceSession = null;
    renderAuth();
    showNotice($("settings-notice"), `Connected as @${user.login}.`);
    await syncRepositories();
  } catch (error) {
    const pending = /pending|waiting|not yet/i.test(error.message || "");
    showNotice($("settings-notice"), pending ? "GitHub is still waiting for approval." : (error.message || "Authorization failed."), pending ? "warning" : "error");
  } finally {
    setBusy($("btn-check-authorization"), false);
  }
}

async function disconnectGitHub() {
  if (!confirm("Disconnect GitHub and remove the OAuth token from this device?")) return;
  await GitHubAuth.disconnect?.().catch(() => {});
  await storageRemove([AUTH_KEY]);
  state.auth = null;
  state.deviceSession = null;
  renderAuth();
  showNotice($("settings-notice"), "GitHub disconnected. Cached repositories remain until you clear them.");
}

async function syncRepositories() {
  if (!state.auth?.accessToken) {
    setView("settings");
    showNotice($("settings-notice"), "Connect GitHub before syncing.", "warning");
    return;
  }
  setBusy($("btn-sync"), true, "Syncing…");
  showNotice($("settings-notice"), "Syncing repositories…");
  try {
    const repos = await GitHubService.fetchAllRepositories(state.auth.accessToken, state.settings);
    state.repos = Array.isArray(repos) ? repos : [];
    await GitHubService.saveCache(state.repos);
    populateLanguages();
    updateModeUi();
    renderHomeState();
    renderAuth();
    showNotice($("settings-notice"), `Synced ${state.repos.length} repositories.`);
  } catch (error) {
    showNotice($("settings-notice"), error.message || "Repository sync failed.", "error");
  } finally {
    setBusy($("btn-sync"), false);
  }
}

async function clearCache() {
  if (!confirm("Remove cached repository metadata from this device?")) return;
  await GitHubService.clearCache();
  state.repos = [];
  state.searchResults = [];
  populateLanguages();
  updateModeUi();
  renderHomeState();
  renderResults([], "");
  showNotice($("settings-notice"), "Repository cache cleared.");
}

function bindEvents() {
  $("btn-settings").addEventListener("click", () => setView("settings"));
  $("btn-close-settings").addEventListener("click", () => setView("search"));
  $("btn-home").addEventListener("click", () => setView("search"));
  $("btn-theme").addEventListener("click", async () => {
    const current = document.documentElement.dataset.theme;
    state.settings.theme = current === "dark" ? "light" : "dark";
    applyTheme(state.settings.theme);
    await storageSet({ [SETTINGS_KEY]: state.settings });
  });
  $("btn-open-sidepanel").addEventListener("click", async () => {
    try {
      if (!chrome?.sidePanel) return;
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch (error) {
      showNotice($("notice"), error.message || "Could not open the side panel.", "error");
    }
  });
  $("search-form").addEventListener("submit", (event) => { event.preventDefault(); runSearch(); });
  $("search-input").addEventListener("input", () => { $("btn-clear").hidden = !$("search-input").value; });
  $("btn-clear").addEventListener("click", () => { $("search-input").value = ""; $("btn-clear").hidden = true; renderResults([], ""); $("search-input").focus(); });
  $("language-filter").addEventListener("change", () => renderResults(state.searchResults.length ? state.searchResults : state.repos, $("search-input").value.trim()));
  $("enhanced-search").addEventListener("change", updateModeUi);
  for (const button of document.querySelectorAll("[data-prompt]")) {
    button.addEventListener("click", () => { $("search-input").value = button.dataset.prompt; runSearch(); });
  }
  $("btn-welcome-action").addEventListener("click", () => state.auth ? syncRepositories() : setView("settings"));
  $("api-enabled").addEventListener("change", setApiFieldsEnabled);
  $("btn-toggle-key").addEventListener("click", () => {
    const hidden = $("api-key").type === "password";
    $("api-key").type = hidden ? "text" : "password";
    $("btn-toggle-key").textContent = hidden ? "Hide" : "Show";
    $("btn-toggle-key").setAttribute("aria-label", `${hidden ? "Hide" : "Show"} API key`);
  });
  $("btn-test-api").addEventListener("click", testApi);
  $("btn-save-settings").addEventListener("click", saveSettings);
  $("btn-connect-github").addEventListener("click", beginGitHubConnection);
  $("btn-check-authorization").addEventListener("click", finishGitHubConnection);
  $("btn-cancel-authorization").addEventListener("click", () => { GitHubAuth.cancel?.(); state.deviceSession = null; renderAuth(); });
  $("btn-copy-code").addEventListener("click", async () => { await navigator.clipboard.writeText($("device-code").textContent); $("btn-copy-code").textContent = "Copied"; setTimeout(() => { $("btn-copy-code").textContent = "Copy"; }, 1200); });
  $("btn-sync").addEventListener("click", syncRepositories);
  $("btn-disconnect").addEventListener("click", disconnectGitHub);
  $("btn-clear-cache").addEventListener("click", clearCache);
}

async function initialize() {
  try {
    await loadState();
    bindEvents();
    applyTheme();
    renderSettings();
    populateLanguages();
    updateModeUi();
    renderHomeState();
    renderResults([], "");
  } catch (error) {
    console.error("Initialization failed", error);
    showNotice($("notice"), error.message || "The extension could not start.", "error");
  }
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initialize);

if (typeof module !== "undefined") {
  module.exports = { DEFAULT_SETTINGS, normalizeAuth, requiredOrigin, formatDate, createRepoCard };
}
