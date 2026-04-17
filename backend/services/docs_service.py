from ingestion.markdown_loader import load_documents
from ingestion.doc_parser import parse_markdown
from utils.file_filter import should_ignore
from utils.sidebar_tree import sort_sidebar
from utils.sidebar_formatter import clean_name
import os

BASE_REPO_PATH = "./repos"


class DocsService:

    def get_sidebar(self, project_id):

        base_path = os.path.join(BASE_REPO_PATH, project_id)

        tree = {}

        for root, dirs, files in os.walk(base_path):

            # remove ignored dirs in-place
            dirs[:] = [d for d in dirs if d not in ["node_modules", ".git", "dist", "build", "__pycache__"]]
            ALLOWED_EXTENSIONS = [".md", ".py", ".js", ".ts", ".tsx", ".jsx"]
            for file in files:

                if os.path.splitext(file)[1] not in ALLOWED_EXTENSIONS:
                                        continue
                rel_path = os.path.relpath(
                    os.path.join(root, file),
                    base_path
                )

                parts = rel_path.split(os.sep)

                if should_ignore(parts, file):
                    continue

                full_path = os.path.join(base_path, rel_path)

                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()

                parsed = parse_markdown(content)

                node = {
                    "path": rel_path,
                    "sections": parsed["headings"]
                }

                current = tree

                for part in parts[:-1]:
                    current = current.setdefault(part, {})

                cleaned = clean_name(file)

                current[cleaned] = rel_path

        return sort_sidebar(tree)

    def get_all_docs(self,project_id):
        base_path = os.path.join(BASE_REPO_PATH, project_id)

        docs = load_documents(base_path)

        result = []

        for doc in docs:

            parsed = parse_markdown(doc["content"])

            result.append({
                "path": doc["path"],
                "filename": doc["filename"],
                "html": parsed["html"],
                "headings": parsed["headings"]
            })

        return result

    def get_doc_by_path(self, project_id, path):

        full_path = os.path.join(BASE_REPO_PATH, project_id, path)

        if not os.path.exists(full_path):
            return {"error": "not found"}

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        parsed = parse_markdown(content)

        return {
        "html": parsed["html"],
        "sections": parsed["headings"]
        }


docs_service = DocsService()
