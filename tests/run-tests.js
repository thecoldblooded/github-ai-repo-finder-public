"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}\n${error.stack}`); process.exitCode = 1; }
}

async function response(data, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", headers: { get: () => null }, json: async () => data };
}

(async () => {
  global.APP_CONFIG = { githubClientId: "Iv1.test-client" };
  const auth = require(path.join(root, "github-auth.js"));

  await test("device flow normalizes GitHub response", async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://github.com/login/device/code");
      assert.match(String(options.body), /scope=read%3Auser/);
      return response({ device_code: "device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    };
    const result = await auth.startDeviceFlow(["read:user"]);
    assert.equal(result.deviceCode, "device");
    assert.equal(result.userCode, "ABCD-EFGH");
    assert.ok(result.expiresAt > Date.now());
  });

  await test("pending authorization returns null for a single check", async () => {
    global.fetch = async () => response({ error: "authorization_pending" });
    const token = await auth.pollForToken({ deviceCode: "device", expiresAt: Date.now() + 60_000, interval: 5 }, { singleAttempt: true });
    assert.equal(token, null);
  });

  await test("slow_down increases poll interval", async () => {
    const session = { deviceCode: "device", expiresAt: Date.now() + 60_000, interval: 5 };
    global.fetch = async () => response({ error: "slow_down" });
    const token = await auth.pollForToken(session, { singleAttempt: true });
    assert.equal(token, null);
    assert.equal(session.interval, 10);
  });

  await test("authorized device returns a normalized token", async () => {
    global.fetch = async () => response({ access_token: "token", token_type: "bearer", scope: "read:user" });
    const token = await auth.pollForToken({ deviceCode: "device", expiresAt: Date.now() + 60_000, interval: 5 }, { singleAttempt: true });
    assert.deepEqual(token, { accessToken: "token", tokenType: "bearer", scope: "read:user" });
  });

  await test("user request uses OAuth bearer token", async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.github.com/user");
      assert.equal(options.headers.Authorization, "Bearer token");
      return response({ login: "octocat" });
    };
    assert.equal((await auth.getUser("token")).login, "octocat");
  });

  global.chrome = {
    storage: {
      local: {
        value: null,
        async set(value) { this.value = value; },
        async get() { return this.value || {}; },
        async remove() { this.value = null; }
      }
    }
  };
  global.fetch = async () => response([]);
  const github = require(path.join(root, "github-service.js"));
  await test("repository cache round trips", async () => {
    await github.saveCache([{ id: 1, name: "repo" }]);
    const cache = await github.getCache();
    assert.equal(cache.repos[0].name, "repo");
    assert.ok(cache.timestamp);
  });

  await test("repository sync paginates, filters, and deduplicates", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `repo-${index + 1}`,
      full_name: `owner/repo-${index + 1}`,
      private: index === 1,
      fork: index === 2,
      archived: index === 3,
      updated_at: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      owner: { login: "owner" }
    }));
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes("/user/repos") && url.includes("page=1")) return response(page);
      if (url.includes("/user/repos")) return response([]);
      if (url.includes("/user/starred") && url.includes("page=1")) return response([page[0], { ...page[0], id: 999, name: "star", full_name: "other/star" }]);
      return response([]);
    };
    const repos = await github.fetchAllRepositories("oauth-token", { includeStarred: true, includePrivate: false, includeForks: false, includeArchived: false });
    assert.equal(repos.length, 98);
    assert.equal(new Set(repos.map((repo) => repo.id)).size, repos.length);
    assert.equal(repos.some((repo) => repo.private || repo.fork || repo.archived), false);
    assert.ok(urls.some((url) => url.includes("page=2")));
    assert.ok(urls.some((url) => url.includes("visibility=public")));
    assert.equal(urls.some((url) => url.includes("type=")), false);
  });

  await test("GitHub authorization and rate-limit errors are actionable", async () => {
    global.fetch = async () => response({ message: "Bad credentials" }, false, 401);
    await assert.rejects(() => github.requestPage("/user/repos", "bad"), /authorization expired/i);
    global.fetch = async () => ({ ...(await response({}, false, 403)), headers: { get: (name) => name === "x-ratelimit-remaining" ? "0" : null } });
    await assert.rejects(() => github.requestPage("/user/repos", "limited"), /rate limit/i);
  });

  const ai = require(path.join(root, "ai-service.js"));
  await test("endpoint normalization supports base and v1 URLs", async () => {
    assert.equal(ai.normalizeEndpoint("https://example.com"), "https://example.com/v1/chat/completions");
    assert.equal(ai.normalizeEndpoint("https://example.com/v1"), "https://example.com/v1/chat/completions");
    assert.equal(ai.normalizeEndpoint("https://example.com/v1/chat/completions"), "https://example.com/v1/chat/completions");
  });

  await test("endpoint normalization rejects non-network protocols", async () => {
    assert.throws(() => ai.normalizeEndpoint("file:///secret"), /HTTP or HTTPS/);
  });

  await test("local search ranks matching repositories", async () => {
    const repos = [
      { id: 1, name: "react-dashboard", full_name: "me/react-dashboard", description: "TypeScript dashboard", language: "TypeScript", topics: ["react"], updated_at: "2026-01-01" },
      { id: 2, name: "python-scraper", full_name: "me/python-scraper", description: "web crawler", language: "Python", topics: [], updated_at: "2025-01-01" }
    ];
    const result = await ai.searchRepositories("React TypeScript dashboard", repos, null);
    assert.equal(result[0].id, 1);
  });

  await test("local search boosts recent repositories only when requested", async () => {
    const repos = [
      { id: 1, name: "tool", full_name: "me/tool", description: "utility", language: "Go", topics: [], updated_at: "2020-01-01T00:00:00Z" },
      { id: 2, name: "toolkit", full_name: "me/toolkit", description: "utility", language: "Go", topics: [], updated_at: new Date().toISOString() }
    ];
    assert.equal(ai.localSearch("recent go tool", repos)[0].id, 2);
  });

  await test("AI response parser accepts fenced JSON and rejects prose", async () => {
    assert.deepEqual(ai.parseResponseContent("```json\n{\"matches\":[]}\n```"), { matches: [] });
    assert.throws(() => ai.parseResponseContent("nothing useful"), /valid JSON/);
  });

  await test("language filtering preserves the unfiltered result set", async () => {
    const source = require("node:fs").readFileSync(path.join(root, "popup.js"), "utf8");
    assert.match(source, /state\.rawSearchResults = results;/);
    assert.match(source, /renderResults\(query \? state\.rawSearchResults : state\.repos, query\);/);
  });

  await test("private repository opt-in is saved before OAuth reconnect", async () => {
    const source = require("node:fs").readFileSync(path.join(root, "popup.js"), "utf8");
    assert.match(source, /needsPrivateReconnect \? "Settings saved\. Reconnect GitHub/);
    assert.doesNotMatch(source, /Reconnect GitHub to grant private repository access\.\", "warning"\);\s*return;/);
  });

  await test("custom endpoint sends only compact repository metadata", async () => {
    global.fetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      const bodyText = JSON.stringify(payload);
      assert.ok(bodyText.includes("repo-one"));
      assert.ok(!bodyText.includes("secret_field"));
      return response({ choices: [{ message: { content: JSON.stringify({ matches: [{ id: 1, score: 91, reason: "match" }], summary: "ok" }) } }] });
    };
    const repos = [{ id: 1, name: "repo-one", full_name: "me/repo-one", description: "desc", language: "JS", topics: [], secret_field: "do-not-send" }];
    const result = await ai.callAIEndpoint("repo", repos, "https://example.com/v1", "key", "model");
    assert.equal(result[0].id, 1);
  });

  if (!process.exitCode) console.log(`\n${passed} tests passed`);
})();
