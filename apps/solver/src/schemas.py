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


# ─── Phase B : multi-classes + salles ────────────────────────────


class RoomInput(BaseModel):
    """Salle de cours utilisable par le solveur."""

    id: str
    label: str
    # Phase 4E4 : type de salle (STD/LABO_PC/LABO_SVT/INFO/EPS), heuristique.
    room_type: str | None = None


class MultiAssignmentInput(BaseModel):
    """Affectation pédagogique en mode multi-classes.

    Identique à AssignmentInput, mais on documente que `class_id` peut être
    n'importe lequel des classes du payload.
    """

    id: str
    teacher_id: str
    subject_id: str
    subject_label: str
    class_id: str
    class_name: str
    weekly_hours: int = Field(..., ge=0, le=40)
    # Phase 4E4 : type de salle requis (heuristique). None = indifférent.
    required_room_type: str | None = None


class ConstraintsInput(BaseModel):
    """Contraintes paramétrables pilotées par le tenant.

    Toutes optionnelles. Quand un champ est `None`, la contrainte n'est pas
    appliquée.
    """

    # Hard : max d'occurrences d'une matière sur 1 jour pour 1 classe
    max_same_subject_per_day: int | None = Field(None, ge=1, le=10)

    # Soft : pénalité par pattern « cours ⋯ vide ⋯ cours » dans la journée
    # d'une classe. Si None, pas de pénalité.
    no_gaps_weight: int | None = Field(None, ge=0, le=100)

    # Hard : matières dont les séances doivent être consécutives (blocs 2h)
    # quand weekly_hours ≥ 2
    consecutive_subject_ids: list[str] = Field(default_factory=list)

    # Hard : max heures de cours par jour pour chaque prof
    max_hours_per_day_teacher: int | None = Field(None, ge=1, le=12)

    # Phase 4E3 — Hard : max heures CONSÉCUTIVES par jour pour chaque prof.
    # Au-delà, une pause est imposée (fenêtre glissante de max+1 ≤ max).
    max_consecutive_hours_teacher: int | None = Field(None, ge=1, le=8)

    # Phase 4E3 — Hard : pause déjeuner échelonnée. Liste des créneaux de la
    # plage déjeuner ; chaque prof garde ≥ 1 de ces créneaux libre chaque jour.
    # Vide = contrainte inactive.
    teacher_lunch_break_slot_ids: list[str] = Field(default_factory=list)

    # Phase 4E4 — Hard : impose le type de salle. Une affectation dont la
    # matière requiert un type (required_room_type) n'est placée que dans une
    # salle de ce type (NO_ROOM exclu). Inactif si False.
    enforce_room_type: bool = False

    # Phase 4E5 — Soft : récompense le maintien de la même salle (classe) sur
    # créneaux adjacents → moins de changements de salle. None/0 = inactif.
    minimize_room_changes_weight: int | None = Field(None, ge=0, le=100)

    # Phase 4E5 — Soft : pénalise la journée la plus chargée de chaque classe
    # → équilibre la charge, évite les journées trop longues. None/0 = inactif.
    balance_daily_load_weight: int | None = Field(None, ge=0, le=100)


class MultiGenerateRequest(BaseModel):
    """Génération simultanée pour plusieurs classes.

    Toutes les contraintes (anti-conflit prof, salle, dispo) sont gérées
    *au sein du même modèle CSP* : plus de notion de busy_teacher_slots,
    tout est résolu globalement.
    """

    class_ids: list[str] = Field(..., min_length=1)
    slots: list[SlotInput]
    days: list[DayKey] = Field(default=["MON", "TUE", "WED", "THU", "FRI", "SAT"])
    teachers: list[TeacherInput]
    rooms: list[RoomInput] = Field(default_factory=list)
    assignments: list[MultiAssignmentInput]
    max_solve_seconds: float = Field(15.0, ge=1.0, le=600.0)
    # Bonus pour cours consécutifs (heuristique douce).
    # 0 = neutre, >0 = on favorise les blocs 2h.
    consecutive_bonus: int = Field(1, ge=0, le=10)
    # Contraintes paramétrables (phase C)
    constraints: ConstraintsInput = Field(default_factory=ConstraintsInput)
    # Moteur de résolution : "ortools" (default, généraliste) ou "fet"
    # (spécialisé EDT scolaire, excellent anti-gaps).
    engine: Literal["ortools", "fet"] = "ortools"
    # Phase E1 : (jour, slot) interdits pour TOUTES les classes (paramètres
    # établissement : Mercredi matin only, pause déjeuner, samedi off, etc.)
    # Format : [{ "day": "WED", "slot_id": "..." }]
    forbidden_class_slots: list["ForbiddenClassSlot"] = Field(default_factory=list)
    # Phase E2 : contraintes par classe (max/min h/jour)
    class_constraints: list["ClassConstraintInput"] = Field(default_factory=list)


class ForbiddenClassSlot(BaseModel):
    """Une (classe, jour, créneau) interdit. Permet d'appliquer des règles
    différentes par cycle (collège vs lycée n'ont pas les mêmes jours).
    """

    class_id: str
    day: DayKey
    slot_id: str


class ClassConstraintInput(BaseModel):
    """Contraintes par classe (phase E2).

    Toutes optionnelles. Si null/absent → pas de contrainte, on retombe sur
    les défauts globaux.
    """

    class_id: str
    max_hours_per_day: int | None = None
    min_hours_per_day: int | None = None


MultiGenerateRequest.model_rebuild()


class MultiPlacedEntry(BaseModel):
    assignment_id: str
    class_id: str
    subject_id: str
    teacher_id: str
    room_id: str | None = None
    day: DayKey
    slot_id: str


class TeacherDiagnostic(BaseModel):
    """Bilan d'utilisation d'un prof à l'issue du solving."""

    teacher_id: str
    teacher_name: str
    expected_hours: int  # somme weekly_hours sur toutes ses affectations
    placed_hours: int
    compatible_cells: int  # cellules (jour × créneau) dispo × au moins 1 classe ouverte
    utilization_pct: int  # 0-100
    status: Literal["OK", "TIGHT", "DEFICIT", "UNDERLOADED"]
    deficit_hours: int  # max(0, expected - compatible_cells)


class ClassDiagnostic(BaseModel):
    """Bilan par classe : matières non complétées."""

    class_id: str
    class_name: str
    expected_hours: int
    placed_hours: int
    missing_subjects: list[str]  # subject_label, déduplis


class AnalysisOutput(BaseModel):
    teachers: list[TeacherDiagnostic] = []
    classes: list[ClassDiagnostic] = []
    # Suggestions humaines actionables (1 par ligne)
    suggestions: list[str] = []


class MultiGenerateResponse(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "PARTIAL", "INFEASIBLE", "ERROR"]
    solver_time_ms: int
    placed: list[MultiPlacedEntry]
    unplaced: list[UnplacedAssignment]
    message: str = ""
    # Nombre de blocs 2h consécutifs créés (qualité de la solution).
    consecutive_blocks: int = 0
    # Analyse globale (phase 4E2++) pour aider l'admin à débloquer
    # les cas où des heures restent non placées.
    analysis: AnalysisOutput | None = None
