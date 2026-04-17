from pathlib import Path
from typing import List, Dict

# Directories to ignore completely
EXCLUDE_DIRS = {
    ".git", "node_modules", "dist", "build",
    "__pycache__", ".next", ".venv", "venv"
}

# File types we actually want
ALLOWED_EXTENSIONS = {".md", ".mdx", ".typ"}


def extract_title(content: str, filename: str) -> str:
    """
    Extract first H1 heading as title.
    Fallback → filename
    """
    for line in content.split("\n"):
        if line.strip().startswith("# "):
            return line.replace("# ", "").strip()
    return filename


def load_documents(base_path: str) -> List[Dict]:

    docs = []

    base = Path(base_path)

    for file in base.rglob("*"):

        # Skip directories
        if file.is_dir():
            continue

        # Skip unwanted folders
        if any(part in EXCLUDE_DIRS for part in file.parts):
            continue

        # Skip unwanted file types
        if file.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        try:
            with open(file, "r", encoding="utf-8") as f:
                content = f.read().strip()

            # Skip empty files
            if not content:
                continue

            title = extract_title(content, file.name)

            docs.append({
                "content": content,
                "path": str(file),
                "filename": file.name,
                "title": title,
                "type": "markdown",
                "project_id": None  # ← will override during ingestion
            })

        except Exception as e:
            print(f"Skipping file {file}: {e}")
            continue

    print(f"[Loader] Loaded {len(docs)} documents")
    return docs
