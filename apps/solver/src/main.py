"""FastAPI app — point d'entrée HTTP du solver Jawal.

Sans état, sans persistence. Le service ne connaît rien de la DB Jawal :
Next.js collecte les données, appelle ce service, persiste le résultat.
"""

from fastapi import FastAPI

from .schemas import GenerateRequest, GenerateResponse
from .solver import solve

app = FastAPI(
    title="Jawal Timetable Solver",
    version="0.1.0",
    description="OR-Tools CP-SAT — génération d'EDT scolaire.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=GenerateResponse)
def solve_endpoint(req: GenerateRequest) -> GenerateResponse:
    """Génère un EDT pour une classe selon les contraintes fournies."""
    return solve(req)
