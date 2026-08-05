# Privacy Policy for AI Repo Finder for GitHub

**Effective date:** August 5, 2026

AI Repo Finder for GitHub is an independent Chrome extension. It is not affiliated with or endorsed by GitHub or any AI provider.

## Data the extension handles

The extension handles only data needed to provide repository search:

- A GitHub OAuth access token and basic GitHub profile information.
- Repository metadata returned by GitHub, including names, descriptions, languages, topics, URLs, visibility, ownership, activity dates, and repository statistics.
- Extension preferences, including repository scope and theme.
- If the user enables enhanced search, the configured endpoint, model, API key, search query, and compact repository metadata described below.

The extension does not intentionally collect source code, file contents, passwords, browsing history, payment information, health information, or precise location.

## How data is used

GitHub data is used only to authenticate the user, synchronize the repositories the user selected, and provide repository search. Settings, credentials, profile information, and the repository cache are stored in Chrome extension storage on the user's device.

Local search runs entirely in the extension and does not send a query or repository metadata to an AI service.

Enhanced search is optional and off by default. When the user enables it and runs an enhanced search, the extension sends the query and compact repository metadata directly to the OpenAI-compatible endpoint selected by the user. Compact metadata contains repository ID, name, full name, description, language, topics, update timestamp, archived status, and fork status. If private repositories are enabled, metadata for those repositories may be included. The user's endpoint provider processes that data under its own terms and privacy policy.

## Sharing and sale

The developer operates no application backend, analytics service, advertising service, or data broker for this extension. Data is not sold. Data is not shared with third parties except:

- GitHub, when necessary to authorize the account and retrieve repository data.
- The user-selected OpenAI-compatible endpoint, only when the user enables and invokes enhanced search.

The extension does not use data for advertising, credit decisions, or unrelated profiling.

## Retention and deletion

Data remains in Chrome extension storage until the user clears the repository cache, disconnects GitHub, changes or removes settings, clears extension data in Chrome, or uninstalls the extension. Disconnecting GitHub removes the local OAuth token, cached GitHub profile, pending authorization session, and repository cache. It does not revoke the OAuth grant at GitHub. Users can revoke that grant from their GitHub application settings.

Removing or replacing an enhanced-search endpoint causes the extension to request removal of the no-longer-needed runtime host permission. API credentials remain in extension storage until the user clears or replaces them, clears extension data, or uninstalls the extension.

## Security

The extension uses HTTPS for GitHub and remote custom endpoints. Plain HTTP custom endpoints are allowed only for local development at `localhost` or `127.0.0.1`. The extension does not include remote executable code. A GitHub OAuth Client ID is public by design. No GitHub client secret is included.

## Limited Use

Data received from Google Chrome APIs is used only to provide and improve the extension's single purpose. Use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Changes

Material changes to this policy will be reflected by updating the effective date and the published policy before a version using those changes is distributed.

## Contact

Before publication, replace this paragraph with a monitored support email address or public support URL controlled by the developer.
