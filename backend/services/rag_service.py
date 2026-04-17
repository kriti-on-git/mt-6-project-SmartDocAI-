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
    f"""SOURCE: {c.get('source', '')}
SECTION: {c.get('heading', 'General')}
URL: {c.get('url', '')}

CONTENT:
{c.get('heading', '')}
{c.get('text', '')}
"""
            for c in contexts
        ])

        return f"""
You are a senior developer documentation assistant.

Rules:
- If the user greets, greet with "Hi."
- If provides question, answer to it.
- If no question found, ask if you can help with understanding the documentation.
- Try to answer in a supportive manner.
- Answer ONLY from provided context.
- If unsure, say "Not found in docs".
- Be precise and technical.
- Format answers clearly, precisely using bullet points only when needed.

Context:
{context_block}

Question:
{query}

Answer:
"""

    def generate(self, query, project_id):

        contexts = retrieval_service.retrieve(query, project_id)

        prompt = self.build_prompt(query, contexts)

        answer = llm_service.generate(prompt)

        return answer


rag_service = RAGService()
