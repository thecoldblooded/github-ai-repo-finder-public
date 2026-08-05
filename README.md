# AI Repo Finder for GitHub

A free, self-contained Chrome extension for finding repositories in your GitHub account. Search stays local by default. You can optionally use an OpenAI-compatible endpoint that you control for enhanced ranking.

This project is independent and is not affiliated with or endorsed by GitHub or any AI provider.

## Features

- GitHub OAuth Device Flow. Users never paste a personal access token.
- Public repositories, with opt-in private, starred, fork, and archived repository scopes.
- Deterministic local search with language, visibility, ownership, and sort controls.
- Optional OpenAI-compatible enhanced search with runtime host permission.
- Local cache, light/dark/system themes, popup, and side panel.
- No backend, accounts, subscriptions, payments, analytics, remote code, or built-in AI provider.

## Configure GitHub OAuth

A public GitHub OAuth Client ID is required before distribution.

1. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Choose any valid homepage and callback URL. Device Flow does not use the callback during sign-in.
3. Enable **Device Flow** for the OAuth App.
4. Copy the public Client ID into `config.js`:

```js
globalThis.APP_CONFIG = Object.freeze({
  githubClientId: "Ov23li..."
});
```

Never add a client secret. The extension requests `read:user` by default and adds `repo` only when the user opts into private repositories.

## Run locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this directory.
4. Open the extension, go to Settings, and connect GitHub.

## Enhanced search

Enhanced search is off by default. Users provide an endpoint, optional API key, and model. Remote endpoints must use HTTPS. Plain HTTP is accepted only on `localhost` or `127.0.0.1`.

When enhanced search is used, the extension sends the search query and compact repository metadata directly to the configured endpoint. Compact metadata includes repository ID, name, full name, description, language, topics, update timestamp, archived status, and fork status. The endpoint is expected to implement the OpenAI Chat Completions response shape. If it fails, the extension falls back to local search.

## Test

```sh
node tests/run-tests.js
```

The test suite covers Device Flow handling, GitHub pagination and filtering, cache behavior, endpoint normalization, local ranking, AI response parsing, and metadata minimization.

## Package

Set a real GitHub OAuth Client ID first, then run:

```sh
./scripts/package.sh
```

The script validates JavaScript, runs tests, rejects placeholder configuration and disallowed files, and creates `dist/ai-repo-finder-for-github-<version>.zip`.

## Privacy

See [PRIVACY.md](PRIVACY.md). Data is stored in Chrome extension storage on the user's device. The project operates no application server and includes no analytics or advertising.

## License

See [LICENSE](LICENSE).
