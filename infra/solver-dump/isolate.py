"""Isole la cause du refus de FET sur le XML réellement produit.

On part du fichier qui a échoué et on retire une chose à la fois, puis on
relance `fet-cl`. C'est la seule façon d'attribuer « data is wrong » à un
élément précis : le message de FET ne nomme jamais le coupable.
"""

import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

SRC = Path("/tmp/jawal-dump/last_failed.fet")


def run(tree: ET.ElementTree, label: str) -> None:
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "in.fet"
        tree.write(f, encoding="utf-8", xml_declaration=True)
        out = Path(d) / "out"
        out.mkdir()
        p = subprocess.run(
            ["fet-cl", f"--inputfile={f}", f"--outputdir={out}", "--timelimitseconds=10"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        msg = (p.stdout or "").strip().splitlines()
        tail = msg[-1] if msg else (p.stderr or "").strip()[-120:]
        print(f"  {label:<46} rc={p.returncode}  {tail[:90]}")


def fresh() -> ET.ElementTree:
    return ET.parse(SRC)


print("XML réel produit par l'application :")
run(fresh(), "tel quel")

# 1) Sans la contrainte de simultanéité
t = fresh()
root = t.getroot()
tc = root.find("Time_Constraints_List")
n = 0
for c in list(tc.findall("ConstraintActivitiesSameStartingTime")):
    tc.remove(c)
    n += 1
run(t, f"sans ConstraintActivitiesSameStartingTime ({n})")

# 2) Sans les sous-groupes : les activités reviennent sur la classe
t = fresh()
root = t.getroot()
sub_to_group = {}
for grp in root.iter("Group"):
    gname = grp.find("Name").text
    for sub in list(grp.findall("Subgroup")):
        sub_to_group[sub.find("Name").text] = gname
        grp.remove(sub)
for act in root.iter("Activity"):
    st = act.find("Students")
    if st is not None and st.text in sub_to_group:
        st.text = sub_to_group[st.text]
run(t, f"sans Subgroup ({len(sub_to_group)})")

# 3) Ni l'un ni l'autre
t = fresh()
root = t.getroot()
tc = root.find("Time_Constraints_List")
for c in list(tc.findall("ConstraintActivitiesSameStartingTime")):
    tc.remove(c)
for grp in root.iter("Group"):
    gname = grp.find("Name").text
    for sub in list(grp.findall("Subgroup")):
        sub_to_group[sub.find("Name").text] = gname
        grp.remove(sub)
for act in root.iter("Activity"):
    st = act.find("Students")
    if st is not None and st.text in sub_to_group:
        st.text = sub_to_group[st.text]
run(t, "sans Subgroup NI simultanéité")
