from fastapi import APIRouter, UploadFile, File
import os

from api.schemas import QueryRequest, QueryResponse, IngestRepoRequest
from services.rag_service import rag_service
from services.docs_service import docs_service
from services.repo_service import repo_service
from ingestion.ingest_docs import ingest
from utils.id_generator import generate_project_id


router = APIRouter()



@router.post("/ingest/repo")
def ingest_repo(request: IngestRepoRequest):

    project_id = generate_project_id(request.repo_url)

    path = repo_service.clone_repo(
        request.repo_url,
        project_id
    )

    ingest(base_path=path, project_id=project_id)

    return {"status": "indexed","project_id": project_id}


@router.post("/ingest/upload")
async def upload_docs(files: list[UploadFile] = File(...)):

    project_id = generate_project_id("upload")

    base_path = f"./repos/{project_id}"
    os.makedirs(base_path, exist_ok=True)

    for file in files:

        file_path = os.path.join(base_path, file.filename)

        with open(file_path, "wb") as f:
            f.write(await file.read())

    # ingest after upload
    ingest(base_path=base_path, project_id=project_id)

    return {
        "status": "indexed",
        "project_id": project_id
    }



@router.get("/docs/{project_id}/sidebar")
def get_sidebar(project_id: str):

    return docs_service.get_sidebar(project_id)


@router.get("/docs/{project_id}")
def get_docs(project_id: str):

    return docs_service.get_all_docs(project_id)


@router.get("/docs/{project_id}/page")
def get_doc(project_id: str, path: str):

    doc= docs_service.get_doc_by_path(project_id, path)
    if not doc:
        return {"error": "Doc not found"}

    return doc

@router.post("/ask")
def ask_docs(request: QueryRequest):
    project_id=request.project_id
    if not project_id:
        raise ValueError("project_id is required")
    answer = rag_service.generate(
        request.question,
        project_id
    )

    return {"answer": answer}
