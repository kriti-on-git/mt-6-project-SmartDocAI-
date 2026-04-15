# Smart Documentation Platform —

You are a senior full-stack engineer. Build the **Smart Documentation Platform** — a GitBook-style app where users upload code or a GitHub repo URL and get AI-generated structured docs via the Grok API. Includes a RAG-style chatbot powered by the generated docs.

---

## CRITICAL CORRECTIONS (read before generating any code)

| Wrong (from old spec)             | Correct                              |
|-----------------------------------|--------------------------------------|
| `https://api.x.ai/v1/responses`  | `https://api.x.ai/v1/chat/completions` |
| `grok-4.20-reasoning`            | `grok-2-latest`                      |
| `GROK_MODEL_FALLBACKS` env var   | Remove — adds complexity, not needed for MVP |
| `storage/projectStore.js`        | `services/store.service.js`          |

---

## TECH STACK

| Layer      | Package / Version                    |
|------------|--------------------------------------|
| Backend    | Node.js 20, Express 5, ES Modules   |
| AI         | xAI Grok API (`grok-2-latest`)      |
| HTTP client| `axios` ^1.7                        |
| Uploads    | `multer` ^1.4.5-lts.1               |
| Git clone  | `simple-git` ^3.24                  |
| Frontend   | React 18, Vite 5, Tailwind CSS v3   |
| Routing    | `react-router-dom` v6               |
| Markdown   | `react-markdown` + `remark-gfm`    |
| Icons      | `lucide-react`                      |

---

## FOLDER STRUCTURE

### Backend

```
backend/
  src/
    config/
      env.js              ← validate + export all env vars
    controllers/
      project.controller.js
    middleware/
      errorHandler.js
      upload.middleware.js
    routes/
      project.routes.js
    services/
      grok.service.js     ← ALL Grok API calls here
      source.service.js   ← file parsing + github clone
      store.service.js    ← JSON file persistence
    utils/
      asyncHandler.js     ← wraps async route handlers
      httpError.js        ← custom error class with status
    app.js
    index.js
  data/
    projects.json         ← created automatically on first run
  uploads/                ← multer temp storage
  .env
  .env.example
  package.json
```

### Frontend

```
frontend/
  src/
    api/
      client.js           ← axios instance with baseURL
      projects.js         ← all API call functions
    components/
      layout/
        Sidebar.jsx
        TopBar.jsx
      docs/
        DocViewer.jsx
        CodeBlock.jsx
        SectionNav.jsx
      chat/
        ChatPanel.jsx
        ChatMessage.jsx
        TypingIndicator.jsx
      upload/
        UploadForm.jsx
        DropZone.jsx
        GitHubInput.jsx
      ui/
        Button.jsx
        Spinner.jsx
        Badge.jsx
        Toast.jsx
    hooks/
      useProject.js
      useChat.js
      useToast.js
    pages/
      HomePage.jsx
      DocsPage.jsx
    App.jsx
    main.jsx
    index.css
  index.html
  vite.config.js
  tailwind.config.js
  postcss.config.js
  .env
  .env.example
  package.json
```

---

## ENVIRONMENT VARIABLES

### Backend `.env`

```
PORT=4000
GROK_API_KEY=xai-your-key-here
GROK_API_URL=https://api.x.ai/v1/chat/completions
GROK_MODEL=grok-2-latest
CORS_ORIGIN=http://localhost:5173
CORS_ORIGIN=http://localhost:5174
MAX_UPLOAD_FILES=20
MAX_UPLOAD_SIZE_MB=5
GITHUB_API_TOKEN=
```

### Frontend `.env`

```
VITE_API_BASE_URL=http://localhost:4000
```

---

## BACKEND — FILE BY FILE

### `src/config/env.js`

Validate all required env vars on startup. Throw if `GROK_API_KEY` is missing.
Export a frozen config object:

```js
export const config = Object.freeze({
  port: process.env.PORT || 4000,
  grokApiKey: process.env.GROK_API_KEY,
  grokApiUrl: process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions',
  grokModel: process.env.GROK_MODEL || 'grok-2-latest',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5174',
  maxUploadFiles: parseInt(process.env.MAX_UPLOAD_FILES) || 20,
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB) || 5,
  githubToken: process.env.GITHUB_API_TOKEN || '',
});
```

### `src/utils/httpError.js`

```js
export class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
```

### `src/utils/asyncHandler.js`

```js
// Wraps async route handlers to forward errors to Express error middleware
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

### `src/services/grok.service.js`

**IMPORTANT**: Use `/v1/chat/completions` endpoint, model `grok-2-latest`.

Export two functions:

#### `generateDocumentation(codeContent)`

System prompt:

```
You are a senior technical writer. Generate comprehensive, structured documentation in Markdown.
Always use proper headings (##, ###). Use fenced code blocks with language identifiers.
Be concise, accurate, and developer-friendly.
```

User prompt:

```
Analyze the following source code and generate complete documentation with these exact sections:

## Overview
Brief project/module description.

## Installation & Setup
Requirements and setup steps.

## Project Structure
Key files and their purpose.

## API Reference
For each exported function, class, or endpoint:
### `functionName(param: type): returnType`
Description. Parameters table. Return value. Example usage in a code block.

## Configuration
Environment variables and config options.

## Examples
End-to-end usage examples with real code.

## Dependencies
Key dependencies and why they're used.

---
Source code:
${codeContent}
```

#### `chatWithDocs(question, docsContext)`

System prompt:

```
You are a documentation assistant. Answer ONLY based on the provided documentation.
If the answer isn't in the docs, say: "This topic isn't covered in the current documentation."
Be concise. Use code examples when helpful.
```

User prompt:

```
Documentation context:
${docsContext}

Question: ${question}
```

Both functions call `https://api.x.ai/v1/chat/completions` with:

```json
{
  "model": "grok-2-latest",
  "messages": [...],
  "max_tokens": 4096,
  "temperature": 0.3
}
```

**Fallback**: if Grok API returns 4xx/5xx, catch the error and return a graceful fallback message string — do NOT throw. Log the error to console.

### `src/services/source.service.js`

- `parseUploadedFiles(filePaths[])` — read each file with `fs.readFile`, join with a `// === filename ===` header separator. Only process: `.js .ts .jsx .tsx .py .go .java .rb .php .cs .md .txt`
- `cloneAndParseRepo(repoUrl)` — use `simple-git` to clone into `/tmp/smart-docs-${uuid}`. Walk the directory recursively. Skip `node_modules`, `.git`, `dist`, `build`, `__pycache__`. Concatenate all source files. Delete temp dir after parsing.

### `src/services/store.service.js`

Persist to `backend/data/projects.json`. Auto-create file if missing.

Export:

- `getAllProjects()` — returns array
- `getProject(id)` — returns project or throws `HttpError('Not found', 404)`
- `saveProject(project)` — upsert by id
- `appendChatMessage(projectId, message)` — push to project.chatHistory

Project shape:

```js
{
  id: string,           // uuid
  name: string,
  createdAt: ISO string,
  sourceFiles: [{ name, content }],
  documentation: string,  // generated markdown
  sections: [{ title, anchor }],  // parsed from markdown headings
  chatHistory: [{ role: 'user'|'assistant', content, timestamp }]
}
```

### `src/controllers/project.controller.js`

Wire all route logic here. Keep each handler focused:

- `createProject` — validate input (repoUrl OR files required), parse source, call `generateDocumentation`, parse sections from `## headings`, save, return project
- `listProjects` — return all projects array
- `getProject` — return single project
- `getProjectDocs` — return `{ documentation, sections }`
- `regenerateDocs` — fetch stored source, re-call Grok, update project
- `chat` — validate `question`, call `chatWithDocs`, append both messages to history, return answer
- `getChatHistory` — return project.chatHistory

### `src/middleware/upload.middleware.js`

Multer disk storage in `./uploads/`. Allowed extensions: `.js .ts .jsx .tsx .py .go .java .rb .php .cs .md .txt .json .yaml .yml`. Max file size from config. Export as `uploadMiddleware = multer({...}).array('files', config.maxUploadFiles)`.

### `src/middleware/errorHandler.js`

```js
export default (err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
```

### `src/routes/project.routes.js`

```
POST   /api/projects                    → createProject
GET    /api/projects                    → listProjects
GET    /api/projects/:id                → getProject
GET    /api/projects/:id/docs           → getProjectDocs
POST   /api/projects/:id/generate       → regenerateDocs
POST   /api/projects/:id/chat           → chat
GET    /api/projects/:id/chat-history   → getChatHistory
```

### `src/app.js`

Express app setup. Mount routes. Add `errorHandler` last. Enable CORS for `config.corsOrigin`. Parse JSON + multipart. Add `GET /health` returning `{ status: 'ok', model: config.grokModel }`.

### `src/index.js`

Start server. Log `Server running on http://localhost:${config.port}`.

---

## FRONTEND — UI/UX DESIGN SYSTEM

### Design tokens (implement in `tailwind.config.js`)

```js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0a0a0f',   // page background
          900: '#12121a',   // sidebar
          800: '#1a1a27',   // cards, panels
          700: '#22223a',   // elevated cards
          600: '#2d2d4a',   // borders, dividers
        },
        accent: {
          500: '#7c5cfc',   // primary purple
          400: '#9b80fd',   // hover state
          300: '#baa8fe',   // subtle tint
          100: '#ede9ff',   // light bg tint
        },
        text: {
          primary:   '#f0effe',
          secondary: '#9d9db8',
          muted:     '#5a5a7a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'slide-right':'slideRight 0.2s ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideRight:{ from: { opacity: 0, transform: 'translateX(-8px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
      },
    }
  }
}
```

---

## FRONTEND — COMPONENT SPECS

### `src/index.css`

Import Inter and JetBrains Mono from Google Fonts. Tailwind directives. Base styles:

```css
html { background-color: #0a0a0f; color: #f0effe; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2d2d4a; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #7c5cfc; }
```

### `src/pages/HomePage.jsx`

**Layout**: centered, max-w-2xl, full viewport height flex column.

**Header section**:

- Logo mark (SVG or text): `SmartDocs` with a small purple spark icon left
- Tagline: `"Auto-generate beautiful docs from any codebase"`
- Subtext: small muted text

**Upload card** (`bg-surface-800 rounded-2xl border border-surface-600 p-8`):

- Tab switcher: two pills `Upload files` / `GitHub repo` — selected tab has `bg-accent-500 text-white`, unselected `text-text-secondary hover:text-text-primary`. Animate underline or background on tab switch.
- **File tab**: `<DropZone />` (drag-and-drop area)
- **GitHub tab**: `<GitHubInput />` (URL input + optional token)
- Project name input (optional, placeholder "My project")
- `Generate Documentation` button — full width, `bg-accent-500 hover:bg-accent-400 text-white font-medium py-3 rounded-xl transition-all duration-200 active:scale-95`

**Recent projects** (below card): small list of last 5 projects. Click navigates to `/docs/:id`.

### `src/components/upload/DropZone.jsx`

- Dashed border box: `border-2 border-dashed border-surface-600 rounded-xl p-12 text-center cursor-pointer`
- On hover: `border-accent-500` transition
- On drag-over: `border-accent-500 bg-accent-500/5` + scale(1.01)
- Shows upload icon (lucide `Upload`) + "Drop files here or click to browse"
- Accepted types listed in muted text below
- After files selected: show file chips with name, size, remove button

### `src/components/upload/GitHubInput.jsx`

- URL input with GitHub icon prefix inside the input
- Validate URL format on blur, show red border + "Invalid GitHub URL" if wrong
- Optional: collapsible "Add GitHub token" section for private repos

### `src/pages/DocsPage.jsx`

**Three-panel layout** (use CSS grid, NOT flexbox — more stable):

```
grid-template-columns: 240px 1fr 320px
```

Panels are `h-screen overflow-hidden`. Each panel scrolls independently.

On tablet (< 1024px): hide chat panel, show chat as floating button bottom-right.
On mobile (< 768px): hide sidebar, show hamburger menu.

### `src/components/layout/Sidebar.jsx`

- `bg-surface-900 border-r border-surface-600`
- Top: project name + back arrow to home
- Below: section list parsed from doc headings
- Each item: `text-text-secondary hover:text-text-primary hover:bg-surface-800 rounded-lg px-3 py-2 text-sm transition-all`
- Active item: `text-accent-400 bg-accent-500/10`
- Active item has a `2px left border` in `accent-500`
- Add smooth scroll on click: `element.scrollIntoView({ behavior: 'smooth' })`
- Bottom: "Regenerate docs" button + loading state

### `src/components/layout/TopBar.jsx`

- `bg-surface-900 border-b border-surface-600 h-12 flex items-center px-4`
- Left: breadcrumb `Projects / {projectName}`
- Right: "Copy markdown" button + "Toggle chat" button
- Buttons: ghost style, icon + label, hover `bg-surface-700`

### `src/components/docs/DocViewer.jsx`

- Scrollable, `prose` max-width centered, `px-12 py-10`
- Pass custom components to `react-markdown`:
  - `code` → `<CodeBlock />`
  - `h2`, `h3` → add `id` attribute (slugify the text) for anchor nav
- Use `remark-gfm` for tables, strikethrough, task lists
- Add `animate-fade-in` class on mount

Markdown prose styles (apply via `tailwind typography` plugin or manual CSS):

```
headings: text-text-primary, font-semibold
h1: 2rem
h2: 1.5rem, border-b border-surface-600 pb-2 mb-4
h3: 1.25rem
p: text-text-secondary, leading-7
a: text-accent-400 hover:underline
strong: text-text-primary
table: w-full, th bg-surface-800, td border border-surface-600
blockquote: border-l-2 border-accent-500 pl-4 text-text-secondary italic
```

### `src/components/docs/CodeBlock.jsx`

- Dark container: `bg-surface-950 rounded-xl border border-surface-600 overflow-hidden`
- Top bar: `bg-surface-800 px-4 py-2 flex items-center justify-between`
  - Left: language badge `bg-accent-500/20 text-accent-300 text-xs px-2 py-0.5 rounded font-mono`
  - Right: Copy button with lucide `Copy` icon
- On copy: icon changes to `Check` for 2 seconds, button text → "Copied!"
- Code area: `font-mono text-sm p-4 overflow-x-auto text-text-primary leading-6`
- Add subtle line numbers via CSS counter (optional)

### `src/components/chat/ChatPanel.jsx`

- `bg-surface-900 border-l border-surface-600 flex flex-col h-full`
- Top bar: "AI Assistant" title + model badge `grok-2-latest` + close icon
- Messages area: `flex-1 overflow-y-auto p-4 space-y-4`
- Input area (bottom): `border-t border-surface-600 p-4`
  - Textarea (auto-resize, max 4 rows): `bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm resize-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition-all`
  - Send button: icon-only, `bg-accent-500 hover:bg-accent-400 rounded-lg p-2 transition-all active:scale-95`
  - `Shift+Enter` = newline, `Enter` = send

### `src/components/chat/ChatMessage.jsx`

User messages: right-aligned, `bg-accent-500/15 border border-accent-500/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-xs ml-auto text-sm`

Assistant messages: left-aligned, `bg-surface-800 border border-surface-600 rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm text-sm`

Each message: small timestamp below in `text-text-muted text-xs`

Animate in with `animate-slide-up`.

### `src/components/chat/TypingIndicator.jsx`

Three dots bouncing: use CSS animation with staggered delays (0ms, 150ms, 300ms). `bg-text-muted rounded-full w-1.5 h-1.5`. Wrap in same style as assistant message bubble.

### `src/components/ui/Spinner.jsx`

SVG circular spinner. Props: `size` (sm/md/lg), `color` (default accent-500). Use `animate-spin`. For full-page loading: centered in viewport with a message prop below.

Full-page loading state text suggestions:

- "Analyzing your codebase..."
- "Generating documentation..."
- "Almost there..."

Cycle through these every 3 seconds while loading.

### `src/components/ui/Toast.jsx`

Bottom-right toast notifications. Types: `success` (green), `error` (red), `info` (purple). Auto-dismiss after 4 seconds. Animate in from right, animate out to right. Stack multiple toasts.

### `src/components/ui/Button.jsx`

Variants:

- `primary`: `bg-accent-500 hover:bg-accent-400 text-white`
- `ghost`: `hover:bg-surface-700 text-text-secondary hover:text-text-primary`
- `danger`: `bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20`

Always: `rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`

Loading state: spinner replaces icon, text stays, button disabled.

---

## HOOKS

### `src/hooks/useProject.js`

State: `{ project, loading, error, generating }`.

Functions:

- `createProject(formData)` — POST, set `generating: true`, navigate to `/docs/:id` on success
- `loadProject(id)` — GET project by id
- `regenerateDocs(id)` — POST regenerate, update project state

### `src/hooks/useChat.js`

State: `{ messages, loading }`.

- `sendMessage(question, projectId, docsContext)` — optimistically add user message, POST to chat endpoint, append assistant response
- `loadHistory(projectId)` — GET and set initial messages

### `src/hooks/useToast.js`

Simple toast queue. Returns `{ toasts, showToast, dismissToast }`. `showToast(message, type)`.

---

## API LAYER

### `src/api/client.js`

```js
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
  timeout: 120000, // 2 min for doc generation
});

// Response interceptor: extract error message
apiClient.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err.response?.data?.error || err.message)
);
```

### `src/api/projects.js`

Export functions using `apiClient`:

- `createProject(formData)` — POST multipart
- `getProject(id)` — GET
- `listProjects()` — GET
- `getProjectDocs(id)` — GET
- `regenerateDocs(id)` — POST
- `chat(id, question)` — POST `{ question }`
- `getChatHistory(id)` — GET

---

## INTERACTION PATTERNS

### Loading states (always use these, never leave UI blank)

1. **Doc generation**: Full-page spinner with cycling messages. Disable all inputs.
2. **Chat response**: Typing indicator replaces send button while loading.
3. **Regenerate**: Spinner inside sidebar button, disable button.
4. **File upload**: Progress feedback in DropZone.

### Transitions

- Page transitions: `animate-fade-in` on route change
- Panel open/close (chat): `transition-all duration-300` on width/transform
- List items appearing: staggered `animate-slide-up` with `animation-delay: Nms`
- Tab switch: `transition-all duration-200`

### Empty states

- No projects yet → centered illustration + "Upload your first project" CTA
- No chat messages → "Ask anything about the documentation"
- Docs not generated → "Click Regenerate to rebuild documentation"

### Error states

- API error: Toast (red) + keep form data intact so user can retry
- Upload error: inline error under dropzone, not a full-page error
- Network timeout: toast with "Generation took too long, please try again"

---

## PACKAGES

### Backend `package.json`

```json
{
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^5.0.0",
    "multer": "^1.4.5-lts.1",
    "simple-git": "^3.24.0",
    "uuid": "^10.0.0"
  }
}
```

### Frontend `package.json`

```json
{
  "dependencies": {
    "axios": "^1.7.2",
    "lucide-react": "^0.396.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.24.0",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.13",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.1"
  }
}
```

---

## Contributors

- Suman: <https://github.com/sumanisfr>
- Kriti: <https://github.com/kriti-on-git>
