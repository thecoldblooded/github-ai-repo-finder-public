"use strict";

const AIService = {
  lastSearchUsedFallback: false,

  normalizeEndpoint(rawEndpoint) {
    if (!rawEndpoint) return "";
    const parsed = new URL(rawEndpoint.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("The API endpoint must use HTTP or HTTPS.");
    let path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") path = "/v1/chat/completions";
    else if (path.endsWith("/v1")) path += "/chat/completions";
    else if (!path.endsWith("/chat/completions")) path += "/v1/chat/completions";
    parsed.pathname = path.replace(/\/+/g, "/");
    parsed.hash = "";
    return parsed.toString();
  },

  headers(apiKey) {
    const headers = { "Content-Type": "application/json" };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    return headers;
  },

  async readError(response) {
    const data = await response.json().catch(() => ({}));
    return data?.error?.message || data?.message || `${response.status} ${response.statusText || "request failed"}`;
  },

  async testConnection(endpoint, apiKey, model) {
    if (!endpoint) return { success: false, message: "Enter an API endpoint." };
    try {
      const response = await fetch(this.normalizeEndpoint(endpoint), {
        method: "POST",
        headers: this.headers(apiKey),
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: [{ role: "user", content: "Reply with OK." }],
          temperature: 0,
          max_tokens: 8,
          stream: false
        })
      });
      if (!response.ok) return { success: false, message: `Connection failed: ${await this.readError(response)}` };
      const data = await response.json().catch(() => null);
      const msg = data?.choices?.[0]?.message;
      const content = msg?.content ?? msg?.reasoning_content;
      if (typeof content !== "string" && !msg) {
        return { success: false, message: "The endpoint did not return an OpenAI-compatible response." };
      }
      return { success: true, message: "Connection works." };
    } catch (error) {
      return { success: false, message: error.message || "Connection failed." };
    }
  },

  async searchRepositories(query, repos, config) {
    this.lastSearchUsedFallback = false;
    if (!query?.trim()) return [];
    if (!Array.isArray(repos)) return [];
    if (config?.endpoint) {
      try {
        return await this.callAIEndpoint(query, repos, config.endpoint, config.apiKey, config.model);
      } catch (error) {
        console.warn("Enhanced search failed; using local search:", error.message);
        this.lastSearchUsedFallback = true;
      }
    }
    return this.localSearch(query, repos);
  },

  compactRepository(repo) {
    return {
      id: repo.id,
      name: repo.name || "",
      full_name: repo.full_name || repo.name || "",
      description: repo.description || "",
      language: repo.language || "",
      topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 12) : [],
      updated_at: repo.updated_at || "",
      archived: Boolean(repo.archived),
      fork: Boolean(repo.fork)
    };
  },

  parseResponseContent(content) {
    if (typeof content !== "string") throw new Error("The API returned an empty message.");
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : content).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      const start = Math.min(...[candidate.indexOf("{"), candidate.indexOf("[")].filter((index) => index >= 0));
      const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
      if (!Number.isFinite(start) || end <= start) throw new Error("The API response was not valid JSON.");
      try { return JSON.parse(candidate.slice(start, end + 1)); }
      catch { throw new Error("The API response was not valid JSON."); }
    }
  },

  async callAIEndpoint(query, repos, endpoint, apiKey, model) {
    const compact = repos.slice(0, 1000).map((repo) => this.compactRepository(repo));
    const createBody = (includeResponseFormat) => {
      const body = {
        model: model || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Rank GitHub repositories for the user's request. Return strict JSON only: {\"matches\":[{\"id\":number|string,\"score\":0-100,\"reason\":string}]}. Include only useful matches, best first. Never invent IDs."
          },
          { role: "user", content: JSON.stringify({ query, repositories: compact }) }
        ],
        temperature: 0,
        stream: false
      };
      if (includeResponseFormat) {
        body.response_format = { type: "json_object" };
      }
      return JSON.stringify(body);
    };

    let response = await fetch(this.normalizeEndpoint(endpoint), {
      method: "POST",
      headers: this.headers(apiKey),
      body: createBody(true)
    });

    if (!response.ok && (response.status === 400 || response.status === 422)) {
      response = await fetch(this.normalizeEndpoint(endpoint), {
        method: "POST",
        headers: this.headers(apiKey),
        body: createBody(false)
      });
    }

    if (!response.ok) throw new Error(`Custom API error: ${await this.readError(response)}`);
    const payload = await response.json().catch(() => null);
    const messageObj = payload?.choices?.[0]?.message;
    const content = messageObj?.content ?? messageObj?.reasoning_content;
    const parsed = this.parseResponseContent(content);
    const matches = Array.isArray(parsed) ? parsed : parsed?.matches;
    if (!Array.isArray(matches)) throw new Error("The API response does not contain a matches array.");

    const byId = new Map(repos.map((repo) => [String(repo.id), repo]));
    const seen = new Set();
    return matches.flatMap((match) => {
      const key = String(match?.id ?? "");
      const repo = byId.get(key);
      if (!repo || seen.has(key)) return [];
      seen.add(key);
      const numeric = Number(match.score);
      return [{
        ...repo,
        relevance_score: Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 50,
        match_reason: typeof match.reason === "string" ? match.reason : ""
      }];
    });
  },

  tokenize(value) {
    return String(value || "")
      .toLocaleLowerCase("en-US")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9+#.-]+/)
      .filter((token) => token.length > 1);
  },

  localSearch(query, repos) {
    const phrase = this.tokenize(query).join(" ");
    const terms = [...new Set(this.tokenize(query))];
    if (!terms.length) return repos.slice();
    const asksRecent = terms.some((term) => ["recent", "recently", "latest", "updated", "new", "newest"].includes(term));
    const now = Date.now();

    return repos.map((repo) => {
      const name = this.tokenize(repo.name).join(" ");
      const fullName = this.tokenize(repo.full_name).join(" ");
      const description = this.tokenize(repo.description).join(" ");
      const language = this.tokenize(repo.language).join(" ");
      const topics = this.tokenize((repo.topics || []).join(" ")).join(" ");
      let score = 0;
      if (name === phrase || fullName === phrase) score += 100;
      else if (name.includes(phrase) || fullName.includes(phrase)) score += 55;

      for (const term of terms) {
        if (name.includes(term)) score += 30;
        if (fullName.includes(term)) score += 14;
        if (description.includes(term)) score += 15;
        if (language === term || language.includes(term)) score += 24;
        if (topics.includes(term)) score += 22;
      }
      const updated = Date.parse(repo.updated_at || 0);
      if (asksRecent && Number.isFinite(updated)) {
        const days = Math.max(0, (now - updated) / 86_400_000);
        score += Math.max(0, 24 - Math.log2(days + 1) * 3);
      }
      return { ...repo, _score: score };
    })
      .filter((repo) => repo._score > 0)
      .sort((a, b) => b._score - a._score || Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0) || String(a.full_name || a.name).localeCompare(String(b.full_name || b.name)))
      .map(({ _score, ...repo }) => ({ ...repo, relevance_score: Math.min(100, Math.round(_score)) }));
  }
};

globalThis.AIService = AIService;
if (typeof module !== "undefined") module.exports = AIService;
