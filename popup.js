/**
 * popup.js
 * Main UI Logic and Event Controller for GitHub AI Repo Finder Chrome Extension
 */

document.addEventListener("DOMContentLoaded", async () => {
  // --- DOM Elements ---
  const viewSearch = document.getElementById("view-search");
  const viewSettings = document.getElementById("view-settings");

  const btnToggleSettings = document.getElementById("btn-toggle-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const btnToggleTheme = document.getElementById("btn-toggle-theme");

  const aiStatusBadge = document.getElementById("ai-status-badge");
  const searchInput = document.getElementById("search-input");
  const btnClearSearch = document.getElementById("btn-clear-search");
  const btnAiSearch = document.getElementById("btn-ai-search");

  const chkAiMode = document.getElementById("chk-ai-mode");
  const chipAiMode = document.getElementById("chip-ai-mode");
  const repoCountIndicator = document.getElementById("repo-count-indicator");
  const langFilterSelect = document.getElementById("lang-filter-select");

  const aiInsightBanner = document.getElementById("ai-insight-banner");
  const aiInsightText = document.getElementById("ai-insight-text");

  const loadingState = document.getElementById("loading-state");
  const emptyState = document.getElementById("empty-state");
  const noResultsState = document.getElementById("no-results-state");
  const repoListContainer = document.getElementById("repo-list");

  // Settings DOM
  const inputGithubToken = document.getElementById("input-github-token");
  const chkIncludePrivate = document.getElementById("chk-include-private");
  const chkIncludeForks = document.getElementById("chk-include-forks");
  const chkIncludeStarred = document.getElementById("chk-include-starred");
  const btnToggleGithubToken = document.getElementById("btn-toggle-github-token");

  const inputAiEndpoint = document.getElementById("input-ai-endpoint");
  const inputAiKey = document.getElementById("input-ai-key");
  const inputAiModel = document.getElementById("input-ai-model");
  const btnToggleAiKey = document.getElementById("btn-toggle-ai-key");
  const btnTestAi = document.getElementById("btn-test-ai");

  const syncLastTime = document.getElementById("sync-last-time");
  const syncRepoTotal = document.getElementById("sync-repo-total");
  const btnSyncGithub = document.getElementById("btn-sync-github");
  const btnClearCache = document.getElementById("btn-clear-cache");
  const btnSaveSettings = document.getElementById("btn-save-settings");

  const toast = document.getElementById("toast");

  // --- State Variables ---
  let appSettings = {
    githubToken: "",
    includePrivate: true,
    includeForks: true,
    includeStarred: false,
    aiEndpoint: "",
    aiKey: "",
    aiModel: "gpt-3.5-turbo",
    theme: "dark"
  };

  let cachedRepos = [];
  let currentFilter = "all";
  let currentLang = "";

  // Language Colors Dictionary
  const langColors = {
    "JavaScript": "#f1e05a",
    "TypeScript": "#3178c6",
    "Python": "#3572A5",
    "HTML": "#e34c26",
    "CSS": "#563d7c",
    "Vue": "#41b883",
    "React": "#61dafb",
    "Go": "#00ADD8",
    "Rust": "#dea584",
    "C++": "#f34b7d",
    "C#": "#178600",
    "PHP": "#4F5D95",
    "Java": "#b07219",
    "Ruby": "#701516",
    "Swift": "#F05138",
    "Kotlin": "#A97BFF",
    "Dart": "#00B4AB",
    "Shell": "#89e051"
  };

  function applyTheme(theme) {
    appSettings.theme = theme || "dark";
    document.documentElement.setAttribute("data-theme", appSettings.theme);
    document.body.setAttribute("data-theme", appSettings.theme);

    const sunIcon = document.querySelector(".theme-icon-sun");
    const moonIcon = document.querySelector(".theme-icon-moon");
    if (sunIcon && moonIcon) {
      if (appSettings.theme === "light") {
        sunIcon.classList.remove("hidden");
        moonIcon.classList.add("hidden");
      } else {
        sunIcon.classList.add("hidden");
        moonIcon.classList.remove("hidden");
      }
    }
  }

  // --- Storage Helper Functions ---
  async function loadSettings() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(["gitai_settings"]);
      if (data.gitai_settings) {
        appSettings = { ...appSettings, ...data.gitai_settings };
      }
    } else {
      const raw = localStorage.getItem("gitai_settings");
      if (raw) {
        appSettings = { ...appSettings, ...JSON.parse(raw) };
      }
    }

    // Apply active theme
    applyTheme(appSettings.theme);

    // Populate Settings UI
    inputGithubToken.value = appSettings.githubToken || "";
    chkIncludePrivate.checked = appSettings.includePrivate;
    if (chkIncludeForks) chkIncludeForks.checked = appSettings.includeForks !== false;
    chkIncludeStarred.checked = appSettings.includeStarred;

    inputAiEndpoint.value = appSettings.aiEndpoint || "";
    inputAiKey.value = appSettings.aiKey || "";
    inputAiModel.value = appSettings.aiModel || "gpt-3.5-turbo";

    updateAiStatusBadge();
  }

  async function saveSettingsToStorage() {
    appSettings.githubToken = inputGithubToken.value.trim();
    appSettings.includePrivate = chkIncludePrivate.checked;
    if (chkIncludeForks) appSettings.includeForks = chkIncludeForks.checked;
    appSettings.includeStarred = chkIncludeStarred.checked;

    appSettings.aiEndpoint = inputAiEndpoint.value.trim();
    appSettings.aiKey = inputAiKey.value.trim();
    appSettings.aiModel = inputAiModel.value.trim() || "gpt-3.5-turbo";

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ gitai_settings: appSettings });
    } else {
      localStorage.setItem("gitai_settings", JSON.stringify(appSettings));
    }

    updateAiStatusBadge();
    showToast("Ayarlar başarıyla kaydedildi!", "success");
  }

  function updateAiStatusBadge() {
    if (appSettings.aiEndpoint && appSettings.aiEndpoint.trim()) {
      aiStatusBadge.className = "status-badge active";
      aiStatusBadge.querySelector(".text").textContent = "YZ Aktif";
    } else {
      aiStatusBadge.className = "status-badge inactive";
      aiStatusBadge.querySelector(".text").textContent = "Dahili Arama";
    }
  }

  // --- Load Repos Cache ---
  async function refreshCacheUI() {
    const cacheData = await GitHubService.getCache();
    if (cacheData && cacheData.repos) {
      cachedRepos = cacheData.repos;
      repoCountIndicator.textContent = `${cachedRepos.length} repo senkronize`;
      syncRepoTotal.textContent = `${cachedRepos.length} repo kayıtlı`;
      
      if (cacheData.lastSynced) {
        const d = new Date(cacheData.lastSynced);
        syncLastTime.textContent = `Son Senkronizasyon: ${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}`;
      }

      populateLanguageDropdown(cachedRepos);
    } else {
      cachedRepos = [];
      repoCountIndicator.textContent = "0 repo senkronize";
      syncRepoTotal.textContent = "0 repo kayıtlı";
      syncLastTime.textContent = "Son Senkronizasyon: Henüz yapılmadı";
    }
  }

  function populateLanguageDropdown(repos) {
    const langs = new Set();
    repos.forEach(r => {
      if (r.language && r.language !== "Bilinmiyor") {
        langs.add(r.language);
      }
    });

    langFilterSelect.innerHTML = '<option value="">Tüm Diller</option>';
    Array.from(langs).sort().forEach(lang => {
      const opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang;
      if (lang === currentLang) opt.selected = true;
      langFilterSelect.appendChild(opt);
    });
  }

  // --- Search Execution ---
  async function handleSearch() {
    const query = searchInput.value.trim();

    if (!query) {
      aiInsightBanner.classList.add("hidden");
      loadingState.classList.add("hidden");
      noResultsState.classList.add("hidden");
      repoListContainer.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    if (cachedRepos.length === 0) {
      showToast("Lütfen önce Ayarlar'dan GitHub repolarınızı senkronize edin!", "error");
      switchView("settings");
      return;
    }

    // Show loading UI
    emptyState.classList.add("hidden");
    noResultsState.classList.add("hidden");
    repoListContainer.innerHTML = "";
    loadingState.classList.remove("hidden");
    aiInsightBanner.classList.add("hidden");

    try {
      let results;

      if (chkAiMode.checked) {
        results = await AIService.searchRepositories(query, cachedRepos, {
          endpoint: appSettings.aiEndpoint,
          apiKey: appSettings.aiKey,
          model: appSettings.aiModel
        });
      } else {
        results = AIService.smartFallbackSearch(query, cachedRepos);
      }

      loadingState.classList.add("hidden");

      if (results.reasoning) {
        aiInsightText.textContent = results.reasoning;
        aiInsightBanner.classList.remove("hidden");
      }

      renderRepoResults(results.matchedRepos);

    } catch (err) {
      console.error("Search error:", err);
      loadingState.classList.add("hidden");
      showToast("Arama yapılırken hata oluştu: " + err.message, "error");
    }
  }

  // --- Render Repo Cards ---
  function renderRepoResults(reposList) {
    // Apply UI Category Filter & Language Filter
    let filtered = reposList.filter(repo => {
      if (currentFilter === "public" && repo.isPrivate) return false;
      if (currentFilter === "private" && !repo.isPrivate) return false;
      if (currentFilter === "starred" && !repo.isStarred) return false;
      if (currentFilter === "original" && repo.isFork) return false;
      if (currentFilter === "forks" && !repo.isFork) return false;
      if (currentLang && repo.language !== currentLang) return false;
      if (appSettings.includeForks === false && repo.isFork && currentFilter !== "forks") return false;
      return true;
    });

    if (filtered.length === 0) {
      noResultsState.classList.remove("hidden");
      repoListContainer.innerHTML = "";
      return;
    }

    noResultsState.classList.add("hidden");
    repoListContainer.innerHTML = "";

    filtered.forEach(repo => {
      const card = document.createElement("div");
      card.className = "repo-card";

      const langColor = langColors[repo.language] || "#8b949e";
      const timeAgo = formatTimeAgo(repo.updatedAt);

      const privacyBadge = repo.isPrivate 
        ? `<span class="privacy-badge private">🔒 Private</span>`
        : `<span class="privacy-badge public">🌐 Public</span>`;

      const forkBadge = repo.isFork
        ? `<span class="privacy-badge fork">🍴 Fork</span>`
        : "";

      const relevanceTag = repo.aiScore 
        ? `<span class="relevance-badge">%${repo.aiScore} Eşleşti</span>`
        : "";

      const topicsHtml = (repo.topics || []).slice(0, 4).map(t => `<span class="topic-tag">#${t}</span>`).join("");
      const displayName = repo.fullName || repo.name;

      card.innerHTML = `
        <div class="repo-card-header">
          <a href="${repo.htmlUrl}" target="_blank" class="repo-name-link" title="${escapeHtml(displayName)} (GitHub'da aç)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${escapeHtml(displayName)}</span>
          </a>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            ${relevanceTag}
            ${forkBadge}
            ${privacyBadge}
          </div>
        </div>

        ${(repo.trDescription || repo.description) ? `<p class="repo-desc" title="Orijinal: ${escapeHtml(repo.description)}">${escapeHtml(repo.trDescription || repo.description)}</p>` : ""}

        ${topicsHtml ? `<div class="repo-topics">${topicsHtml}</div>` : ""}

        ${repo.aiReason ? `<div style="font-size:11px; color:#a5b4fc; background:rgba(99,102,241,0.08); padding:3px 6px; border-radius:4px;">💡 ${escapeHtml(repo.aiReason)}</div>` : ""}

        <div class="repo-meta">
          <div class="meta-left">
            <span>
              <span class="lang-dot" style="background-color: ${langColor}"></span>
              ${repo.language}
            </span>
            ${repo.stargazersCount > 0 ? `<span>⭐ ${repo.stargazersCount}</span>` : ""}
            <span>🕒 ${timeAgo}</span>
          </div>

          <div class="actions-right">
            <button class="btn-icon-action btn-copy-url" data-url="${repo.htmlUrl}" title="GitHub Linkini Kopyala">
              📋 Link
            </button>
            <button class="btn-icon-action btn-copy-clone" data-clone="${repo.cloneUrl}" title="Git Clone Komutunu Kopyala">
              ⚡ Clone
            </button>
          </div>
        </div>
      `;

      repoListContainer.appendChild(card);
    });

    // Attach card action listeners
    repoListContainer.querySelectorAll(".btn-copy-url").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.url);
        showToast("GitHub URL kopyalandı!", "success");
      });
    });

    repoListContainer.querySelectorAll(".btn-copy-clone").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`git clone ${btn.dataset.clone}`);
        showToast("Git clone komutu kopyalandı!", "success");
      });
    });
  }

  // --- View Switcher ---
  function switchView(target) {
    if (target === "settings") {
      viewSearch.classList.remove("active");
      viewSettings.classList.add("active");
    } else {
      viewSettings.classList.remove("active");
      viewSearch.classList.add("active");
    }
  }

  // --- Event Listeners ---
  btnToggleSettings.addEventListener("click", () => switchView("settings"));
  btnCloseSettings.addEventListener("click", () => switchView("search"));

  const btnOpenSidepanel = document.getElementById("btn-open-sidepanel");
  if (btnOpenSidepanel) {
    btnOpenSidepanel.addEventListener("click", async () => {
      if (typeof chrome !== "undefined" && chrome.sidePanel && chrome.sidePanel.open) {
        try {
          const window = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: window.id });
          window.close();
        } catch (e) {
          console.error("Side panel open error:", e);
          showToast("Yan paneli açmak için Chrome simgesine sağ tıklayıp 'Yan paneli aç' diyebilirsiniz.", "info");
        }
      } else {
        showToast("Yan panel özelliği Chrome V114+ tarafından desteklenmektedir.", "info");
      }
    });
  }

  btnToggleTheme.addEventListener("click", async () => {
    const nextTheme = appSettings.theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    await saveSettingsToStorage();
    showToast(`Tema ${nextTheme === "light" ? "Açık (Light)" : "Koyu (Dark)"} moduna geçildi`, "success");
  });

  // Clear Search button
  searchInput.addEventListener("input", () => {
    if (searchInput.value.trim()) {
      btnClearSearch.classList.remove("hidden");
    } else {
      btnClearSearch.classList.add("hidden");
      handleSearch();
    }
  });

  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    btnClearSearch.classList.add("hidden");
    handleSearch();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  });

  btnAiSearch.addEventListener("click", handleSearch);

  // Example Prompt badges
  document.querySelectorAll(".prompt-badge").forEach(badge => {
    badge.addEventListener("click", () => {
      searchInput.value = badge.dataset.prompt;
      btnClearSearch.classList.remove("hidden");
      handleSearch();
    });
  });

  // Filter chips
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      handleSearch();
    });
  });

  langFilterSelect.addEventListener("change", (e) => {
    currentLang = e.target.value;
    handleSearch();
  });

  // Toggle AI Chip
  chipAiMode.addEventListener("click", () => {
    chkAiMode.checked = !chkAiMode.checked;
    chipAiMode.classList.toggle("active", chkAiMode.checked);
    handleSearch();
  });

  // Password Toggles
  btnToggleGithubToken.addEventListener("click", () => {
    inputGithubToken.type = inputGithubToken.type === "password" ? "text" : "password";
  });
  btnToggleAiKey.addEventListener("click", () => {
    inputAiKey.type = inputAiKey.type === "password" ? "text" : "password";
  });

  // Test AI Connection
  btnTestAi.addEventListener("click", async () => {
    const endpoint = inputAiEndpoint.value.trim();
    const apiKey = inputAiKey.value.trim();
    const model = inputAiModel.value.trim();

    if (!endpoint) {
      showToast("Lütfen önce Endpoint URL girin!", "error");
      return;
    }

    btnTestAi.textContent = "Bağlanıyor...";
    btnTestAi.disabled = true;

    const res = await AIService.testConnection(endpoint, apiKey, model);
    btnTestAi.textContent = "⚡ YZ Bağlantısını Test Et";
    btnTestAi.disabled = false;

    if (res.success) {
      showToast(res.message, "success");
    } else {
      showToast(res.message, "error");
    }
  });

  // Sync Repos Now
  btnSyncGithub.addEventListener("click", async () => {
    const token = inputGithubToken.value.trim();
    if (!token) {
      showToast("Lütfen geçerli bir GitHub PAT girin!", "error");
      return;
    }

    btnSyncGithub.textContent = "Senkronize Ediliyor...";
    btnSyncGithub.disabled = true;

    try {
      const repos = await GitHubService.fetchAllRepositories(token, {
        includePrivate: chkIncludePrivate.checked,
        includeStarred: chkIncludeStarred.checked
      });

      await refreshCacheUI();
      showToast(`${repos.length} repo başarıyla çekildi ve saklandı!`, "success");
    } catch (err) {
      console.error("Sync error:", err);
      showToast("GitHub Senkronizasyon hatası: " + err.message, "error");
    } finally {
      btnSyncGithub.textContent = "🔄 Repoları Şimdi Senkronize Et";
      btnSyncGithub.disabled = false;
    }
  });

  // Clear Cache
  btnClearCache.addEventListener("click", async () => {
    await GitHubService.clearCache();
    await refreshCacheUI();
    showToast("Önbellek temizlendi.", "success");
  });

  // Save Settings Button
  btnSaveSettings.addEventListener("click", async () => {
    await saveSettingsToStorage();
    switchView("search");
  });

  // --- Utility Functions ---
  function showToast(message, type = "info") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = "toast hidden";
    }, 3500);
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 3600) return "az önce";
    const hours = Math.floor(seconds / 3600);
    if (hours < 24) return `${hours}sa önce`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}gün önce`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}ay önce`;
    return `${Math.floor(months / 12)}yıl önce`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // --- Initialize ---
  let isSidePanel = false;
  try {
    if (typeof chrome !== "undefined" && chrome.extension && chrome.extension.getViews) {
      const popups = chrome.extension.getViews({ type: "popup" });
      isSidePanel = !popups.includes(window);
    } else {
      isSidePanel = window.location.search.includes('sidepanel');
    }
  } catch (e) {
    isSidePanel = window.location.search.includes('sidepanel');
  }

  if (isSidePanel) {
    document.body.classList.add("is-sidepanel");
  } else {
    document.body.classList.add("is-popup");
  }

  const versionTag = document.getElementById("version-tag");
  if (versionTag && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
    try {
      const manifest = chrome.runtime.getManifest();
      versionTag.textContent = `v${manifest.version}`;
    } catch (e) {
      console.warn("Could not read manifest version:", e);
    }
  }

  await loadSettings();
  await refreshCacheUI();

  // If no repos cached yet, open settings automatically to guide user
  if (cachedRepos.length === 0) {
    switchView("settings");
  }
});
