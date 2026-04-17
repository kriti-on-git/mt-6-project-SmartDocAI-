from pydantic import BaseModel


class IngestRepoRequest(BaseModel):
    repo_url: str


class QueryRequest(BaseModel):
    question: str
    project_id: str


class QueryResponse(BaseModel):

    answer: str
