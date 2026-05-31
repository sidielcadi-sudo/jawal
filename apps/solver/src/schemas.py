"""Schémas Pydantic pour les requêtes/réponses du solver.

Convention I/O :
 - Le client Next.js envoie un payload complet (slots, assignments, dispos)
 - Le solver renvoie un placement (entries) + un rapport (cours non placés,
   contraintes violées, score).
"""

from typing import Literal
from pydantic import BaseModel, Field


DayKey = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


class SlotInput(BaseModel):
    """Créneau horaire de la grille (semaine type)."""

    id: str
    start_time: str = Field(..., description="HH:MM 24h")
    end_time: str = Field(..., description="HH:MM 24h")
    is_break: bool = Field(False, description="Vrai = pause, pas de cours placable")


class AvailabilityRange(BaseModel):
    from_: str = Field(..., alias="from", description="HH:MM")
    to: str = Field(..., description="HH:MM")

    model_config = {"populate_by_name": True}


class TeacherInput(BaseModel):
    id: str
    name: str
    availability: dict[DayKey, list[AvailabilityRange]] = Field(default_factory=dict)


class AssignmentInput(BaseModel):
    """Une affectation pédagogique (prof × matière × classe).

    weekly_hours = nombre de séances d'1h à placer. Si tu as un cours de 2h
    consécutif, c'est 2 séances qui doivent juste se retrouver côte-à-côte
    (heuristique douce, pas modelée comme contrainte dure ici).
    """

    id: str
    teacher_id: str
    subject_id: str
    subject_label: str
    class_id: str
    class_name: str
    weekly_hours: int = Field(..., ge=0, le=40)


class GenerateRequest(BaseModel):
    """Requête de génération d'EDT pour une classe (phase A : mono-classe).

    En phase A, le solver place les cours d'UNE seule classe à la fois.
    Les conflits avec les autres classes sont passés comme `busy_teacher_slots`
    pour bloquer les créneaux où un prof est déjà occupé ailleurs.
    """

    class_id: str
    slots: list[SlotInput]
    days: list[DayKey] = Field(default=["MON", "TUE", "WED", "THU", "FRI", "SAT"])
    teachers: list[TeacherInput]
    assignments: list[AssignmentInput]
    busy_teacher_slots: list["BusyTeacherSlot"] = Field(default_factory=list)
    max_solve_seconds: float = Field(10.0, ge=1.0, le=60.0)


class BusyTeacherSlot(BaseModel):
    """Un (prof × jour × slot) déjà occupé dans une autre classe.

    Le solver les exclut comme contraintes dures.
    """

    teacher_id: str
    day: DayKey
    slot_id: str


# Forward ref
GenerateRequest.model_rebuild()


class PlacedEntry(BaseModel):
    """Une case d'EDT générée."""

    assignment_id: str
    class_id: str
    subject_id: str
    teacher_id: str
    day: DayKey
    slot_id: str


class UnplacedAssignment(BaseModel):
    """Affectation non placée (entière ou partielle) avec raison."""

    assignment_id: str
    subject_label: str
    teacher_id: str
    requested_hours: int
    placed_hours: int
    reason: str


class GenerateResponse(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "PARTIAL", "INFEASIBLE", "ERROR"]
    solver_time_ms: int
    placed: list[PlacedEntry]
    unplaced: list[UnplacedAssignment]
    message: str = ""
