"""Créneaux déjà occupés ailleurs dans l'année.

Une génération porte souvent sur une PARTIE de l'établissement — « je régénère
le collège » — pendant que le lycée garde son emploi du temps. Les professeurs
et les salles, eux, sont partagés : un professeur qui a cours au lycée le mardi
à 10 h n'est pas disponible pour le collège à cette heure-là, et une salle
occupée ne peut pas accueillir deux classes.

Le modèle multi-classes suppose qu'on régénère tout d'un coup et ne connaît que
ce qu'on lui envoie. On rabote donc les disponibilités en amont : c'est la
seule façon de faire respecter l'existant par les DEUX moteurs sans les
modifier tous les deux.
"""

from __future__ import annotations

from typing import Dict, List, Set, Tuple

from .schemas import AvailabilityRange, MultiGenerateRequest


def restrict_availability(req: MultiGenerateRequest) -> None:
    """Retire des disponibilités des professeurs les créneaux déjà pris.

    Modifie la requête sur place. Les plages horaires d'origine sont remplacées
    par une plage par créneau restant : les moteurs testent l'inclusion COMPLÈTE
    du créneau dans une plage, donc découper ainsi ne change rien à ce qu'ils
    acceptaient — seules les cases occupées disparaissent.
    """
    if not req.busy_teacher_slots:
        return

    busy: Dict[str, Set[Tuple[str, str]]] = {}
    for b in req.busy_teacher_slots:
        busy.setdefault(b.teacher_id, set()).add((b.day, b.slot_id))

    placeable = [s for s in req.slots if not s.is_break]

    for teacher in req.teachers:
        taken = busy.get(teacher.id)
        if not taken:
            continue
        rebuilt: Dict[str, List[AvailabilityRange]] = {}
        for day in req.days:
            ranges = teacher.availability.get(day, []) or []
            keep: List[AvailabilityRange] = []
            for slot in placeable:
                if (day, slot.id) in taken:
                    continue
                covered = any(
                    r.from_ <= slot.start_time and slot.end_time <= r.to for r in ranges
                )
                if covered:
                    keep.append(AvailabilityRange(from_=slot.start_time, to=slot.end_time))
            if keep:
                rebuilt[day] = keep
        teacher.availability = rebuilt  # type: ignore[assignment]
