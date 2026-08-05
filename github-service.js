"use strict";

const GitHubService = {
  apiBase: "https://api.github.com",
  cacheKey: "github_repo_cache",

  headers(token) {
    return {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  },

  async requestPage(path, token) {
    const response = await fetch(`${this.apiBase}${path}`, { headers: this.headers(token) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("GitHub authorization expired. Disconnect and connect again.");
      if (response.status === 403 && response.headers?.get?.("x-ratelimit-remaining") === "0") throw new Error("GitHub API rate limit reached. Try again later.");
      throw new Error(data.message || `GitHub request failed (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected repository response.");
    return data;
  },

  async fetchPaginated(path, token, maxPages = 50) {
    const output = [];
    for (let page = 1; page <= maxPages; page++) {
      const separator = path.includes("?") ? "&" : "?";
      const batch = await this.requestPage(`${path}${separator}per_page=100&page=${page}`, token);
      output.push(...batch);
      if (batch.length < 100) break;
    }
    return output;
  },

  normalizeRepository(repo) {
    return {
      id: repo.id,
      name: repo.name || "",
      full_name: repo.full_name || repo.name || "",
      description: repo.description || "",
      html_url: repo.html_url || "",
      language: repo.language || "",
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      stargazers_count: Number(repo.stargazers_count) || 0,
      forks_count: Number(repo.forks_count) || 0,
      updated_at: repo.updated_at || repo.pushed_at || "",
      pushed_at: repo.pushed_at || "",
      private: Boolean(repo.private),
      fork: Boolean(repo.fork),
      archived: Boolean(repo.archived),
      disabled: Boolean(repo.disabled),
      homepage: repo.homepage || "",
      owner: repo.owner?.login || ""
    };
  },

  async fetchAllRepositories(token, settings = {}) {
    if (!token) throw new Error("Connect GitHub before syncing repositories.");
    const owned = await this.fetchPaginated(`/user/repos?sort=updated&direction=desc&visibility=${settings.includePrivate ? "all" : "public"}`, token);
    let combined = owned;
    if (settings.includeStarred) {
      const starred = await this.fetchPaginated("/user/starred?sort=updated&direction=desc", token);
      combined = combined.concat(starred);
    }

    const unique = new Map();
    for (const raw of combined) {
      const repo = this.normalizeRepository(raw);
      if (!settings.includePrivate && repo.private) continue;
      if (settings.includeForks === false && repo.fork) continue;
      if (!settings.includeArchived && (repo.archived || repo.disabled)) continue;
      unique.set(String(repo.id || repo.full_name), repo);
    }
    const repos = [...unique.values()].sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0) || a.full_name.localeCompare(b.full_name));
    await this.saveCache(repos);
    return repos;
  },

  async saveCache(repos) {
    const cache = { repos: Array.isArray(repos) ? repos : [], timestamp: new Date().toISOString() };
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [this.cacheKey]: cache });
    else globalThis.localStorage?.setItem(this.cacheKey, JSON.stringify(cache));
    return cache;
  },

  async getCache() {
    if (globalThis.chrome?.storage?.local) {
      const value = await chrome.storage.local.get([this.cacheKey]);
      return value[this.cacheKey] || null;
    }
    const raw = globalThis.localStorage?.getItem(this.cacheKey);
    return raw ? JSON.parse(raw) : null;
  },

  async clearCache() {
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove([this.cacheKey]);
    else globalThis.localStorage?.removeItem(this.cacheKey);
  }
};

globalThis.GitHubService = GitHubService;
if (typeof module !== "undefined") module.exports = GitHubService;
