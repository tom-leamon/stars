#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// --- Load .env ---

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// --- Config ---

const API = 'https://api.github.com';
const TOKEN = process.env.GH_TOKEN;
const BASE_HEADERS = { 'User-Agent': 'stars-collector' };
const HEADERS = {
  ...BASE_HEADERS,
  Accept: 'application/vnd.github.v3+json',
  ...(TOKEN ? { Authorization: `token ${TOKEN}` } : {}),
};
const STAR_HEADERS = { ...HEADERS, Accept: 'application/vnd.github.v3.star+json' };
const DATA_FILE = 'data.json';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Rate limiting ---

let rateLimitRemaining = 5000;

function checkRateLimit(res) {
  rateLimitRemaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '5000', 10);
  if (rateLimitRemaining < 100) {
    const reset = parseInt(res.headers.get('x-ratelimit-reset') ?? '0', 10);
    const wait = Math.max(reset - Date.now() / 1000, 0) + 1;
    console.log(`  rate limit low (${rateLimitRemaining}), sleeping ${wait.toFixed(0)}s`);
    return sleep(wait * 1000);
  }
}

async function ghFetch(url, headers = HEADERS) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) return null;
    throw new Error(`${res.status} ${res.statusText}: ${url}`);
  }
  await checkRateLimit(res);
  return res;
}

// --- Paginated fetch ---

async function paginate(url, headers = HEADERS) {
  const items = [];
  while (url) {
    const res = await ghFetch(url, headers);
    if (!res) break;
    items.push(...await res.json());
    const link = res.headers.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return items;
}

// --- GitHub data fetchers ---

async function getUserProfile(user) {
  console.log(`fetching profile for ${user}...`);
  const res = await ghFetch(`${API}/users/${user}`);
  if (!res) return {};
  const u = await res.json();
  return { name: u.name, avatar_url: u.avatar_url, bio: u.bio };
}

async function getStarredRepos(user) {
  console.log(`fetching starred repos for ${user}...`);
  return paginate(`${API}/users/${user}/starred?per_page=100`, STAR_HEADERS);
}

// --- Star lists (web scrape) ---

async function getStarLists(user) {
  console.log('fetching star lists...');
  const res = await fetch(`https://github.com/${user}?tab=stars`, {
    headers: { 'User-Agent': 'stars-collector', Authorization: `token ${TOKEN}` },
  });
  if (!res.ok) { console.warn(`  could not fetch star lists: ${res.status}`); return []; }
  const html = await res.text();
  const lists = [];
  const listRe = /<a[^>]*class="[^"]*Box-row[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;
  let m;
  while ((m = listRe.exec(html))) {
    lists.push({ name: m[2].trim(), url: m[1] });
  }
  console.log(`  found ${lists.length} lists`);
  return lists;
}

async function getReposInList(listUrl) {
  const repos = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`https://github.com${listUrl}?page=${page}`, {
      headers: { 'User-Agent': 'stars-collector', Authorization: `token ${TOKEN}` },
    });
    if (!res.ok) break;
    const html = await res.text();
    const repoRe = /data-hovercard-type="repository"[^>]*href="\/([^"]+)"/g;
    let m, found = 0;
    while ((m = repoRe.exec(html))) {
      repos.push(m[1]);
      found++;
    }
    if (!found) break;
    await sleep(1000);
  }
  return repos;
}

// --- Data persistence ---

function loadData() {
  if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  return { username: null, last_updated: null, repos: {} };
}

function saveData(data) {
  data.last_updated = new Date().toISOString();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Username detection ---

function getUsername() {
  if (process.env.GH_USERNAME) return process.env.GH_USERNAME;
  try {
    const remote = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
    const m = remote.match(/github\.com[/:]([^/]+)\//);
    return m?.[1] ?? null;
  } catch { return null; }
}

// --- Main ---

const user = process.argv[2] || process.env.GH_USERNAME || getUsername();
if (!user) { console.error('usage: node collect.mjs <username>'); process.exit(1); }
if (!TOKEN) console.log('no GH_TOKEN set, using unauthenticated API (60 req/hr)');

const data = loadData();
data.username = user;
const profile = await getUserProfile(user);
data.profile = profile;
const starred = await getStarredRepos(user);
console.log(`${starred.length} starred repos (${Object.keys(data.repos).length} already collected)`);

let newCount = 0;
for (const item of starred) {
  const name = item.repo.full_name;
  if (data.repos[name]) continue;

  process.stdout.write(`  ${name}...`);
  const description = item.repo.description ?? '';

  data.repos[name] = {
    metadata: {
      id: item.repo.id,
      name: item.repo.name,
      full_name: name,
      description,
      url: item.repo.html_url,
      homepage: item.repo.homepage,
      language: item.repo.language,
      stars: item.repo.stargazers_count,
      forks: item.repo.forks_count,
      open_issues: item.repo.open_issues_count,
      created_at: item.repo.created_at,
      updated_at: item.repo.updated_at,
      pushed_at: item.repo.pushed_at,
      starred_at: item.starred_at,
    },
    lists: [],
  };
  newCount++;
  console.log(' ok');
  await sleep(100);
}
console.log(`${newCount} new repos collected`);

// Star lists (requires auth)
const lists = TOKEN ? await getStarLists(user) : (console.log('skipping star lists (no token)'), []);
for (const list of lists) {
  console.log(`  list: ${list.name}`);
  const repos = await getReposInList(list.url);
  for (const repo of repos) {
    if (data.repos[repo] && !data.repos[repo].lists.includes(list.name)) {
      data.repos[repo].lists.push(list.name);
    }
  }
}

saveData(data);
console.log(`done. ${Object.keys(data.repos).length} repos in ${DATA_FILE}`);
