# Chrome Web Store Listing

## English

### Name
AI Repo Finder for GitHub

### Summary
Search your GitHub repositories locally or with an OpenAI-compatible API you choose.

### Detailed description
Find the right repository without scanning long GitHub lists.

AI Repo Finder for GitHub creates a searchable local index of repositories available to your connected GitHub account. Natural-language and keyword search works locally by default, with filters for language, visibility, ownership, and activity.

FEATURES
• Connect with GitHub's OAuth Device Flow. No personal access token to paste.
• Search locally with no AI account or paid service required.
• Optionally rank results with an OpenAI-compatible endpoint you provide.
• Include private, starred, forked, or archived repositories only when you choose.
• Sort by relevance, recent activity, name, or stars.
• Use the extension popup or Chrome side panel.
• Choose light, dark, or system theme.

PRIVACY
Local search does not send repository data to an AI service. Settings, credentials, and cached metadata stay in Chrome extension storage on your device. Enhanced search is off by default. When enabled and invoked, the query and compact repository metadata go directly to the endpoint you configure. The extension has no developer-operated backend, analytics, advertising, account system, or payment system.

AI Repo Finder for GitHub is an independent extension and is not affiliated with or endorsed by GitHub or any AI provider.

## Türkçe

### Ad
AI Repo Finder for GitHub

### Kısa açıklama
GitHub depolarınızı yerel olarak veya seçtiğiniz OpenAI uyumlu API ile arayın.

### Ayrıntılı açıklama
Uzun GitHub listelerinde gezinmeden doğru depoyu bulun.

AI Repo Finder for GitHub, bağlı GitHub hesabınızın erişebildiği depolar için aranabilir yerel bir dizin oluşturur. Doğal dil ve anahtar kelime araması varsayılan olarak cihazınızda çalışır. Dil, görünürlük, sahiplik ve güncellik filtreleri sunar.

ÖZELLİKLER
• GitHub OAuth Device Flow ile bağlanın. Kişisel erişim anahtarı yapıştırmanız gerekmez.
• AI hesabı veya ücretli hizmet olmadan yerel arama yapın.
• İsterseniz sonuçları kendi OpenAI uyumlu endpoint'inizle sıralayın.
• Özel, yıldızlı, fork veya arşivlenmiş depoları yalnızca seçtiğinizde dahil edin.
• Sonuçları ilgililik, güncellik, ad veya yıldız sayısına göre sıralayın.
• Eklenti açılır penceresini veya Chrome yan panelini kullanın.
• Açık, koyu veya sistem temasını seçin.

GİZLİLİK
Yerel arama depo verilerini bir AI hizmetine göndermez. Ayarlar, kimlik bilgileri ve önbelleğe alınan metadata cihazınızdaki Chrome eklenti depolamasında kalır. Gelişmiş arama varsayılan olarak kapalıdır. Açıp kullandığınızda sorgu ve sınırlı depo metadata'sı doğrudan yapılandırdığınız endpoint'e gönderilir. Eklentinin geliştirici tarafından işletilen backend'i, analitiği, reklamı, üyelik sistemi veya ödeme sistemi yoktur.

AI Repo Finder for GitHub bağımsız bir eklentidir. GitHub veya herhangi bir AI sağlayıcısı ile bağlantılı ya da onlar tarafından onaylanmış değildir.

## Suggested category
Developer Tools

## Single purpose
Help users search and filter repositories available through their connected GitHub account, locally or through an optional user-configured OpenAI-compatible ranking endpoint.

## Permission justifications

- `storage`: Store OAuth state, settings, and the repository metadata cache on the user's device.
- `sidePanel`: Offer the same repository search interface in Chrome's side panel.
- `https://api.github.com/*`: Read the authorized user's profile and selected repository metadata.
- `https://github.com/login/*`: Run GitHub OAuth Device Flow without requesting a personal access token.
- Optional `https://*/*`: Contact only the OpenAI-compatible HTTPS origin entered by the user after a runtime permission prompt.
- Optional `http://localhost/*` and `http://127.0.0.1/*`: Support user-operated local development endpoints after a runtime permission prompt.

## Asset checklist

- 128×128 extension icon: included.
- 1280×800 or 640×400 screenshots: capture at least two from a configured test account with no private or sensitive repository data.
- 440×280 small promo tile: optional for publication, recommended for presentation.
- Public HTTPS privacy-policy URL: required because the extension handles authentication information and optionally user-provided API credentials.
- Monitored support email or URL: required before submission.
