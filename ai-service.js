/**
 * ai-service.js
 * Handles Natural Language AI Search using custom OpenAI-compatible endpoints or Gemini API,
 * with a smart built-in fallback fuzzy/keyword matcher.
 */

const AIService = {
  /**
   * Automatically normalizes base URLs (e.g. "http://localhost:20128/v1") to full endpoint "/v1/chat/completions"
   */
  normalizeEndpoint(rawEndpoint) {
    if (!rawEndpoint) return "";
    let url = rawEndpoint.trim();
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    if (url.endsWith("/v1")) {
      return `${url}/chat/completions`;
    }
    if (!url.includes("/chat/completions") && !url.includes("/completions") && !url.includes("/generate")) {
      return `${url}/v1/chat/completions`;
    }
    return url;
  },

  /**
   * Test custom AI API Connection
   * @param {string} endpoint 
   * @param {string} apiKey 
   * @param {string} model 
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection(endpoint, apiKey, model) {
    if (!endpoint) {
      return { success: false, message: "API Endpoint URL girilmedi." };
    }

    const targetUrl = this.normalizeEndpoint(endpoint);
    const headers = { "Content-Type": "application/json" };
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          model: model || "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "Test ping" },
            { role: "user", content: "Hello" }
          ],
          max_tokens: 5
        })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return { 
          success: false, 
          message: `YZ Endpoint Hatası (${response.status}): ${errText.substring(0, 100) || response.statusText}` 
        };
      }

      return { success: true, message: "YZ Sunucu Bağlantısı Başarılı!" };
    } catch (err) {
      console.error("AI connection test failed:", err);
      return { success: false, message: `Bağlantı hatası: ${err.message}` };
    }
  },

  /**
   * Perform Natural Language Search over repositories list
   * @param {string} query User query (e.g. "React ile yazdığım scraper projesi")
   * @param {Array} repos List of cached repos
   * @param {object} aiConfig { endpoint, apiKey, model }
   * @returns {Promise<{reasoning: string, matchedRepos: Array}>}
   */
  async searchRepositories(query, repos, aiConfig) {
    if (!repos || repos.length === 0) {
      return { reasoning: "Arama yapılacak kayıtlı repo bulunamadı.", matchedRepos: [] };
    }

    const { endpoint, apiKey, model } = aiConfig || {};

    // If endpoint is provided and active, try AI API call
    if (endpoint && endpoint.trim()) {
      try {
        return await this.callAIEndpoint(query, repos, endpoint.trim(), apiKey ? apiKey.trim() : "", model ? model.trim() : "");
      } catch (err) {
        console.warn("AI Search call failed, falling back to smart client matcher:", err);
      }
    }

    // Fallback: Smart Client-Side Keyword & Multi-field Matcher
    return this.smartFallbackSearch(query, repos);
  },

  /**
   * Select top candidate repos across the ENTIRE dataset (723+ repos) for AI analysis
   */
  selectBestCandidates(query, repos, maxCount = 250) {
    if (!repos || repos.length <= maxCount) {
      return repos;
    }

    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(t => t.length > 1);

    const scored = repos.map(repo => {
      let score = 0;
      const nameLower = repo.name.toLowerCase();
      const descLower = (repo.description || "").toLowerCase();
      const langLower = (repo.language || "").toLowerCase();
      const topicsStr = (repo.topics || []).join(" ").toLowerCase();

      if (nameLower.includes(q)) score += 50;
      if (descLower.includes(q)) score += 30;

      tokens.forEach(token => {
        if (nameLower.includes(token)) score += 20;
        if (descLower.includes(token)) score += 15;
        if (langLower.includes(token)) score += 20;
        if (topicsStr.includes(token)) score += 20;
      });

      if (repo.updatedAt) {
        const daysAgo = (new Date() - new Date(repo.updatedAt)) / (1000 * 3600 * 24);
        if (daysAgo < 60) score += 5;
      }

      return { repo, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxCount).map(item => item.repo);
  },

  /**
   * Call Custom OpenAI-compatible REST API Endpoint
   */
  async callAIEndpoint(query, repos, endpoint, apiKey, model) {
    // Select top 250 candidates across ALL repos (e.g. 723+ repos) instead of slicing arbitrary first 100
    const candidateRepos = this.selectBestCandidates(query, repos, 250);

    const compactRepos = candidateRepos.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      language: r.language,
      topics: r.topics,
      stars: r.stargazersCount,
      updatedAt: r.updatedAt
    }));

    const systemPrompt = `You are a GitHub Repository Search AI Assistant.
The user will ask for a repository in natural language (Turkish or English).
Analyze the provided repositories JSON and find the best matching repositories.

IMPORTANT:
1. For each matching repository, you MUST translate its original description into fluent, clear Turkish in the "trDescription" field.
2. Return ALL relevant matching repositories (up to 30 matches), ordered by relevance score (0-100). Do not artificially restrict to only 2 or 3 results if more fit!

Output format MUST be valid JSON strictly matching this structure:
{
  "reasoning": "Short summary in Turkish explaining why these repos were picked.",
  "matches": [
    {
      "id": 123456,
      "score": 95,
      "reason": "Short reason in Turkish why this repo fits the query.",
      "trDescription": "Fluent Turkish translation of the repo description."
    }
  ]
}
If no repos match, return empty matches array.`;

    const userPrompt = `Sorgu: "${query}"

Repolar:
${JSON.stringify(compactRepos, null, 2)}`;

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const payload = {
      model: model || "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2
    };

    const targetUrl = this.normalizeEndpoint(endpoint);
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AI HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";

    // Extract JSON from content
    let parsedJson = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedJson = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI JSON response:", content);
    }

    if (!parsedJson || !Array.isArray(parsedJson.matches)) {
      return this.smartFallbackSearch(query, repos);
    }

    // Map AI match results back to full repo objects
    const repoMap = new Map(repos.map(r => [r.id, r]));
    const matchedRepos = [];

    parsedJson.matches.forEach(m => {
      const repo = repoMap.get(m.id);
      if (repo) {
        matchedRepos.push({
          ...repo,
          aiScore: m.score || 80,
          aiReason: m.reason || "",
          trDescription: m.trDescription || ""
        });
      }
    });

    return {
      reasoning: parsedJson.reasoning || `"${query}" sorgunuza en uygun ${matchedRepos.length} repo listelendi.`,
      matchedRepos: matchedRepos
    };
  },

  /**
   * Smart client-side fallback matcher using multi-field scoring & recency weights
   */
  smartFallbackSearch(query, repos) {
    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(t => t.length > 1);

    if (tokens.length === 0) {
      return { reasoning: "Tüm kayıtlı depolar gösteriliyor.", matchedRepos: repos };
    }

    const scored = repos.map(repo => {
      let score = 0;
      const reasons = [];

      const nameLower = repo.name.toLowerCase();
      const descLower = repo.description.toLowerCase();
      const langLower = repo.language.toLowerCase();
      const topicsStr = (repo.topics || []).join(" ").toLowerCase();

      // Exact name match
      if (nameLower === q) {
        score += 100;
        reasons.push("Repo adı birebir eşleşti");
      } else if (nameLower.includes(q)) {
        score += 60;
        reasons.push("Repo adı aranan ifadeyi içeriyor");
      }

      // Token matching
      tokens.forEach(token => {
        if (nameLower.includes(token)) {
          score += 25;
        }
        if (descLower.includes(token)) {
          score += 15;
        }
        if (langLower === token) {
          score += 30;
          reasons.push(`Programlama dili (${repo.language}) eşleşti`);
        }
        if (topicsStr.includes(token)) {
          score += 20;
          reasons.push(`Konu etiketi (${token}) eşleşti`);
        }
      });

      // Special keywords like "güncel", "son", "yeni"
      if (q.includes("son") || q.includes("güncel") || q.includes("yeni") || q.includes("recent")) {
        const updateDate = new Date(repo.updatedAt);
        const daysDiff = (new Date() - updateDate) / (1000 * 3600 * 24);
        if (daysDiff < 30) {
          score += 35;
          reasons.push("Son 1 ay içinde güncellendi");
        }
      }

      // Star count weight
      if (repo.stargazersCount > 0) {
        score += Math.min(repo.stargazersCount, 15);
      }

      return {
        ...repo,
        aiScore: Math.min(score, 100),
        aiReason: reasons.length > 0 ? reasons.slice(0, 2).join(", ") : "İçerik ve etiket benzerliği"
      };
    });

    const filtered = scored.filter(r => r.aiScore > 0).sort((a, b) => b.aiScore - a.aiScore);

    return {
      reasoning: `Dahili Akıllı Arama: "${query}" için ${filtered.length} sonuç bulundu.`,
      matchedRepos: filtered
    };
  }
};
