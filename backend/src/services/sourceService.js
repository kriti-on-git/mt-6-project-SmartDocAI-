import path from "path";
import { HttpError } from "../utils/httpError.js";
import { env } from "../config/env.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".php",
  ".cs",
  ".html",
  ".css",
  ".json",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".sql"
]);

const MAX_FILE_BYTES = 250_000;
const MAX_FILES_FROM_REPO = 80;

function getExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function isSupportedTextFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(getExtension(filePath));
}

function decodeFileBuffer(file) {
  const text = file.buffer.toString("utf8");

  if (text.includes("\u0000")) {
    return null;
  }

  return text;
}

export function extractUploadedFiles(files = []) {
  return files
    .filter((file) => isSupportedTextFile(file.originalname))
    .map((file) => ({
      name: file.originalname,
      path: file.originalname,
      content: decodeFileBuffer(file) ?? "",
      size: file.size,
      language: getExtension(file.originalname).replace(/^\./, "") || "text"
    }))
    .filter((file) => file.content.trim().length > 0);
}

export function parseGitHubRepoUrl(repoUrl) {
  const cleaned = repoUrl.trim().replace(/\/$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?/i);

  if (!match) {
    throw new HttpError(400, "Provide a valid GitHub repository URL.");
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
    branch: match[3] || "",
    subPath: match[4] || ""
  };
}

async function fetchWithAuth(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SmartDocAI"
  };

  if (env.GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const message = await response.text();
    throw new HttpError(response.status, `GitHub API request failed: ${message}`);
  }

  return response.json();
}

async function fetchRawFile(url) {
  const response = await fetch(url, { headers: { "User-Agent": "SmartDocAI" } });

  if (!response.ok) {
    return null;
  }

  return response.text();
}

export async function extractFilesFromRepository(repoUrl) {
  const { owner, repo, branch, subPath } = parseGitHubRepoUrl(repoUrl);

  const repoData = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}`);
  const defaultBranch = branch || repoData.default_branch || "main";
  const treeData = await fetchWithAuth(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
  );

  const sourceFiles = [];

  for (const entry of treeData.tree || []) {
    if (sourceFiles.length >= MAX_FILES_FROM_REPO) {
      break;
    }

    if (entry.type !== "blob" || !entry.path) {
      continue;
    }

    if (subPath && !entry.path.startsWith(subPath)) {
      continue;
    }

    if (!isSupportedTextFile(entry.path)) {
      continue;
    }

    if (entry.size && entry.size > MAX_FILE_BYTES) {
      continue;
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${entry.path}`;
    const content = await fetchRawFile(rawUrl);

    if (!content || !content.trim()) {
      continue;
    }

    sourceFiles.push({
      name: path.basename(entry.path),
      path: entry.path,
      content,
      size: content.length,
      language: getExtension(entry.path).replace(/^\./, "") || "text"
    });
  }

  if (!sourceFiles.length) {
    throw new HttpError(400, "No supported text files were found in the repository.");
  }

  return sourceFiles;
}

export function summarizeSourceFiles(files) {
  return files.slice(0, 12).map((file) => ({
    path: file.path,
    name: file.name,
    language: file.language,
    preview: file.content.slice(0, 500)
  }));
}
