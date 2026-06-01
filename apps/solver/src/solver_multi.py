"""Solveur multi-classes avec affectation salle + heuristique consécutivité.

Variables booléennes :
    x[a, d, s, r] ∈ {0, 1}
    où :
      - a = assignment (teacher × subject × class)
      - d = day (MON..SAT)
      - s = slot
      - r = room (incluant "NO_ROOM" sentinel = pas de salle affectée)

Contraintes dures :
 1. Pour chaque assignment a : sum sur (d, s, r) x[a,d,s,r] ≤ weekly_hours
 2. Pour chaque (classe k, d, s) :
        sum sur (a tels que a.class=k, tous r) x[a,d,s,r] ≤ 1
    (pas 2 cours simultanés dans la même classe)
 3. Pour chaque (teacher t, d, s) :
        sum sur (a tels que a.teacher=t, tous r) x[a,d,s,r] ≤ 1
    (pas de double-booking prof)
 4. Pour chaque (room r ≠ NO_ROOM, d, s) :
        sum sur (a, r=room) x[a,d,s,r] ≤ 1
    (pas 2 cours dans la même salle)
 5. Pour chaque a : si teacher pas dispo sur (d,s), x[a,d,s,*] = 0
 6. Pour chaque a : si s.is_break, x[a,d,s,*] = 0

Objectif :
    maximize:  10 × sum(x)
             +  bonus × sum(pair_consecutive)
"""

import time
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .schemas import (
    MultiAssignmentInput,
    MultiGenerateRequest,
    MultiGenerateResponse,
    MultiPlacedEntry,
    RoomInput,
    SlotInput,
    TeacherInput,
    UnplacedAssignment,
)


NO_ROOM = "NO_ROOM"


def _is_teacher_available(teacher: TeacherInput, day: str, slot: SlotInput) -> bool:
    ranges = teacher.availability.get(day, [])  # type: ignore[arg-type]
    if not ranges:
        return False
    return any(
        r.from_ <= slot.start_time and r.to >= slot.end_time for r in ranges
    )


def solve_multi(request: MultiGenerateRequest) -> MultiGenerateResponse:
    started = time.time()

    teachers_by_id: Dict[str, TeacherInput] = {t.id: t for t in request.teachers}
    placeable_slots: List[SlotInput] = [s for s in request.slots if not s.is_break]
    placeable_slots_sorted = sorted(placeable_slots, key=lambda s: s.start_time)
    days = request.days

    # Rooms : ajout sentinel NO_ROOM
    room_ids: List[str] = [r.id for r in request.rooms] + [NO_ROOM]

    teacher_of: Dict[str, str] = {a.id: a.teacher_id for a in request.assignments}
    class_of: Dict[str, str] = {a.id: a.class_id for a in request.assignments}

    model = cp_model.CpModel()
    x: Dict[Tuple[str, str, str, str], cp_model.IntVar] = {}

    for a in request.assignments:
        teacher = teachers_by_id.get(a.teacher_id)
        if not teacher:
            continue
        for d in days:
            for s in placeable_slots:
                if not _is_teacher_available(teacher, d, s):
                    continue
                for r in room_ids:
                    x[(a.id, d, s.id, r)] = model.NewBoolVar(
                        f"x_{a.id[:6]}_{d}_{s.id[:6]}_{r[:6]}"
                    )

    # C1 : ≤ weekly_hours par assignment
    for a in request.assignments:
        vars_a = [v for k, v in x.items() if k[0] == a.id]
        if vars_a:
            model.Add(sum(vars_a) <= a.weekly_hours)

    # C2 : ≤ 1 cours par (classe × d × s)
    classes = set(class_of.values())
    for cls_id in classes:
        for d in days:
            for s in placeable_slots:
                vars_cell = [
                    v
                    for k, v in x.items()
                    if class_of[k[0]] == cls_id and k[1] == d and k[2] == s.id
                ]
                if vars_cell:
                    model.Add(sum(vars_cell) <= 1)

    # C3 : ≤ 1 cours par (prof × d × s)
    for t_id in teachers_by_id:
        for d in days:
            for s in placeable_slots:
                vars_cell = [
                    v
                    for k, v in x.items()
                    if teacher_of[k[0]] == t_id and k[1] == d and k[2] == s.id
                ]
                if vars_cell:
                    model.Add(sum(vars_cell) <= 1)

    # C4 : ≤ 1 cours par (salle réelle × d × s)
    for r_id in room_ids:
        if r_id == NO_ROOM:
            continue
        for d in days:
            for s in placeable_slots:
                vars_cell = [
                    v
                    for k, v in x.items()
                    if k[3] == r_id and k[1] == d and k[2] == s.id
                ]
                if vars_cell:
                    model.Add(sum(vars_cell) <= 1)

    # Implicite : pour un (a, d, s) donné, au plus une salle est choisie
    # (découle de C2 vu que tous les (a,d,s,r) sont dans la même cellule classe)
    # mais on l'ajoute explicitement pour clarté :
    for a in request.assignments:
        for d in days:
            for s in placeable_slots:
                vars_room = [
                    v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == s.id
                ]
                if vars_room:
                    model.Add(sum(vars_room) <= 1)

    # ─── Contraintes paramétrables (phase C) ─────────────────────────
    cons = request.constraints

    # C7 : MAX_SAME_SUBJECT_PER_DAY — pour chaque (classe × jour × matière)
    if cons.max_same_subject_per_day is not None:
        subj_of = {a.id: a.subject_id for a in request.assignments}
        for cls_id in classes:
            for d in days:
                # Group assignments by subject for this class
                subjects_for_class: Dict[str, List[cp_model.IntVar]] = {}
                for (aid, day, sid, r), v in x.items():
                    if day != d:
                        continue
                    if class_of[aid] != cls_id:
                        continue
                    subj = subj_of[aid]
                    subjects_for_class.setdefault(subj, []).append(v)
                for vars_subj in subjects_for_class.values():
                    if len(vars_subj) > cons.max_same_subject_per_day:
                        model.Add(sum(vars_subj) <= cons.max_same_subject_per_day)

    # C8 : MAX_HOURS_PER_DAY_TEACHER — chaque prof a ≤ N heures/jour
    if cons.max_hours_per_day_teacher is not None:
        for t_id in teachers_by_id:
            for d in days:
                vars_day = [
                    v
                    for k, v in x.items()
                    if teacher_of[k[0]] == t_id and k[1] == d
                ]
                if len(vars_day) > cons.max_hours_per_day_teacher:
                    model.Add(sum(vars_day) <= cons.max_hours_per_day_teacher)

    # C9 : REQUIRES_CONSECUTIVE_SUBJECTS — matières en blocs 2h obligatoires
    # Implémentation : pour ces matières, x[a,d,s] = 1 implique l'existence
    # d'une séance adjacente (s-1 ou s+1) sauf si c'est la seule séance
    # demandée dans la semaine.
    forced_consec_subjects = set(cons.consecutive_subject_ids)
    if forced_consec_subjects:
        # Index slots par position
        slot_pos: Dict[str, int] = {s.id: i for i, s in enumerate(placeable_slots_sorted)}
        for a in request.assignments:
            if a.subject_id not in forced_consec_subjects:
                continue
            if a.weekly_hours < 2:
                continue
            # Total séances de cette affectation
            total = sum(
                1 for k in x if k[0] == a.id
            )
            if total == 0:
                continue
            # Pour chaque (d, s), si occupied, alors (occupied à s-1) OU (occupied à s+1)
            for d in days:
                for s in placeable_slots:
                    pos = slot_pos.get(s.id, -1)
                    if pos < 0:
                        continue
                    # Variable "occupé pour cette assignment sur (d,s)" (somme sur r)
                    here = [v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == s.id]
                    if not here:
                        continue
                    occupied = sum(here)  # 0 ou 1 vu C2

                    neighbor_vars: List[cp_model.IntVar] = []
                    if pos > 0:
                        prev = placeable_slots_sorted[pos - 1]
                        neighbor_vars.extend(
                            v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == prev.id
                        )
                    if pos + 1 < len(placeable_slots_sorted):
                        nxt = placeable_slots_sorted[pos + 1]
                        neighbor_vars.extend(
                            v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == nxt.id
                        )
                    if not neighbor_vars:
                        # Pas de voisin possible → forcer 0
                        model.Add(occupied == 0)
                    else:
                        # occupied = 1 ⇒ au moins 1 voisin = 1
                        # Encodage : occupied ≤ sum(neighbors)
                        model.Add(occupied <= sum(neighbor_vars))

    # Heuristique consécutivité : pour chaque (a, d, paire de slots adjacents),
    # bonus si les deux sont occupés
    pairs: List[cp_model.IntVar] = []
    for a in request.assignments:
        for d in days:
            for i in range(len(placeable_slots_sorted) - 1):
                s1 = placeable_slots_sorted[i]
                s2 = placeable_slots_sorted[i + 1]
                vars_s1 = [
                    v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == s1.id
                ]
                vars_s2 = [
                    v for k, v in x.items() if k[0] == a.id and k[1] == d and k[2] == s2.id
                ]
                if not vars_s1 or not vars_s2:
                    continue
                # Sum (sur les salles) — vaut 0 ou 1 vu C2
                sum_s1 = sum(vars_s1)
                sum_s2 = sum(vars_s2)
                pair = model.NewBoolVar(f"pair_{a.id[:4]}_{d}_{i}")
                # pair = 1 ⇒ sum_s1 = 1 ET sum_s2 = 1
                model.Add(sum_s1 >= pair)
                model.Add(sum_s2 >= pair)
                # pair = 0 ⇒ pas forcé (pas besoin d'une équivalence stricte
                # pour la pondération maximum)
                pairs.append(pair)

    # ─── NO_GAPS : pénalise patterns « cours ⋯ vide ⋯ cours » ────────
    # Pour chaque (classe × jour × triplet de slots adjacents) :
    #   gap[c, d, i] = occupied_class[i] AND NOT occupied_class[i+1] AND occupied_class[i+2]
    # On maximise donc -no_gaps_weight * sum(gap)
    gaps_vars: List[cp_model.IntVar] = []
    if cons.no_gaps_weight is not None and cons.no_gaps_weight > 0:
        # occupied_class[cls, d, slot_id] = somme x sur (a, *, r) tels que class=cls
        for cls_id in classes:
            for d in days:
                # Booléen "occupé" par slot
                occ_by_slot: Dict[str, cp_model.IntVar] = {}
                for i, s in enumerate(placeable_slots_sorted):
                    vars_cell = [
                        v
                        for k, v in x.items()
                        if class_of[k[0]] == cls_id and k[1] == d and k[2] == s.id
                    ]
                    if not vars_cell:
                        # Pas de var = ne sera jamais occupé
                        occ_var = model.NewConstant(0)
                    else:
                        occ_var = model.NewBoolVar(f"occ_{cls_id[:4]}_{d}_{i}")
                        model.Add(occ_var == sum(vars_cell))
                    occ_by_slot[s.id] = occ_var

                # Triplets adjacents
                for i in range(len(placeable_slots_sorted) - 2):
                    a_slot = placeable_slots_sorted[i].id
                    b_slot = placeable_slots_sorted[i + 1].id
                    c_slot = placeable_slots_sorted[i + 2].id
                    gap = model.NewBoolVar(f"gap_{cls_id[:4]}_{d}_{i}")
                    # gap = occ[a] AND (1 - occ[b]) AND occ[c]
                    model.Add(gap <= occ_by_slot[a_slot])
                    model.Add(gap <= 1 - occ_by_slot[b_slot])
                    model.Add(gap <= occ_by_slot[c_slot])
                    # gap = 1 ⇒ occ[a]=1 AND occ[b]=0 AND occ[c]=1 (implication suffisante
                    # pour la pénalisation : on n'a pas besoin du reverse car on minimise)
                    gaps_vars.append(gap)

    # Objectif :
    #   10 par séance placée (motivation principale)
    #   +1 par séance placée dans une salle réelle (préférence vs NO_ROOM)
    #   + consecutive_bonus par bloc 2h consécutif
    #   - no_gaps_weight par gap détecté (si activé)
    if x:
        objective_terms: List[cp_model.IntVar | int] = []
        for (aid, d, sid, r), v in x.items():
            weight = 10
            if r != NO_ROOM:
                weight += 1
            objective_terms.append(v * weight)
        if request.consecutive_bonus > 0 and pairs:
            objective_terms.extend(p * request.consecutive_bonus for p in pairs)
        if cons.no_gaps_weight is not None and cons.no_gaps_weight > 0 and gaps_vars:
            objective_terms.extend(-int(cons.no_gaps_weight) * g for g in gaps_vars)
        model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.max_solve_seconds
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)

    solver_time_ms = int((time.time() - started) * 1000)

    if status == cp_model.INFEASIBLE:
        return MultiGenerateResponse(
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
                    reason="Modèle infaisable.",
                )
                for a in request.assignments
            ],
            message="Aucune solution.",
        )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return MultiGenerateResponse(
            status="ERROR",
            solver_time_ms=solver_time_ms,
            placed=[],
            unplaced=[],
            message=f"Status solver inattendu : {solver.StatusName(status)}",
        )

    # Extraction
    placed: List[MultiPlacedEntry] = []
    placed_hours: Dict[str, int] = {a.id: 0 for a in request.assignments}

    for (aid, d, sid, r), var in x.items():
        if solver.Value(var) != 1:
            continue
        a_obj = next(a for a in request.assignments if a.id == aid)
        placed.append(
            MultiPlacedEntry(
                assignment_id=aid,
                class_id=a_obj.class_id,
                subject_id=a_obj.subject_id,
                teacher_id=a_obj.teacher_id,
                room_id=None if r == NO_ROOM else r,
                day=d,  # type: ignore[arg-type]
                slot_id=sid,
            )
        )
        placed_hours[aid] += 1

    consecutive_blocks = sum(1 for p in pairs if solver.Value(p) == 1)

    unplaced: List[UnplacedAssignment] = []
    for a in request.assignments:
        if placed_hours[a.id] < a.weekly_hours:
            teacher = teachers_by_id.get(a.teacher_id)
            if not teacher:
                reason = "Prof introuvable."
            else:
                free_compat = sum(
                    1
                    for d in days
                    for s in placeable_slots
                    if _is_teacher_available(teacher, d, s)
                )
                if free_compat < a.weekly_hours:
                    reason = (
                        f"Seulement {free_compat} créneau(x) compatibles avec "
                        f"{teacher.name} (besoin {a.weekly_hours})."
                    )
                else:
                    reason = (
                        "Contraintes croisées (autres classes/profs) empêchent "
                        "le placement complet."
                    )
            unplaced.append(
                UnplacedAssignment(
                    assignment_id=a.id,
                    subject_label=a.subject_label,
                    teacher_id=a.teacher_id,
                    requested_hours=a.weekly_hours,
                    placed_hours=placed_hours[a.id],
                    reason=reason,
                )
            )

    if not unplaced:
        out = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        msg = "Toutes les heures placées."
    else:
        out = "PARTIAL"
        total_req = sum(a.weekly_hours for a in request.assignments)
        total_placed = sum(placed_hours.values())
        msg = f"{total_placed}/{total_req} heures placées."

    return MultiGenerateResponse(
        status=out,  # type: ignore[arg-type]
        solver_time_ms=solver_time_ms,
        placed=placed,
        unplaced=unplaced,
        message=msg,
        consecutive_blocks=consecutive_blocks,
    )
