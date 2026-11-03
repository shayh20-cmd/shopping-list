"""Probe: download store files (and one PriceFull per chain) and print their XML structure."""
import gzip, os, sys, zipfile, io, collections
from il_supermarket_scarper import ScarpingTask, FileTypesFilters

CHAINS = sys.argv[1].split(",")
types = [FileTypesFilters.STORE_FILE.name, FileTypesFilters.PRICE_FULL_FILE.name]
task = ScarpingTask(enabled_scrapers=CHAINS, files_types=types, multiprocessing=4,
                    output_configuration={"output_mode": "disk", "base_storage_path": "dumps"})
task.start(limit=2)
task.join()

from lxml import etree

def read(path):
    data = open(path, "rb").read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    elif data[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(data)); data = z.read(z.namelist()[0])
    return data

for root, _, files in os.walk("dumps"):
    for f in files:
        if "status" in root: continue
        p = os.path.join(root, f)
        try:
            tree = etree.fromstring(read(p), etree.XMLParser(recover=True, huge_tree=True))
        except Exception as e:
            print("FAIL", p, e); continue
        tags = collections.Counter(el.tag for el in tree.iter())
        print("\n==", p, os.path.getsize(p))
        print("  tags:", dict(tags.most_common(30)))
        # print the first leaf-parent record
        for el in tree.iter():
            kids = list(el)
            if len(kids) > 4 and all(len(k) == 0 for k in kids):
                print("  sample:", {k.tag: (k.text or "")[:40] for k in kids})
                break
