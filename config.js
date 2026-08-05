"use strict";

// Create a GitHub OAuth App, enable Device Flow, then replace this public Client ID.
// A Client ID identifies the app and is safe to ship. Never add a Client Secret here.
globalThis.APP_CONFIG = Object.freeze({
  githubClientId: "YOUR_GITHUB_CLIENT_ID"
});
