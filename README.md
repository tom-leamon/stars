# Stars

A minimal reimplementation of [dmarx/stars](https://github.com/dmarx/stars) in ~700 lines of vanilla JavaScript. No frameworks, no build step, no dependencies beyond Node.js 22+.

<img width="790" height="923" alt="Screenshot_20260329_142231" src="https://github.com/user-attachments/assets/48c10067-6514-47ab-a0d2-c056c795a91b" />

## Goals

- **Single collector script** (`collect.mjs`): one Node.js script replaces four Python scripts. Fetches starred repos, user profile, and star lists in a single pass. Outputs `data.json`.
- **Single dashboard file** (`index.html`): inline JS + CSS. No React, no Tailwind, no bundler. Opens directly in a browser or deploys to GitHub Pages as-is.
- **~700 total lines** across both files.
- **Zero runtime dependencies**: uses Node 22+ built-in `fetch()` and regex-based HTML scraping for star lists.

## What it does

### Collector (`collect.mjs`)

1. Fetches user profile (avatar, display name, bio) via the GitHub API
2. Fetches all starred repositories for a GitHub user with star timestamps
3. Scrapes GitHub star lists and associates them with repos
4. Handles pagination and rate limiting automatically
5. Writes everything to a single `data.json`

### Dashboard (`index.html`)

A GitHub-styled dark theme dashboard with:

- **Profile header** with avatar, display name, username, and bio (links to GitHub profile)
- **Text search** across repo names and descriptions
- **Sort** by 6 fields (starred date, stars, name, last active, created, pushed) in ascending or descending order
- **List filter** tags for GitHub star lists
- **Advanced search** with 9 searchable fields, AND/OR conjunction, and multiple operators:

  | Field | Operators |
  |-------|-----------|
  | Name | contains, equals, starts with, ends with |
  | Description | contains, equals, starts with, ends with |
  | Language | contains, equals, starts with, ends with |
  | Lists | includes, excludes |
  | Stars | equals, greater than, less than |
  | Starred | equals, after, before |
  | Created | equals, after, before |
  | Updated | equals, after, before |
  | Pushed | equals, after, before |

- **Inline language badges** with colored dots matching GitHub's language colors
- **Expandable repo details** showing forks, issues, dates, homepage, and list tags
- **Responsive layout** that works on mobile
- **CSS custom properties** using GitHub's exact Primer dark theme colors

## What it drops

- Semantic Scholar enrichment (marginal value relative to complexity)
- arXiv metadata extraction (dropped to keep scope minimal)
- Token-bucket rate limiter (replaced by simple sleep between requests)
- Incremental commit-and-push during collection (run it, then commit the result)
- 10 GitHub Actions workflows (replaced by one)

## Usage

```bash
# Copy .env.example and fill in your details
cp .env.example .env
# Edit .env with your GitHub username and a personal access token

# Collect data
node collect.mjs
# or pass username directly: node collect.mjs <username>

# View dashboard
open index.html
# or deploy index.html + data.json + favicon.ico to any static host
```

Star lists require a `GH_TOKEN` with no special scopes. Without a token, repos are still collected (at 60 req/hr) but lists are skipped.

## GitHub Pages deployment

The included workflow (`.github/workflows/deploy.yml`) runs the collector daily and deploys to GitHub Pages. To set it up:

1. In your repo, go to **Settings > Pages** and set Source to **GitHub Actions**
2. Add a **secret** at Settings > Secrets > Actions:
   - `GH_TOKEN` — a [personal access token](https://github.com/settings/tokens?type=beta) (fine-grained, no permissions needed)
3. Add a **variable** at Settings > Variables > Actions:
   - `GH_USERNAME` — your GitHub username

## File structure

```
Stars/
├── README.md
├── collect.mjs    (~200 lines) data pipeline
├── index.html     (~500 lines) dashboard
├── favicon.ico
└── data.json      (generated)  output
```
