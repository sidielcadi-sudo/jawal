"""FastAPI app — point d'entrée HTTP du solver Jawal.

Sans état, sans persistence. Le service ne connaît rien de la DB Jawal :
Next.js collecte les données, appelle ce service, persiste le résultat.
"""

import os
import time

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


# Diagnostic : quand la variable d'environnement JAWAL_DUMP_DIR est posée,
# chaque requête multi-classes est écrite sur disque avant traitement. C'est le
# seul moyen fiable de rejouer EXACTEMENT ce que l'application envoie — un
# payload reconstruit à la main diverge toujours sur un détail, et on corrige
# alors un problème qui n'est pas celui de l'utilisateur.
_DUMP_DIR = os.environ.get("JAWAL_DUMP_DIR")


@app.post("/solve-multi", response_model=MultiGenerateResponse)
def solve_multi_endpoint(req: MultiGenerateRequest) -> MultiGenerateResponse:
    """Génère l'EDT de plusieurs classes simultanément.

    Le champ `engine` du payload choisit le moteur :
     - "ortools" (default) : OR-Tools CP-SAT, généraliste, rapide
     - "fet" : FET, spécialisé EDT scolaire, meilleur anti-gaps mais plus lent
    """
    if _DUMP_DIR:
        try:
            os.makedirs(_DUMP_DIR, exist_ok=True)
            stamp = time.strftime("%H%M%S")
            path = os.path.join(_DUMP_DIR, f"req_{stamp}_{req.engine}.json")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(req.model_dump_json())
        except Exception:  # noqa: BLE001 — un diagnostic ne doit rien casser
            pass

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
