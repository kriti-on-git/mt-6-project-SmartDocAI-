from services.retrieval_service import retrieval_service
from services.llm_service import llm_service


class RAGService:

    def build_prompt(self, query, contexts):

        if not contexts:
            return f"""
You are a documentation assistant.

No relevant context found.

Question: {query}
Answer: Not found in docs
"""

        context_block = "\n\n".join([
            f"[{c['source']} - {c['heading']}]\n{c['text']}"
            for c in contexts
        ])

        return f"""
You are a senior developer documentation assistant.

Rules:
- Answer ONLY from provided context
- If unsure, say "Not found in docs"
- Be precise and technical

Context:
{context_block}

Question:
{query}

Answer:
"""

    def generate(self, query):

        contexts = retrieval_service.retrieve(query)

        prompt = self.build_prompt(query, contexts)

        answer = llm_service.generate(prompt)

        return answer


rag_service = RAGService()
