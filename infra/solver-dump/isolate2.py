"""Retire chaque type de contrainte à tour de rôle, puis toutes."""

import subprocess
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

SRC = Path("/tmp/jawal-dump/last_failed.fet")


def run(tree, label):
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "in.fet"
        tree.write(f, encoding="utf-8", xml_declaration=True)
        out = Path(d) / "out"
        out.mkdir()
        p = subprocess.run(
            ["fet-cl", f"--inputfile={f}", f"--outputdir={out}", "--timelimitseconds=5"],
            capture_output=True, text=True, timeout=120,
        )
        lines = (p.stdout or "").strip().splitlines()
        print(f"  {label:<52} rc={p.returncode}  {(lines[-1] if lines else '')[:70]}")
        return p.returncode


root0 = ET.parse(SRC).getroot()
print("Contraintes présentes :")
for lst in ("Time_Constraints_List", "Space_Constraints_List"):
    node = root0.find(lst)
    if node is None:
        continue
    c = Counter(child.tag for child in node)
    for tag, n in c.most_common():
        print(f"   {lst[:5]:<6} {tag:<52} ×{n}")

print("\nRetrait ciblé :")
kinds = set()
for lst in ("Time_Constraints_List", "Space_Constraints_List"):
    node = root0.find(lst)
    if node is not None:
        kinds |= {child.tag for child in node}

for tag in sorted(kinds):
    t = ET.parse(SRC)
    r = t.getroot()
    removed = 0
    for lst in ("Time_Constraints_List", "Space_Constraints_List"):
        node = r.find(lst)
        if node is None:
            continue
        for child in list(node):
            if child.tag == tag:
                node.remove(child)
                removed += 1
    run(t, f"sans {tag} ({removed})")

# Sans AUCUNE contrainte optionnelle : on ne garde que les « basic ».
t = ET.parse(SRC)
r = t.getroot()
for lst in ("Time_Constraints_List", "Space_Constraints_List"):
    node = r.find(lst)
    if node is None:
        continue
    for child in list(node):
        if not child.tag.endswith("BasicCompulsoryTime") and not child.tag.endswith(
            "BasicCompulsorySpace"
        ):
            node.remove(child)
run(t, "seulement les contraintes de base")
