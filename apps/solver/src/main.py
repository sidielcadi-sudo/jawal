"""FastAPI app — point d'entrée HTTP du solver Jawal.

Sans état, sans persistence. Le service ne connaît rien de la DB Jawal :
Next.js collecte les données, appelle ce service, persiste le résultat.
"""

from fastapi import FastAPI

from .schemas import (
    GenerateRequest,
    GenerateResponse,
    MultiGenerateRequest,
    MultiGenerateResponse,
)
from .solver import solve
from .solver_multi import solve_multi
from .fet_engine import solve_with_fet

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


@app.post("/solve-multi", response_model=MultiGenerateResponse)
def solve_multi_endpoint(req: MultiGenerateRequest) -> MultiGenerateResponse:
    """Génère l'EDT de plusieurs classes simultanément.

    Le champ `engine` du payload choisit le moteur :
     - "ortools" (default) : OR-Tools CP-SAT, généraliste, rapide
     - "fet" : FET, spécialisé EDT scolaire, meilleur anti-gaps mais plus lent
    """
    if req.engine == "fet":
        return solve_with_fet(req)
    return solve_multi(req)


@app.get("/engines")
def engines() -> dict[str, list[str]]:
    """Liste les moteurs disponibles (utile pour l'UI Next.js)."""
    import shutil
    available = ["ortools"]
    if shutil.which("fet-cl"):
        available.append("fet")
    return {"engines": available}
