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

from .analysis import compute_analysis
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

    # Phase 4E4 : type de salle par salle + salles autorisées par affectation.
    # Si enforce_room_type et la matière requiert un type, on restreint aux
    # salles compatibles (NO_ROOM exclu : un labo/info est obligatoire).
    room_type_of: Dict[str, str | None] = {r.id: r.room_type for r in request.rooms}
    enforce_rt = request.constraints.enforce_room_type
    allowed_rooms: Dict[str, List[str]] = {}
    for a in request.assignments:
        if enforce_rt and a.required_room_type:
            allowed_rooms[a.id] = [
                rid
                for rid in room_ids
                if rid != NO_ROOM and room_type_of.get(rid) == a.required_room_type
            ]
        else:
            allowed_rooms[a.id] = room_ids

    teacher_of: Dict[str, str] = {a.id: a.teacher_id for a in request.assignments}
    class_of: Dict[str, str] = {a.id: a.class_id for a in request.assignments}

    # Phase E1 : (class_id, day, slot) interdits — permet le multi-cycles
    # (collège mercredi matin only, lycée samedi off, etc.)
    forbidden_set: set[Tuple[str, str, str]] = {
        (f.class_id, f.day, f.slot_id) for f in request.forbidden_class_slots
    }

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
                # Phase E1 : skip si (class, day, slot) interdit (par cycle)
                if (a.class_id, d, s.id) in forbidden_set:
                    continue
                # Phase 4E4 : restreint aux salles compatibles avec la matière.
                for r in allowed_rooms[a.id]:
                    x[(a.id, d, s.id, r)] = model.NewBoolVar(
                        f"x_{a.id[:6]}_{d}_{s.id[:6]}_{r[:6]}"
                    )

    # C1 : ≤ weekly_hours par assignment
    for a in request.assignments:
        vars_a = [v for k, v in x.items() if k[0] == a.id]
        if vars_a:
            model.Add(sum(vars_a) <= a.weekly_hours)

    # Phase E2 : contraintes par classe (max/min h/jour)
    max_h_per_class: Dict[str, int] = {}
    min_h_per_class: Dict[str, int] = {}
    for cc in request.class_constraints:
        if cc.max_hours_per_day is not None:
            max_h_per_class[cc.class_id] = cc.max_hours_per_day
        if cc.min_hours_per_day is not None:
            min_h_per_class[cc.class_id] = cc.min_hours_per_day

    # ── Dédoublements : les moitiés d'un même groupe-parallèle sont liées ──
    #
    # Les affectations partageant un `parallel_key` sont placées sur exactement
    # les mêmes (jour, créneau, salle non comprise) : les deux moitiés d'une
    # classe se tiennent au même moment, sinon l'autre moitié n'aurait rien à
    # faire pendant ce temps. On lie la SOMME sur les salles, un demi-groupe
    # pouvant occuper une autre salle que l'autre.
    bundles: Dict[str, List[str]] = {}
    for a in request.assignments:
        if a.parallel_key:
            bundles.setdefault(a.parallel_key, []).append(a.id)

    # Index (affectation, jour, créneau) → variables, construit UNE fois.
    #
    # Balayer `x` à l'intérieur des boucles coûtait O(bundles × jours × créneaux
    # × |x|). Avec une centaine d'affectations et une quinzaine de salles, la
    # construction du modèle consommait tout le temps imparti et le solveur
    # rendait une solution vide — 0 heure placée sur 284.
    # Ces index remplacent des balayages de `x` imbriqués dans des boucles.
    # Le coût était rédhibitoire : la contrainte « une seule salle par séance »
    # scannait les ~70 000 variables pour chacune des 117 affectations × 42
    # cellules, soit plusieurs centaines de millions d'opérations Python. La
    # construction du modèle prenait deux minutes et mangeait le temps destiné
    # à la recherche — le solveur rendait alors une solution vide.
    by_ads: Dict[Tuple[str, str, str], List[cp_model.IntVar]] = {}
    by_tds: Dict[Tuple[str, str, str], List[cp_model.IntVar]] = {}
    by_rds: Dict[Tuple[str, str, str], List[cp_model.IntVar]] = {}
    by_cd: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
    for (aid, day, sid, room), var in x.items():
        by_ads.setdefault((aid, day, sid), []).append(var)
        by_tds.setdefault((teacher_of[aid], day, sid), []).append(var)
        if room != NO_ROOM:
            by_rds.setdefault((room, day, sid), []).append(var)
        by_cd.setdefault((class_of[aid], day), []).append(var)

    # Une variable de décision PAR dédoublement et par créneau : `z` vaut 1
    # quand le dédoublement se tient là, et chaque moitié y est liée.
    #
    # Lier les moitiés deux à deux (`sum(A) == sum(B)`) exprimait la même chose,
    # mais CP-SAT le propageait mal : sur dix classes, il rendait une solution
    # vide — 0 heure placée sur 284 — alors qu'une classe seule passait. Avec
    # `z`, le solveur a un point de décision explicite sur lequel brancher, et
    # la contrainte d'occupation de la classe s'écrit directement dessus.
    bundle_z: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
    for key, member_ids in bundles.items():
        for d in days:
            for s in placeable_slots:
                z = model.NewBoolVar(f"z_{key[:8]}_{d}_{s.id[:6]}")
                bundle_z[(key, d, s.id)] = z
                for m in member_ids:
                    vars_m = by_ads.get((m, d, s.id))
                    if vars_m:
                        model.Add(sum(vars_m) == z)
                    else:
                        # Un des profs ne peut pas être là : le dédoublement ne
                        # peut pas s'y tenir du tout.
                        model.Add(z == 0)

    # ── Séances imposées : la case déclarée, et rien d'autre ──────────────
    #
    # Une séance dédoublée est déclarée dans l'établissement, pas déduite d'un
    # volume : quand la case est donnée, on l'impose ET on interdit les autres.
    # Autoriser un repli ailleurs viderait la déclaration de son sens — c'est
    # précisément le comportement qu'on remplace.
    #
    # Si la case est inatteignable (prof indisponible, créneau de pause), la
    # séance reste non placée et ressort dans `unplaced` : mieux vaut une
    # ligne signalée qu'un emploi du temps entier déclaré infaisable.
    ads_by_a: Dict[str, List[Tuple[str, str, List[cp_model.IntVar]]]] = {}
    for (aid, day, sid), vars_list in by_ads.items():
        ads_by_a.setdefault(aid, []).append((day, sid, vars_list))

    for a in request.assignments:
        if not a.fixed_slots:
            continue
        wanted = {(f.day, f.slot_id) for f in a.fixed_slots}
        for day, sid, vars_list in ads_by_a.get(a.id, []):
            if (day, sid) in wanted:
                model.Add(sum(vars_list) == 1)
            else:
                model.Add(sum(vars_list) == 0)

    # C2 : ≤ 1 occupation de la classe par (classe × d × s).
    #
    # Un dédoublement ne compte qu'une fois — ses membres étant synchronisés,
    # on ne retient qu'un représentant par groupe-parallèle. Deux demi-groupes
    # au même créneau occupent bien la classe une seule fois ; en revanche un
    # cours en classe entière ne peut pas cohabiter avec un demi-groupe.
    # L'occupation de la classe compte les séances ordinaires et, pour les
    # dédoublements, la variable `z` — une seule fois, quel que soit le nombre
    # de groupes.
    counted_ids = {a.id for a in request.assignments if not a.parallel_key}
    classes = set(class_of.values())

    # Même souci de coût : on regroupe par (classe, jour, créneau) en une passe.
    by_cds: Dict[Tuple[str, str, str], List[cp_model.IntVar]] = {}
    for (aid, day, sid), vars_list in by_ads.items():
        if aid not in counted_ids:
            continue
        by_cds.setdefault((class_of[aid], day, sid), []).extend(vars_list)

    for key, member_ids in bundles.items():
        cls_id = class_of[member_ids[0]]
        for d in days:
            for s in placeable_slots:
                by_cds.setdefault((cls_id, d, s.id), []).append(bundle_z[(key, d, s.id)])

    for vars_cell in by_cds.values():
        if vars_cell:
            model.Add(sum(vars_cell) <= 1)

    # E2 : MAX heures par jour par classe (dure)
    for cls_id, max_h in max_h_per_class.items():
        for d in days:
            vars_day = by_cd.get((cls_id, d))
            if vars_day:
                model.Add(sum(vars_day) <= max_h)

    # E2 : MIN heures par jour par classe (dure, conditionnel)
    # Sémantique : SI la journée a au moins 1 cours, alors elle en a ≥ min_h.
    # Encodage : pour chaque slot s, x[cls, d, s, *] ≤ min_h × (somme totale > 0)
    # Plus simple : on impose un "indicateur" y_cls_d = 1 si au moins 1 cours
    # ce jour, puis sum ≥ min_h * y. On encode ça naturellement avec une
    # variable booléenne et reified constraints.
    for cls_id, min_h in min_h_per_class.items():
        for d in days:
            vars_day = by_cd.get((cls_id, d))
            if not vars_day:
                continue
            # y = 1 ⇔ au moins 1 cours ce (cls, d)
            y = model.NewBoolVar(f"day_active_{cls_id[:4]}_{d}")
            # y = 1 ⇒ sum ≥ 1 (suit naturellement, on l'ajoute pour cohérence)
            model.Add(sum(vars_day) >= 1).OnlyEnforceIf(y)
            model.Add(sum(vars_day) == 0).OnlyEnforceIf(y.Not())
            # y = 1 ⇒ sum ≥ min_h
            model.Add(sum(vars_day) >= min_h).OnlyEnforceIf(y)

    # C3 : ≤ 1 cours par (prof × d × s)
    for vars_cell in by_tds.values():
        if len(vars_cell) > 1:
            model.Add(sum(vars_cell) <= 1)

    # C4 : ≤ 1 cours par (salle réelle × d × s)
    for vars_cell in by_rds.values():
        if len(vars_cell) > 1:
            model.Add(sum(vars_cell) <= 1)

    # Implicite : pour un (a, d, s) donné, au plus une salle est choisie
    # (découle de C2 vu que tous les (a,d,s,r) sont dans la même cellule classe)
    # mais on l'ajoute explicitement pour clarté :
    for vars_room in by_ads.values():
        if len(vars_room) > 1:
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

    # E3a : MAX_CONSECUTIVE_HOURS_TEACHER — pas plus de N heures d'affilée.
    # Pour chaque (prof, jour), sur toute fenêtre glissante de (max+1) créneaux
    # adjacents triés par heure, la somme des heures enseignées ≤ max.
    if cons.max_consecutive_hours_teacher is not None:
        maxc = cons.max_consecutive_hours_teacher
        n_slots = len(placeable_slots_sorted)
        for t_id in teachers_by_id:
            for d in days:
                # Occupation (0/1 vu C3) du prof par créneau, dans l'ordre horaire.
                occ_by_pos: List[object] = []
                for s in placeable_slots_sorted:
                    vs = [
                        v
                        for k, v in x.items()
                        if teacher_of[k[0]] == t_id and k[1] == d and k[2] == s.id
                    ]
                    occ_by_pos.append(sum(vs) if vs else 0)
                for i in range(0, n_slots - maxc):
                    window = occ_by_pos[i : i + maxc + 1]
                    # Inutile si la fenêtre n'a aucune variable (que des 0 constants).
                    if any(not isinstance(w, int) for w in window):
                        model.Add(sum(window) <= maxc)

    # E3b : TEACHER_LUNCH_BREAK — déjeuner échelonné. Chaque prof garde ≥ 1
    # créneau libre parmi les créneaux déjeuner, chaque jour. Encodage dur :
    # somme des créneaux déjeuner occupés ≤ (nb créneaux déjeuner − 1).
    lunch_ids = set(cons.teacher_lunch_break_slot_ids)
    if lunch_ids:
        lunch_present = [s for s in placeable_slots_sorted if s.id in lunch_ids]
        k_lunch = len(lunch_present)
        if k_lunch >= 1:
            for t_id in teachers_by_id:
                for d in days:
                    vs = [
                        v
                        for k, v in x.items()
                        if teacher_of[k[0]] == t_id and k[1] == d and k[2] in lunch_ids
                    ]
                    if vs:
                        model.Add(sum(vs) <= k_lunch - 1)

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

    # ─── E5a : MINIMIZE_ROOM_CHANGES — récompense le maintien de la même salle
    # sur deux créneaux adjacents d'une classe (moins de déménagements). ──────
    room_change_rewards: List[cp_model.IntVar] = []
    if cons.minimize_room_changes_weight and cons.minimize_room_changes_weight > 0:
        # Index (classe, jour, slot, salle réelle) → vars ; somme = la classe
        # occupe cette salle à ce créneau (0/1 vu C2 + une seule salle).
        cell_room_vars: Dict[Tuple[str, str, str, str], List[cp_model.IntVar]] = {}
        for (aid, d, sid, r), v in x.items():
            if r == NO_ROOM:
                continue
            cell_room_vars.setdefault((class_of[aid], d, sid, r), []).append(v)
        real_rooms = [r for r in room_ids if r != NO_ROOM]
        for cls_id in classes:
            for d in days:
                for i in range(len(placeable_slots_sorted) - 1):
                    s1 = placeable_slots_sorted[i].id
                    s2 = placeable_slots_sorted[i + 1].id
                    for r in real_rooms:
                        v1 = cell_room_vars.get((cls_id, d, s1, r))
                        v2 = cell_room_vars.get((cls_id, d, s2, r))
                        if not v1 or not v2:
                            continue
                        same = model.NewBoolVar(f"same_{cls_id[:4]}_{d}_{i}_{r[:4]}")
                        model.Add(same <= sum(v1))
                        model.Add(same <= sum(v2))
                        room_change_rewards.append(same)

    # ─── E5b : BALANCE_DAILY_LOAD — pénalise la journée la plus chargée de
    # chaque classe (répartit les heures, évite les journées trop longues). ──
    balance_penalties: List[cp_model.IntVar] = []
    if cons.balance_daily_load_weight and cons.balance_daily_load_weight > 0:
        n_slots_total = len(placeable_slots_sorted)
        for cls_id in classes:
            day_loads: List[object] = []
            for d in days:
                vars_day = [
                    v for k, v in x.items() if class_of[k[0]] == cls_id and k[1] == d
                ]
                if vars_day:
                    day_loads.append(sum(vars_day))
            if len(day_loads) > 1:
                maxload = model.NewIntVar(0, n_slots_total, f"maxload_{cls_id[:4]}")
                for dl in day_loads:
                    model.Add(maxload >= dl)
                balance_penalties.append(maxload)

    # Objectif :
    #   10 par séance placée (motivation principale)
    #   +1 par séance placée dans une salle réelle (préférence vs NO_ROOM)
    #   + consecutive_bonus par bloc 2h consécutif
    #   - no_gaps_weight par gap détecté (si activé)
    #   + minimize_room_changes_weight par salle conservée (E5a)
    #   - balance_daily_load_weight × journée la plus chargée par classe (E5b)
    if x:
        # ── Dominance du placement sur les préférences ──────────────────────
        #
        # Placer les cours n'est pas une préférence parmi d'autres : c'est
        # l'objet même de la génération. Or les pénalités douces (trous,
        # équilibrage de la journée la plus chargée) sont paramétrées jusqu'à
        # 100, quand une heure placée ne rapportait que 10. Sur dix classes, la
        # somme des pénalités dépassait largement le gain, et l'optimum du
        # modèle était de NE RIEN PLACER — le solveur rendait un emploi du
        # temps vide, ce qui est mathématiquement juste et pratiquement absurde.
        #
        # On donne donc au placement un poids strictement supérieur au total des
        # pénalités possibles : une heure de plus l'emporte toujours, quels que
        # soient les réglages du tenant. Les préférences continuent d'arbitrer
        # entre deux solutions plaçant le même nombre d'heures.
        max_soft = 0
        if cons.no_gaps_weight:
            max_soft += int(cons.no_gaps_weight) * len(gaps_vars)
        if cons.balance_daily_load_weight:
            max_soft += (
                int(cons.balance_daily_load_weight)
                * len(balance_penalties)
                * max(1, len(placeable_slots))
            )
        if request.consecutive_bonus > 0:
            max_soft += request.consecutive_bonus * len(pairs)
        if cons.minimize_room_changes_weight:
            max_soft += int(cons.minimize_room_changes_weight) * len(room_change_rewards)
        placement_weight = max_soft + 10

        objective_terms: List[cp_model.IntVar | int] = []
        for (aid, d, sid, r), v in x.items():
            weight = placement_weight
            if r != NO_ROOM:
                # Départage à égalité d'heures : une salle attribuée vaut mieux
                # qu'une séance sans salle.
                weight += 1
            objective_terms.append(v * weight)
        if request.consecutive_bonus > 0 and pairs:
            objective_terms.extend(p * request.consecutive_bonus for p in pairs)
        if cons.no_gaps_weight is not None and cons.no_gaps_weight > 0 and gaps_vars:
            objective_terms.extend(-int(cons.no_gaps_weight) * g for g in gaps_vars)
        if cons.minimize_room_changes_weight and room_change_rewards:
            w_rc = int(cons.minimize_room_changes_weight)
            objective_terms.extend(w_rc * s for s in room_change_rewards)
        if cons.balance_daily_load_weight and balance_penalties:
            w_bal = int(cons.balance_daily_load_weight)
            objective_terms.extend(-w_bal * m for m in balance_penalties)
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
                group_id=a_obj.group_id,
            )
        )
        placed_hours[aid] += 1

    consecutive_blocks = sum(1 for p in pairs if solver.Value(p) == 1)

    # ─── Diagnostic enrichi pour les unplaced ──────────────────────
    # Pré-calculs réutilisés pour identifier la cause précise.

    # Heures totales attendues par prof
    teacher_total_expected: Dict[str, int] = {}
    for ax in request.assignments:
        teacher_total_expected[ax.teacher_id] = (
            teacher_total_expected.get(ax.teacher_id, 0) + ax.weekly_hours
        )

    # Heures effectivement placées par prof
    teacher_total_placed: Dict[str, int] = {}
    for ax in request.assignments:
        teacher_total_placed[ax.teacher_id] = (
            teacher_total_placed.get(ax.teacher_id, 0) + placed_hours[ax.id]
        )

    # Cellules compatibles globalement par prof (dispo + au moins une classe
    # autorisée à ce créneau)
    teacher_total_compat_cells: Dict[str, int] = {}
    for t in request.teachers:
        cnt = 0
        for d in days:
            for s in placeable_slots:
                if not _is_teacher_available(t, d, s):
                    continue
                # Cellule utile s'il existe au moins UNE classe du prof
                # qui peut accueillir un cours à ce (d, s)
                if any(
                    (ax.class_id, d, s.id) not in forbidden_set
                    for ax in request.assignments
                    if ax.teacher_id == t.id
                ):
                    cnt += 1
        teacher_total_compat_cells[t.id] = cnt

    unplaced: List[UnplacedAssignment] = []
    for a in request.assignments:
        missing = a.weekly_hours - placed_hours[a.id]
        if missing <= 0:
            continue

        teacher = teachers_by_id.get(a.teacher_id)
        if enforce_rt and a.required_room_type and not allowed_rooms[a.id]:
            reason = (
                f"Aucune salle de type {a.required_room_type} pour "
                f"{a.subject_label}. → Étiquetez une salle compatible "
                f"(code/label/équipement) ou désactivez la contrainte « type de "
                f"salle »."
            )
        elif not teacher:
            reason = "Prof introuvable dans la liste fournie."
        else:
            # Cellules compatibles SPÉCIFIQUEMENT pour ce triplet (classe × prof × subject)
            class_compat = sum(
                1
                for d in days
                for s in placeable_slots
                if _is_teacher_available(teacher, d, s)
                and (a.class_id, d, s.id) not in forbidden_set
            )
            t_expected = teacher_total_expected.get(a.teacher_id, 0)
            t_placed = teacher_total_placed.get(a.teacher_id, 0)
            t_compat = teacher_total_compat_cells.get(a.teacher_id, 0)
            t_missing = t_expected - t_placed

            if class_compat < missing:
                # Pas assez de créneaux pour cette classe spécifiquement
                reason = (
                    f"Seulement {class_compat} créneau(x) compatibles dans cette "
                    f"classe pour {teacher.name} (besoin {missing}). "
                    f"→ Réduire les jours/plages interdits de cette classe ou "
                    f"libérer la dispo du prof."
                )
            elif t_missing > 0 and t_compat < t_expected:
                # Le prof est globalement saturé
                deficit = t_expected - t_compat
                reason = (
                    f"{teacher.name} a {t_expected} h à enseigner sur l'ensemble "
                    f"de ses classes, mais seulement {t_compat} créneaux dispos "
                    f"({t_placed} placées). Déficit ≈ {deficit} h. "
                    f"→ Ajouter un autre prof ou augmenter ses disponibilités."
                )
            elif t_missing > 0:
                # Contraintes croisées entre les classes du prof
                reason = (
                    f"{teacher.name} ({t_placed}/{t_expected} h placées) est en "
                    f"conflit avec ses autres classes au mêmes créneaux. "
                    f"→ Libérer un créneau dans une autre classe enseignée par "
                    f"ce prof, ou dédoubler le poste."
                )
            else:
                # Tout placé pour le prof, mais cette classe spécifique pas complète
                # → conflit avec d'autres profs/salles dans cette classe
                reason = (
                    f"Cette classe a déjà ses créneaux occupés par d'autres "
                    f"matières aux moments où {teacher.name} est dispo. "
                    f"→ Réorganiser les autres affectations de cette classe."
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

    analysis = compute_analysis(request, placed)

    return MultiGenerateResponse(
        status=out,  # type: ignore[arg-type]
        solver_time_ms=solver_time_ms,
        placed=placed,
        unplaced=unplaced,
        message=msg,
        consecutive_blocks=consecutive_blocks,
        analysis=analysis,
    )
