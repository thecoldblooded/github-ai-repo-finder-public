"use strict";

const GitHubAuth = {
  deviceAuthorizationUrl: "https://github.com/login/device/code",
  tokenUrl: "https://github.com/login/oauth/access_token",
  userUrl: "https://api.github.com/user",
  cancelled: false,

  getClientId() {
    const clientId = globalThis.APP_CONFIG?.githubClientId?.trim();
    if (!clientId || clientId === "YOUR_GITHUB_CLIENT_ID") {
      throw new Error("GitHub OAuth is not configured. Add the public Client ID to config.js.");
    }
    return clientId;
  },

  async requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error_description || data.message || `GitHub request failed (${response.status}).`);
    }
    return data;
  },

  async startDeviceFlow(scopes = ["read:user"]) {
    this.cancelled = false;
    const clientId = this.getClientId();
    const scope = [...new Set(scopes.filter(Boolean))].join(" ");
    const data = await this.requestJson(this.deviceAuthorizationUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ client_id: clientId, scope })
    });
    if (!data.device_code || !data.user_code) throw new Error("GitHub returned an incomplete device authorization response.");
    const createdAt = Date.now();
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri || "https://github.com/login/device",
      expiresIn: Number(data.expires_in) || 900,
      interval: Math.max(5, Number(data.interval) || 5),
      createdAt,
      expiresAt: createdAt + (Number(data.expires_in) || 900) * 1000,
      scope
    };
  },

  async requestToken(session) {
    if (this.cancelled) throw new Error("GitHub authorization was cancelled.");
    if (!session?.deviceCode) throw new Error("Missing GitHub device authorization session.");
    if (Date.now() >= session.expiresAt) throw new Error("The GitHub authorization code expired. Start again.");

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        device_code: session.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || `GitHub token request failed (${response.status}).`);

    if (data.error === "authorization_pending") return { pending: true };
    if (data.error === "slow_down") {
      session.interval = Math.max(5, Number(session.interval) || 5) + 5;
      return { pending: true, slowDown: true };
    }
    if (data.error === "expired_token") throw new Error("The GitHub authorization code expired. Start again.");
    if (data.error === "access_denied") throw new Error("GitHub authorization was denied.");
    if (data.error) throw new Error(data.error_description || `GitHub authorization failed: ${data.error}.`);
    if (!data.access_token) throw new Error("GitHub did not return an access token.");

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || "bearer",
      scope: data.scope || session.scope || ""
    };
  },

  async pollForToken(session, options = {}) {
    const first = await this.requestToken(session);
    if (!first.pending) return first;
    if (options.singleAttempt) return null;

    while (!this.cancelled && Date.now() < session.expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(5, session.interval) * 1000));
      const token = await this.requestToken(session);
      if (!token.pending) return token;
    }
    if (this.cancelled) throw new Error("GitHub authorization was cancelled.");
    throw new Error("The GitHub authorization code expired. Start again.");
  },

  async getUser(accessToken) {
    if (!accessToken) throw new Error("Missing GitHub access token.");
    return this.requestJson(this.userUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
  },

  cancel() {
    this.cancelled = true;
  },

  async disconnect() {
    this.cancel();
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.remove(["repo_finder_auth", "githubToken"]);
    }
  }
};

globalThis.GitHubAuth = GitHubAuth;
if (typeof module !== "undefined") module.exports = GitHubAuth;
