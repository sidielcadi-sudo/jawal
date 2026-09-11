"""Solveur OR-Tools CP-SAT pour la génération d'EDT.

Modèle (phase A — mono-classe) :

Variables booléennes :
    x[a, d, s] ∈ {0, 1} = 1 si l'affectation `a` est placée jour `d`, slot `s`

Contraintes dures :
 1. Pour chaque affectation `a` : sum sur (d, s) x[a,d,s] ≤ weekly_hours
    (≤ et non = pour permettre le mode "PARTIAL" : on relâche puis on
    maximise pour atteindre les heures cibles)
 2. Pour chaque (d, s) : la classe n'accueille qu'UNE occupation.
    Une occupation est soit une séance en classe entière, soit un
    **dédoublement** (toutes les moitiés d'un même groupe-parallèle, qui se
    tiennent ensemble). Deux demi-groupes de français au même créneau ne
    comptent donc que pour une occupation de la classe ; un cours en classe
    entière et un demi-groupe au même créneau restent interdits — les élèves
    du groupe seraient attendus à deux endroits.
 3. Pour chaque (teacher t, d, s) : sum sur a tels que a.teacher = t :
    x[a,d,s] ≤ 1 (anti double-booking prof, déjà ailleurs ou ici)
 4. Si t est busy ailleurs sur (d, s) : x[a,d,s] = 0 pour tout a de t
 5. Si la dispo de t ne couvre pas (d, s) : x[a,d,s] = 0
 6. Si s est une pause : x[a,d,s] = 0

Objectif : maximiser la somme des heures placées (préférence aux affectations
les plus "lourdes" en volume restant). En cas d'infaisabilité stricte du
modèle = (exact volume), on bascule en ≤ et on maximise → mode PARTIAL.
"""

import time
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .schemas import (
    AssignmentInput,
    BusyTeacherSlot,
    GenerateRequest,
    GenerateResponse,
    PlacedEntry,
    SlotInput,
    TeacherInput,
    UnplacedAssignment,
)


def _time_in_range(time_hhmm: str, start: str, end: str) -> bool:
    """True si start <= time_hhmm < end (comparaison lexicographique HH:MM safe)."""
    return start <= time_hhmm < end


def _is_teacher_available(
    teacher: TeacherInput, day: str, slot: SlotInput
) -> bool:
    """Le slot est-il couvert par au moins une plage de dispo du prof ?"""
    ranges = teacher.availability.get(day, [])  # type: ignore[arg-type]
    if not ranges:
        return False
    return any(
        r.from_ <= slot.start_time and r.to >= slot.end_time for r in ranges
    )


def solve(request: GenerateRequest) -> GenerateResponse:
    started = time.time()

    # --- Index ---
    teachers_by_id: Dict[str, TeacherInput] = {t.id: t for t in request.teachers}
    slots_by_id: Dict[str, SlotInput] = {s.id: s for s in request.slots}
    placeable_slots: List[SlotInput] = [s for s in request.slots if not s.is_break]
    days = request.days

    # Set des (teacher, day, slot) bloqués
    busy_set: set[Tuple[str, str, str]] = {
        (b.teacher_id, b.day, b.slot_id) for b in request.busy_teacher_slots
    }

    # --- Modèle ---
    model = cp_model.CpModel()
    x: Dict[Tuple[str, str, str], cp_model.IntVar] = {}

    for a in request.assignments:
        teacher = teachers_by_id.get(a.teacher_id)
        if not teacher:
            # Pas de teacher = on ne peut rien placer
            continue
        for d in days:
            for s in placeable_slots:
                # Filtrage en amont : si non-dispo ou busy, on ne crée pas la var
                if not _is_teacher_available(teacher, d, s):
                    continue
                if (teacher.id, d, s.id) in busy_set:
                    continue
                x[(a.id, d, s.id)] = model.NewBoolVar(
                    f"x_{a.id[:8]}_{d}_{s.id[:8]}"
                )

    # Contrainte 1 : ≤ weekly_hours par affectation
    for a in request.assignments:
        vars_for_a = [x[k] for k in x if k[0] == a.id]
        if vars_for_a:
            model.Add(sum(vars_for_a) <= a.weekly_hours)

    # ── Dédoublements : les moitiés d'un même groupe-parallèle sont liées ──
    #
    # Toutes les affectations d'un `parallel_key` sont placées sur exactement
    # les mêmes créneaux. On les contraint deux à deux à l'égalité, en prenant
    # la première comme référence : c'est ce qui garantit que les deux moitiés
    # de la classe ont cours en même temps.
    bundles: Dict[str, List[AssignmentInput]] = {}
    for a in request.assignments:
        if a.parallel_key:
            bundles.setdefault(a.parallel_key, []).append(a)

    for members in bundles.values():
        head = members[0]
        for other in members[1:]:
            for d in days:
                for s in placeable_slots:
                    v_head = x.get((head.id, d, s.id))
                    v_other = x.get((other.id, d, s.id))
                    if v_head is not None and v_other is not None:
                        model.Add(v_head == v_other)
                    elif v_head is not None:
                        # L'un des profs n'est pas disponible ici : le
                        # dédoublement ne peut pas s'y tenir du tout.
                        model.Add(v_head == 0)
                    elif v_other is not None:
                        model.Add(v_other == 0)

    # Contrainte 2 : ≤ 1 occupation de la classe par (day, slot).
    #
    # Un dédoublement ne compte qu'une fois : on ne retient qu'un représentant
    # par groupe-parallèle, puisque ses membres sont désormais synchronisés.
    representative_of: Dict[str, str] = {
        key: members[0].id for key, members in bundles.items()
    }
    counted_ids = {
        a.id
        for a in request.assignments
        if not a.parallel_key or representative_of.get(a.parallel_key) == a.id
    }
    for d in days:
        for s in placeable_slots:
            vars_for_ds = [
                x[k] for k in x if k[1] == d and k[2] == s.id and k[0] in counted_ids
            ]
            if vars_for_ds:
                model.Add(sum(vars_for_ds) <= 1)

    # Contrainte 3 : ≤ 1 cours par (teacher, day, slot) — utile si plusieurs
    # affectations de la classe ont le même prof
    teacher_of_assignment: Dict[str, str] = {
        a.id: a.teacher_id for a in request.assignments
    }
    for d in days:
        for s in placeable_slots:
            by_teacher: Dict[str, List[cp_model.IntVar]] = {}
            for (aid, day, sid), var in x.items():
                if day == d and sid == s.id:
                    t_id = teacher_of_assignment[aid]
                    by_teacher.setdefault(t_id, []).append(var)
            for vars_for_t in by_teacher.values():
                if len(vars_for_t) > 1:
                    model.Add(sum(vars_for_t) <= 1)

    # Objectif : maximiser la somme des x → place le plus possible
    # Pondération : +10 par heure placée. Pas de soft constraints en phase A.
    if x:
        model.Maximize(sum(x.values()) * 10)

    # --- Solve ---
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.max_solve_seconds
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)

    solver_time_ms = int((time.time() - started) * 1000)

    if status == cp_model.INFEASIBLE:
        return GenerateResponse(
            status="INFEASIBLE",
            solver_time_ms=solver_time_ms,
            placed=[],
            unplaced=[
                UnplacedAssignment(
                    assignment_id=a.id,
                    subject_label=a.subject_label,
                    teacher_id=a.teacher_id,
                    requested_hours=a.weekly_hours,
                    placed_hours=0,
                    reason="Modèle infaisable (contraintes trop strictes).",
                )
                for a in request.assignments
            ],
            message="Aucune solution n'a été trouvée.",
        )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return GenerateResponse(
            status="ERROR",
            solver_time_ms=solver_time_ms,
            placed=[],
            unplaced=[],
            message=f"Status solver inattendu : {solver.StatusName(status)}",
        )

    # --- Extraction de la solution ---
    placed: List[PlacedEntry] = []
    placed_hours_by_assignment: Dict[str, int] = {a.id: 0 for a in request.assignments}

    for (aid, d, sid), var in x.items():
        if solver.Value(var) == 1:
            a_obj = next(a for a in request.assignments if a.id == aid)
            placed.append(
                PlacedEntry(
                    assignment_id=aid,
                    class_id=request.class_id,
                    subject_id=a_obj.subject_id,
                    teacher_id=a_obj.teacher_id,
                    day=d,  # type: ignore[arg-type]
                    slot_id=sid,
                    group_id=a_obj.group_id,
                )
            )
            placed_hours_by_assignment[aid] += 1

    unplaced: List[UnplacedAssignment] = []
    for a in request.assignments:
        placed_h = placed_hours_by_assignment[a.id]
        if placed_h < a.weekly_hours:
            teacher = teachers_by_id.get(a.teacher_id)
            if not teacher:
                reason = "Prof introuvable dans la liste fournie."
            else:
                # Compter slots où le prof est libre + dispo
                free_compatible = sum(
                    1
                    for d in days
                    for s in placeable_slots
                    if _is_teacher_available(teacher, d, s)
                    and (teacher.id, d, s.id) not in busy_set
                )
                if free_compatible < a.weekly_hours:
                    reason = (
                        f"Seulement {free_compatible} créneau(x) compatibles "
                        f"avec la dispo de {teacher.name} (besoin {a.weekly_hours})."
                    )
                else:
                    reason = (
                        "Optimum atteint mais contraintes croisées (anti-conflit, "
                        "limite 1 cours/créneau) empêchent le placement complet."
                    )
            unplaced.append(
                UnplacedAssignment(
                    assignment_id=a.id,
                    subject_label=a.subject_label,
                    teacher_id=a.teacher_id,
                    requested_hours=a.weekly_hours,
                    placed_hours=placed_h,
                    reason=reason,
                )
            )

    if not unplaced:
        out_status = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        msg = "Toutes les heures placées."
    else:
        out_status = "PARTIAL"
        total_requested = sum(a.weekly_hours for a in request.assignments)
        total_placed = sum(placed_hours_by_assignment.values())
        msg = f"{total_placed}/{total_requested} heures placées."

    return GenerateResponse(
        status=out_status,  # type: ignore[arg-type]
        solver_time_ms=solver_time_ms,
        placed=placed,
        unplaced=unplaced,
        message=msg,
    )
