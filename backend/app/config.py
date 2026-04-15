from pydantic_settings import BaseSettings
from typing import Optional 

class Settings(BaseSettings):

    APP_NAME: str = "SmartDocs AI Backend"
    API_V1_PREFIX: str = "/api"

    DOCS_PATH: str = "./docs"

    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_PROVIDER: str = "hf"
    HF_TOKEN: str | None = None  

    # LLM
    LLM_PROVIDER: str = "groq"
    LLM_MODEL: str = "llama-3.1-8b-instant"

    GROQ_API_KEY: str = ""

    # Vector DB
   
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "docs_embeddings"

    # Retrieval
    TOP_K: int = 5
    USE_HYBRID_SEARCH: bool = True

    # Chunking
    CHUNK_SIZE: int = 400
    CHUNK_OVERLAP: int = 50

    # Worker
    INGEST_INTERVAL: int = 300

    class Config:
        env_file = ".env"


settings = Settings()
