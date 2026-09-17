"""Calcul d'une analyse globale post-solving.

Utilisé par les deux moteurs (OR-Tools et FET) pour produire le panneau
diagnostic qui s'affiche dans l'UI après chaque génération.

Permet à l'admin d'identifier les leviers d'action concrets quand des
heures restent non placées.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from .schemas import (
    AnalysisOutput,
    ClassDiagnostic,
    ForbiddenClassSlot,
    MultiAssignmentInput,
    MultiGenerateRequest,
    MultiPlacedEntry,
    SlotInput,
    TeacherDiagnostic,
    TeacherInput,
)


def _is_teacher_available_on(t: TeacherInput, day: str, slot: SlotInput) -> bool:
    ranges = t.availability.get(day, [])  # type: ignore[arg-type]
    if not ranges:
        return False
    return any(r.from_ <= slot.start_time and r.to >= slot.end_time for r in ranges)


def compute_analysis(
    request: MultiGenerateRequest,
    placed: List[MultiPlacedEntry],
) -> AnalysisOutput:
    placeable = [s for s in request.slots if not s.is_break]
    forbidden_set: set[Tuple[str, str, str]] = {
        (f.class_id, f.day, f.slot_id) for f in request.forbidden_class_slots
    }

    # 1. Comptage heures placées par assignment + par prof + par classe
    placed_per_assignment: Dict[str, int] = {a.id: 0 for a in request.assignments}
    for p in placed:
        placed_per_assignment[p.assignment_id] = placed_per_assignment.get(p.assignment_id, 0) + 1

    expected_per_teacher: Dict[str, int] = {}
    placed_per_teacher: Dict[str, int] = {}
    expected_per_class: Dict[str, int] = {}
    placed_per_class: Dict[str, int] = {}
    teacher_assignments: Dict[str, List[MultiAssignmentInput]] = {}
    for a in request.assignments:
        expected_per_teacher[a.teacher_id] = expected_per_teacher.get(a.teacher_id, 0) + a.weekly_hours
        placed_per_teacher[a.teacher_id] = placed_per_teacher.get(a.teacher_id, 0) + placed_per_assignment[a.id]
        expected_per_class[a.class_id] = expected_per_class.get(a.class_id, 0) + a.weekly_hours
        placed_per_class[a.class_id] = placed_per_class.get(a.class_id, 0) + placed_per_assignment[a.id]
        teacher_assignments.setdefault(a.teacher_id, []).append(a)

    # 2. Cellules globalement compatibles par prof
    teacher_compat_cells: Dict[str, int] = {}
    for t in request.teachers:
        cnt = 0
        for d in request.days:
            for s in placeable:
                if not _is_teacher_available_on(t, d, s):
                    continue
                if any(
                    (a.class_id, d, s.id) not in forbidden_set
                    for a in teacher_assignments.get(t.id, [])
                ):
                    cnt += 1
        teacher_compat_cells[t.id] = cnt

    # 3. Diagnostic par prof
    teacher_diags: List[TeacherDiagnostic] = []
    for t in request.teachers:
        expected = expected_per_teacher.get(t.id, 0)
        placed_h = placed_per_teacher.get(t.id, 0)
        compat = teacher_compat_cells.get(t.id, 0)
        if expected == 0:
            util = 0
            status = "UNDERLOADED"
        else:
            # Taux d'OCCUPATION, pas taux de placement : la colonne voisine
            # s'appelle « Capacité », et un professeur dont les 5 h ont toutes
            # été placées n'est pas « saturé » s'il lui reste 31 créneaux
            # libres. Rapporter le placement à lui-même donnait 100 % à tout le
            # monde, et un bilan qui désignait vingt-trois professeurs saturés
            # là où aucun ne l'était.
            util = int(round((expected / compat) * 100)) if compat else 100
            if compat < expected:
                status = "DEFICIT"
            elif util >= 90:
                status = "TIGHT"
            elif util >= 60:
                status = "OK"
            else:
                status = "UNDERLOADED"
        teacher_diags.append(
            TeacherDiagnostic(
                teacher_id=t.id,
                teacher_name=t.name,
                expected_hours=expected,
                placed_hours=placed_h,
                compatible_cells=compat,
                utilization_pct=util,
                status=status,
                deficit_hours=max(0, expected - compat),
            )
        )

    # 4. Diagnostic par classe (uniquement celles avec missing)
    missing_per_class: Dict[str, List[str]] = {}
    for a in request.assignments:
        if placed_per_assignment[a.id] < a.weekly_hours:
            missing_per_class.setdefault(a.class_id, []).append(a.subject_label)
    class_diags: List[ClassDiagnostic] = []
    class_names = {a.class_id: a.class_name for a in request.assignments}
    for cls_id in request.class_ids:
        miss = missing_per_class.get(cls_id, [])
        if not miss:
            continue
        # Dédup en gardant l'ordre
        seen: set[str] = set()
        unique = []
        for label in miss:
            if label not in seen:
                unique.append(label)
                seen.add(label)
        class_diags.append(
            ClassDiagnostic(
                class_id=cls_id,
                class_name=class_names.get(cls_id, cls_id),
                expected_hours=expected_per_class.get(cls_id, 0),
                placed_hours=placed_per_class.get(cls_id, 0),
                missing_subjects=unique,
            )
        )

    # 5. Suggestions actionables
    suggestions: List[str] = []

    deficit_teachers = [td for td in teacher_diags if td.status == "DEFICIT"]
    tight_teachers = [td for td in teacher_diags if td.status == "TIGHT"]

    if deficit_teachers:
        for td in deficit_teachers[:3]:
            suggestions.append(
                f"⚠ {td.teacher_name} est sous-dimensionné·e : {td.expected_hours} h "
                f"attendues mais seulement {td.compatible_cells} créneaux dispos "
                f"(déficit ≈ {td.deficit_hours} h). → Ajouter un assistant pour "
                f"cette matière ou augmenter ses disponibilités."
            )

    if tight_teachers and class_diags:
        # Identifier les profs tight qui apparaissent dans les classes en manque
        impacted_teacher_names: set[str] = set()
        for cd in class_diags:
            # Pour chaque matière manquante, trouve le prof
            for a in request.assignments:
                if a.class_id == cd.class_id and a.subject_label in cd.missing_subjects:
                    td = next((x for x in teacher_diags if x.teacher_id == a.teacher_id), None)
                    if td and td.status == "TIGHT":
                        impacted_teacher_names.add(td.teacher_name)
        for name in list(impacted_teacher_names)[:3]:
            suggestions.append(
                f"⚠ {name} est saturé·e (≥ 90 % d'utilisation). → Soit lever une "
                f"contrainte sur une des classes (jour OFF, plages interdites), "
                f"soit dédoubler le poste en partageant avec un autre prof."
            )

    if class_diags:
        for cd in class_diags[:5]:
            if cd.placed_hours == cd.expected_hours:
                continue
            short = cd.expected_hours - cd.placed_hours
            suggestions.append(
                f"📋 {cd.class_name} : {short} h non placées ({', '.join(cd.missing_subjects)}). "
                f"→ Vérifier les contraintes spécifiques de cette classe "
                f"(/admin/classes/[id]/constraints) ou ses paramètres de cycle."
            )

    if not suggestions and not class_diags:
        suggestions.append("✅ Génération complète, aucun ajustement nécessaire.")
    elif not suggestions:
        suggestions.append(
            "Le solveur a prouvé que la configuration actuelle est mathématiquement "
            "infaisable. Essayez le moteur alternatif (FET vs OR-Tools) ou relâchez "
            "une contrainte."
        )

    return AnalysisOutput(
        teachers=teacher_diags,
        classes=class_diags,
        suggestions=suggestions,
    )
