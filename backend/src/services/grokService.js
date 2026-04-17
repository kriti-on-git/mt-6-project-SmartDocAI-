import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const GROK_API_URL = env.GROK_API_URL;

function getModelCandidates() {
  const fallbacks = (env.GROK_MODEL_FALLBACKS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return [env.GROK_MODEL, ...fallbacks].filter(Boolean);
}

function isModelNotFound(status, errorText) {
  return status === 400 && /model\s+not\s+found/i.test(errorText || "");
}

function isProviderAccessError(status, errorText) {
  const message = String(errorText || "").toLowerCase();

  if (status === 401 || status === 403) {
    return true;
  }

  return (
    message.includes("no credits") ||
    message.includes("licenses") ||
    message.includes("incorrect api key") ||
    message.includes("permission")
  );
}

function buildInputFromMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function isChatCompletionsUrl(url) {
  return /\/chat\/completions\b/i.test(String(url || ""));
}

function extractOutputText(data) {
  const chatMessage = data?.choices?.[0]?.message?.content;

  if (typeof chatMessage === "string" && chatMessage.trim()) {
    return chatMessage.trim();
  }

  if (Array.isArray(chatMessage)) {
    const parts = chatMessage
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item?.text === "string") {
          return item.text;
        }

        return "";
      })
      .filter(Boolean);

    if (parts.length) {
      return parts.join("\n\n").trim();
    }
  }

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputItems = Array.isArray(data?.output) ? data.output : [];
  const textParts = [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];

    for (const contentItem of contentItems) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        textParts.push(contentItem.text.trim());
      }
    }
  }

  if (textParts.length) {
    return textParts.join("\n\n");
  }

  return "";
}

function truncateContent(text, maxLength = 3000) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[Truncated for prompt size]`;
}

function isLikelyXaiKey(apiKey) {
  return typeof apiKey === "string" && /^xai-[A-Za-z0-9]/.test(apiKey.trim());
}

function formatSourceFiles(files) {
  return files
    .map((file) => {
      const preview = truncateContent(file.content, 3500);

      return [
        `File: ${file.path}`,
        `Language: ${file.language}`,
        "Content:",
        preview
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function inferProjectStructure(files) {
  const folders = new Set();

  for (const file of files) {
    const parts = String(file.path || "").split("/");

    if (parts.length > 1) {
      folders.add(parts.slice(0, -1).join("/"));
    }
  }

  return [...folders].slice(0, 12);
}

function detectLikelyApiFiles(files) {
  return files
    .filter((file) => /route|controller|api|server|handler/i.test(file.path || ""))
    .slice(0, 8);
}

function countLines(text) {
  const value = String(text || "");

  if (!value.trim()) {
    return 0;
  }

  return value.split(/\r?\n/).length;
}

function getDisplayType(file) {
  const filePath = String(file?.path || "").trim();
  const fileName = filePath.split("/").pop() || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";

  return extension || String(file?.language || "text").toLowerCase();
}

function inferFilePurpose(file) {
  const filePath = String(file?.path || "").toLowerCase();
  const fileName = filePath.split("/").pop() || "";

  if (/readme|guide|docs?|manual/.test(fileName)) {
    return "Project documentation, setup notes, or contributor guidance.";
  }

  if (/requirement|package\.json|pyproject|pom\.xml|build\.gradle/.test(fileName)) {
    return "Dependency or build/runtime configuration.";
  }

  if (/router?|route|controller|handler|api|endpoint|server/.test(filePath)) {
    return "Likely API entrypoints, request handlers, or service orchestration.";
  }

  if (/model|schema|entity|dto|types?/.test(filePath)) {
    return "Domain model or structural data contract definitions.";
  }

  if (/test|spec|__tests__|e2e/.test(filePath)) {
    return "Automated tests and expected behavior verification.";
  }

  if (/config|env|settings|yaml|yml/.test(filePath)) {
    return "Configuration and environment-specific options.";
  }

  if (/train|inference|predict|ml|model/.test(filePath)) {
    return "Machine learning training/inference or model lifecycle logic.";
  }

  if (fileName.endsWith(".md") || fileName.endsWith(".txt")) {
    return "Narrative documentation or reference material.";
  }

  return "Core implementation logic or utility behavior for the project.";
}

function extractKeySymbols(file) {
  const content = String(file?.content || "");
  const language = getDisplayType(file);
  const symbols = new Set();

  const jsLikeRegex = /(export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)|class\s+([A-Za-z_][A-Za-z0-9_]*)|const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(/g;
  const pyRegex = /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(|class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/g;

  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(language)) {
    let match = jsLikeRegex.exec(content);
    while (match) {
      const symbol = match[2] || match[3] || match[4];
      if (symbol) {
        symbols.add(symbol);
      }
      match = jsLikeRegex.exec(content);
    }
  } else if (language === "py") {
    let match = pyRegex.exec(content);
    while (match) {
      const symbol = match[1] || match[2];
      if (symbol) {
        symbols.add(symbol);
      }
      match = pyRegex.exec(content);
    }
  }

  return [...symbols].slice(0, 8);
}

function extractDependencies(file) {
  const content = String(file?.content || "");
  const language = getDisplayType(file);
  const dependencies = new Set();

  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(language)) {
    const importRegex = /import\s+[^\n]*?from\s+["']([^"']+)["']/g;
    const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;

    let match = importRegex.exec(content);
    while (match) {
      dependencies.add(match[1]);
      match = importRegex.exec(content);
    }

    match = requireRegex.exec(content);
    while (match) {
      dependencies.add(match[1]);
      match = requireRegex.exec(content);
    }
  }

  if (language === "py") {
    const importRegex = /^\s*import\s+([A-Za-z0-9_\.]+)/gm;
    const fromRegex = /^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm;

    let match = importRegex.exec(content);
    while (match) {
      dependencies.add(match[1]);
      match = importRegex.exec(content);
    }

    match = fromRegex.exec(content);
    while (match) {
      dependencies.add(match[1]);
      match = fromRegex.exec(content);
    }
  }

  return [...dependencies].slice(0, 8);
}

function inferFileFlow(file) {
  const filePath = String(file?.path || "").toLowerCase();

  if (filePath.endsWith("readme.md")) {
    return "Starts with project context and onboarding steps, then links readers to setup and usage flow.";
  }

  if (filePath.endsWith("index.html")) {
    return "Acts as the page shell where stylesheets/scripts attach and runtime UI is mounted.";
  }

  if (filePath.endsWith("admin.html")) {
    return "Provides administrative UI surface and likely triggers privileged management flows.";
  }

  if (filePath.endsWith("script.js")) {
    return "Contains interaction logic, event handling, data orchestration, and DOM updates.";
  }

  if (filePath.endsWith("style.css")) {
    return "Defines visual layout, component styling, and responsive behavior for UI consistency.";
  }

  return "Participates in feature flow by consuming inputs, transforming state, and exposing outputs to neighboring modules.";
}

function inferRiskNotes(file) {
  const filePath = String(file?.path || "").toLowerCase();

  if (filePath.endsWith("script.js")) {
    return "Check for unhandled async failures, null DOM queries, and side effects without guards.";
  }

  if (filePath.endsWith("index.html") || filePath.endsWith("admin.html")) {
    return "Validate script loading order, missing semantic labels, and potential accessibility gaps.";
  }

  if (filePath.endsWith("style.css")) {
    return "Watch for specificity conflicts and missing mobile breakpoint coverage.";
  }

  if (filePath.endsWith("readme.md")) {
    return "Ensure setup commands and environment values stay aligned with the current codebase.";
  }

  return "Review error handling, edge-case input validation, and coupling with adjacent modules.";
}

function buildDetailedFileGuide(files) {
  const safeFiles = Array.isArray(files) ? files : [];

  if (!safeFiles.length) {
    return ["- No files were available to build a detailed guide."];
  }

  const sections = [];

  for (const file of safeFiles) {
    const type = getDisplayType(file);
    const lineCount = countLines(file.content);
    const symbols = extractKeySymbols(file);
    const dependencies = extractDependencies(file);

    sections.push(`### ${file.path}`);
    sections.push(`- Type: ${type}`);
    sections.push(`- Approximate length: ${lineCount} lines`);
    sections.push(`- Purpose: ${inferFilePurpose(file)}`);
    sections.push(`- Flow role: ${inferFileFlow(file)}`);

    if (symbols.length) {
      sections.push(`- Key symbols: ${symbols.join(", ")}`);
    }

    if (dependencies.length) {
      sections.push(`- Key dependencies/imports: ${dependencies.join(", ")}`);
    }

    sections.push(`- Integration notes: Validate how this file exchanges data with parent/child modules.`);
    sections.push(`- Risks and review checklist: ${inferRiskNotes(file)}`);
    sections.push(`- Improvement ideas: Add targeted tests and inline docs for non-obvious behavior.`);

    sections.push("");
  }

  return sections;
}

function buildLocalDocumentation({ projectName, sourceType, sourceLabel, files }) {
  const safeFiles = Array.isArray(files) ? files : [];
  const folders = inferProjectStructure(safeFiles);
  const apiFiles = detectLikelyApiFiles(safeFiles);
  const listedFiles = safeFiles.slice(0, 20);
  const detailedFileGuide = buildDetailedFileGuide(safeFiles);
  const totalLines = safeFiles.reduce((sum, file) => sum + countLines(file.content), 0);

  const fileTypeCounts = safeFiles.reduce((acc, file) => {
    const type = getDisplayType(file);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const topTypes = Object.entries(fileTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => `- ${type}: ${count}`);

  return [
    `# SmartDocs`,
    ``,
    `## ${projectName}`,
    ``,
    `# Overview`,
    ``,
    `**${projectName}** documentation was generated in local fallback mode because the xAI account currently cannot serve requests.`,
    `This report prioritizes practical understanding, module relationships, and implementation-level review guidance.`,
    ``,
    `- Source type: ${sourceType}`,
    `- Source label: ${sourceLabel}`,
    `- Total files analyzed: ${safeFiles.length}`,
    `- Total lines analyzed: ${totalLines}`,
    ``,
    `# Analysis Snapshot`,
    ``,
    ...(topTypes.length
      ? topTypes
      : ["- No file-type breakdown is available for this source input."]),
    `- Primary architecture style: ${sourceType === "github" ? "Repository-driven modular source analysis" : "Upload-driven modular source analysis"}`,
    `- Suggested first read order: README.md -> entry HTML/JS -> feature modules -> API/service layers`,
    ``,
    `# Project Structure`,
    ``,
    ...(folders.length
      ? folders.map((folder) => `- ${folder}`)
      : ["- No nested folders detected from provided source input."]),
    ``,
    `# Core Functions and Classes`,
    ``,
    `The following files are good starting points for core logic review:`,
    ``,
    ...listedFiles.map((file) => {
      const lineCount = countLines(file.content);
      return `- ${file.path} (${getDisplayType(file)})${lineCount ? ` - ${lineCount} lines` : ""}`;
    }),
    ``,
    `# Detailed Guide (File-by-File)`,
    ``,
    ...detailedFileGuide,
    ``,
    `# API / Entry Points`,
    ``,
    ...(apiFiles.length
      ? apiFiles.map((file) => `- Inspect ${file.path} for routes/controllers and request handling.`)
      : ["- No API-specific filenames were detected automatically. Review backend entrypoints manually."]),
    ``,
    `# Example Usage`,
    ``,
    `## Generate docs`,
    ``,
    "```bash",
    "curl -X POST http://localhost:4000/api/projects -F \"projectName=My Project\" -F \"files=@./src/index.js\"",
    "```",
    "",
    "## Ask question",
    "",
    "```bash",
    "",
    "curl -X POST http://localhost:4000/api/projects/<projectId>/chat -H \"Content-Type: application/json\" -d '{\"question\":\"What are the main modules?\"}'",
    "```",
    ``,
    `# Implementation Notes`,
    ``,
    `- Local fallback mode is active when xAI credentials/account cannot run model inference.`,
    `- Add xAI team credits/licenses and valid API keys to restore AI-generated deep documentation.`,
    ``,
    `---`,
    ``,
    `← New Project`,
    `Powered by Grok AI`
  ].join("\n");
}

function buildLocalAnswer({ question, contextSections }) {
  const sections = Array.isArray(contextSections) ? contextSections : [];

  const summarizeSection = (section) => {
    const lines = String(section?.content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    const summary = lines.find((line) => line.length > 40) || lines[0] || "No summary text available.";
    return summary.length > 220 ? `${summary.slice(0, 220)}...` : summary;
  };

  if (!sections.length) {
    return [
      `Local fallback mode answer:`,
      ``,
      `I could not find a strongly relevant section for: **${question}**.`,
      `Try generating docs again after xAI account credits/licenses are enabled.`
    ].join("\n");
  }

  const topSections = sections.slice(0, 3);
  const bestSection = topSections[0];

  return [
    `Local fallback mode answer for: **${question}**`,
    ``,
    `Direct answer (best-effort from available documentation context):`,
    `- Most likely relevant section: **${bestSection.title}**`,
    `- Key takeaway: ${summarizeSection(bestSection)}`,
    ``,
    `Most relevant documentation sections:`,
    ...topSections.map((section) => `- **${section.title}**: ${summarizeSection(section)}`),
    ``,
    `Next best question to ask:`,
    `- Ask about a specific file, function, or flow (for example: \"Explain script.js event flow\" or \"Summarize API entry points\").`,
    ``,
    `xAI inference is currently unavailable due to account/permission issues, so this is a context-grounded fallback response.`
  ].join("\n");
}

async function callGrok(messages, temperature = 0.2) {
  const rawApiKeys = [env.GROK_API_KEY, env.GROK_API_KEY_FALLBACK].filter(Boolean);
  const apiKeys = [...new Set(rawApiKeys.filter(isLikelyXaiKey))];
  const models = getModelCandidates();

  if (!apiKeys.length) {
    if (rawApiKeys.length) {
      throw new HttpError(500, "Configured Grok key format is invalid. Keys must start with 'xai-'.");
    }

    throw new HttpError(500, "GROK_API_KEY or GROK_API_KEY_FALLBACK must be configured.");
  }

  if (!models.length) {
    throw new HttpError(500, "GROK_MODEL must be configured.");
  }

  let lastStatus = 500;
  let lastErrorText = "Unknown error";

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
      const response = await fetch(GROK_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKeys[keyIndex]}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          isChatCompletionsUrl(GROK_API_URL)
            ? {
                model: models[modelIndex],
                temperature,
                messages
              }
            : {
                model: models[modelIndex],
                temperature,
                input: buildInputFromMessages(messages)
              }
        )
      });

      if (response.ok) {
        const data = await response.json();
        const output = extractOutputText(data);

        if (!output) {
          throw new HttpError(502, "Grok returned an empty response.");
        }

        return output.trim();
      }

      lastStatus = response.status;
      lastErrorText = await response.text();

      const authError = response.status === 401 || response.status === 403;
      const modelMissing = isModelNotFound(response.status, lastErrorText);
      const hasMoreKeys = keyIndex < apiKeys.length - 1;
      const hasMoreModels = modelIndex < models.length - 1;

      if (authError && hasMoreKeys) {
        continue;
      }

      if (modelMissing && hasMoreModels) {
        break;
      }

      if (!(authError || modelMissing)) {
        throw new HttpError(lastStatus, `Grok request failed: ${lastErrorText}`);
      }
    }
  }

  throw new HttpError(lastStatus, `Grok request failed: ${lastErrorText}`);
}

export async function generateDocumentation({ projectName, sourceType, sourceLabel, files }) {
  const systemPrompt = [
    "You are a senior developer documentation writer.",
    "Produce clean GitBook/Docusaurus-style Markdown for a software project.",
    "Be precise, practical, and structured.",
    "Return only Markdown, no preamble or explanation outside the document."
  ].join(" ");

  const userPrompt = [
    `Project name: ${projectName}`,
    `Source type: ${sourceType}`,
    `Source label: ${sourceLabel}`,
    `Total files provided for analysis: ${Array.isArray(files) ? files.length : 0}`,
    "",
    "Write documentation with these exact sections and order:",
    "# SmartDocs",
    "## <Project Name>",
    "# Overview",
    "# Analysis Snapshot",
    "# Project Structure",
    "# Core Functions and Classes",
    "# Detailed Guide (File-by-File)",
    "# API / Entry Points",
    "# Example Usage",
    "## Generate docs",
    "## Ask question",
    "# Implementation Notes",
    "",
    "Requirements:",
    "- Explain what the project does in one concise overview.",
    "- Make the content deeply explanatory and implementation-focused, not generic.",
    "- In Analysis Snapshot, include source type, source label, total files analyzed, and meaningful quick stats.",
    "- In Analysis Snapshot, include architecture style, risk hotspots, and recommended reading order.",
    "- Explain the important modules, functions, classes, and responsibilities.",
    "- In 'Detailed Guide (File-by-File)', include a subsection for every provided file path.",
    "- For each file subsection, include: purpose, control/data flow role, key symbols, dependencies, integration notes, risks, and improvement ideas.",
    "- Explicitly include detailed subsections for README.md, admin.html, index.html, script.js, and style.css when these files exist.",
    "- If the source exposes APIs or routes, document them with method, path, input, and output.",
    "- Include short code examples and troubleshooting notes when useful.",
    "- Use Markdown headings and lists for readability.",
    "- Keep wording technical and actionable.",
    "- End with two plain lines exactly: '← New Project' and 'Powered by Grok AI'.",
    "",
    "Source files:",
    formatSourceFiles(files)
  ].join("\n");

  try {
    return await callGrok(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      0.15
    );
  } catch (error) {
    if (error instanceof HttpError && isProviderAccessError(error.statusCode, error.message)) {
      return buildLocalDocumentation({ projectName, sourceType, sourceLabel, files });
    }

    throw error;
  }
}

export async function answerFromDocumentation({ question, documentation, contextSections }) {
  const contextText = contextSections.length
    ? contextSections
        .map((section) => [`## ${section.title}`, section.content].join("\n"))
        .join("\n\n")
    : documentation;

  const systemPrompt = [
    "You are a documentation chatbot for a software project.",
    "Answer only using the provided documentation context.",
    "If the answer cannot be found, say that it is not present in the docs.",
    "Keep the reply concise, useful, and grounded in the source documentation.",
    "Return Markdown when formatting helps readability."
  ].join(" ");

  const userPrompt = [
    "Documentation context:",
    contextText,
    "",
    `Question: ${question}`,
    "",
    "Answer with a direct response and cite the relevant section names when helpful."
  ].join("\n");

  try {
    return await callGrok(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      0.1
    );
  } catch (error) {
    if (error instanceof HttpError && isProviderAccessError(error.statusCode, error.message)) {
      return buildLocalAnswer({ question, contextSections });
    }

    throw error;
  }
}
