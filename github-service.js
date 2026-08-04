/**
 * github-service.js
 * Handles GitHub REST API calls, fetching public & private user repositories,
 * starred repositories, and caching them in chrome.storage.local.
 */

const GitHubService = {
  /**
   * Test connection with GitHub PAT
   * @param {string} token 
   * @returns {Promise<{success: boolean, user?: object, message?: string}>}
   */
  async testConnection(token) {
    if (!token) {
      return { success: false, message: "GitHub Token girilmedi." };
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "GitAI-Repo-Finder"
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, message: "Geçersiz GitHub Token. Yetkilendirme başarısız." };
        }
        return { success: false, message: `GitHub API Hatası: ${response.statusText}` };
      }

      const userData = await response.json();
      return { success: true, user: userData };
    } catch (err) {
      console.error("GitHub connection error:", err);
      return { success: false, message: "Bağlantı hatası: Internet veya CORS denetimini kontrol edin." };
    }
  },

  /**
   * Fetch all user repositories from GitHub REST API
   * @param {string} token 
   * @param {object} settings { includePrivate: boolean, includeStarred: boolean }
   * @returns {Promise<Array>}
   */
  async fetchAllRepositories(token, settings = { includePrivate: true, includeStarred: false }) {
    if (!token) {
      throw new Error("GitHub Token bulunamadı. Lütfen Ayarlar sayfasından token ekleyin.");
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "GitAI-Repo-Finder"
    };

    let allRepos = [];
    let page = 1;
    let hasMore = true;

    // Fetch all user repos without artificial page caps (up to 5,000 repos)
    while (hasMore && page <= 50) {
      const typeParam = settings.includePrivate ? "all" : "public";
      const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&type=${typeParam}`;
      
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `GitHub API Hatası: ${res.status}`);
      }

      const repos = await res.json();
      if (!Array.isArray(repos) || repos.length === 0) {
        hasMore = false;
        break;
      }

      allRepos = allRepos.concat(repos);

      if (repos.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Map into clean structured objects
    const repoMap = new Map();
    allRepos.forEach(repo => {
      repoMap.set(repo.id, {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || "",
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        isPrivate: repo.private,
        isFork: repo.fork || false,
        isStarred: false,
        language: repo.language || "Bilinmiyor",
        stargazersCount: repo.stargazers_count || 0,
        forksCount: repo.forks_count || 0,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        topics: repo.topics || [],
        homepage: repo.homepage || "",
        owner: repo.owner ? repo.owner.login : ""
      });
    });

    // If Starred repos included - fetch all pages of starred repos
    if (settings.includeStarred) {
      try {
        let starredPage = 1;
        let starredHasMore = true;

        while (starredHasMore && starredPage <= 50) {
          const starredRes = await fetch(`https://api.github.com/user/starred?per_page=100&page=${starredPage}`, { headers });
          if (!starredRes.ok) break;

          const starredRepos = await starredRes.json();
          if (!Array.isArray(starredRepos) || starredRepos.length === 0) break;

          starredRepos.forEach(repo => {
            if (repoMap.has(repo.id)) {
              repoMap.get(repo.id).isStarred = true;
            } else {
              repoMap.set(repo.id, {
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description || "",
                htmlUrl: repo.html_url,
                cloneUrl: repo.clone_url,
                isPrivate: repo.private,
                isFork: repo.fork || false,
                isStarred: true,
                language: repo.language || "Bilinmiyor",
                stargazersCount: repo.stargazers_count || 0,
                forksCount: repo.forks_count || 0,
                updatedAt: repo.updated_at,
                pushedAt: repo.pushed_at,
                topics: repo.topics || [],
                homepage: repo.homepage || "",
                owner: repo.owner ? repo.owner.login : ""
              });
            }
          });

          if (starredRepos.length < 100) {
            starredHasMore = false;
          } else {
            starredPage++;
          }
        }
      } catch (e) {
        console.warn("Starred repos fetch failed:", e);
      }
    }

    const finalReposList = Array.from(repoMap.values());
    await this.saveCache(finalReposList);
    return finalReposList;
  },

  /**
   * Save repositories to chrome.storage.local
   */
  async saveCache(repos) {
    const cacheData = {
      repos: repos,
      lastSynced: new Date().toISOString()
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ github_repo_cache: cacheData });
    } else {
      localStorage.setItem('github_repo_cache', JSON.stringify(cacheData));
    }
  },

  /**
   * Get cached repositories
   */
  async getCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(['github_repo_cache']);
      return data.github_repo_cache || null;
    } else {
      const raw = localStorage.getItem('github_repo_cache');
      return raw ? JSON.parse(raw) : null;
    }
  },

  /**
   * Clear cached repositories
   */
  async clearCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(['github_repo_cache']);
    } else {
      localStorage.removeItem('github_repo_cache');
    }
  }
};
