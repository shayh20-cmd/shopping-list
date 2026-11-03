"""Nightly price loader.

Downloads the chains' public price files (Israeli price-transparency law) for the stores
near each household's home and writes them to Supabase.

  SUPABASE_URL, SUPABASE_SERVICE_KEY   write access (service role / secret key)
  --dry-run --home LAT,LNG --radius KM   no Supabase: print what would be loaded
"""
import argparse, collections, gzip, io, json, math, os, re, sys, time, zipfile
import requests
from lxml import etree
from il_supermarket_scarper import ScarpingTask, FileTypesFilters

CHAINS = [
    "SHUFERSAL", "RAMI_LEVY", "YOHANANOF", "OSHER_AD", "VICTORY_NEW_SOURCE", "TIV_TAAM",
    "HAZI_HINAM", "YAYNO_BITAN_AND_CARREFOUR", "MAHSANI_ASHUK_NEW_SOURCE", "KESHET",
    "STOP_MARKET", "FRESH_MARKET_AND_SUPER_DOSH", "KING_STORE", "ZOL_VEBEGADOL",
    "SUPER_YUDA", "CITY_MARKET_SHOPS", "SHUK_AHIR", "NETIV_HASED",
]
ONLINE = re.compile(r"אונליין|online|אינטרנט|משלוח|ליקוט|דיגיטל|b-?klick|pick", re.I)
MAX_RADIUS_KM = 20
MAX_STORES_PER_HOME = 40
UA = "shopping-list-price-loader (+https://github.com/shayh20-cmd/shopping-list)"
CITY_RESOURCE = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba"  # data.gov.il: list of localities

log = lambda *a: print(*a, flush=True)


# ---------- Supabase REST ----------

class DB:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if not key.startswith("sb_secret_"):
            self.h["Authorization"] = f"Bearer {key}"

    def get(self, table, params):
        rows, start = [], 0
        while True:
            r = requests.get(self.base + table, params=params,
                             headers={**self.h, "Range": f"{start}-{start + 999}"}, timeout=60)
            r.raise_for_status()
            page = r.json()
            rows += page
            if len(page) < 1000:
                return rows
            start += 1000

    def upsert(self, table, rows, on_conflict):
        for i in range(0, len(rows), 1000):
            r = requests.post(self.base + table, params={"on_conflict": on_conflict},
                              headers={**self.h, "Prefer": "resolution=merge-duplicates,return=minimal"},
                              data=json.dumps(rows[i:i + 1000]), timeout=120)
            if r.status_code >= 300:
                raise RuntimeError(f"{table}: {r.status_code} {r.text[:300]}")

    def delete(self, table, params):
        r = requests.delete(self.base + table, params=params, headers=self.h, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"{table}: {r.status_code} {r.text[:300]}")


# ---------- files ----------

def read_xml(path):
    data = open(path, "rb").read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    elif data[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(data))
        data = z.read(z.namelist()[0])
    return etree.fromstring(data, etree.XMLParser(recover=True, huge_tree=True))


def fields(el):
    return {k.tag.lower(): (k.text or "").strip() for k in el if len(k) == 0 and isinstance(k.tag, str)}


def scrape(chains, types, regex=None, folder="dumps", limit=None):
    task = ScarpingTask(enabled_scrapers=chains, files_types=types, file_name_regex=regex,
                        multiprocessing=6, timeout_in_seconds=60 * 20,
                        output_configuration={"output_mode": "disk", "base_storage_path": folder})
    task.start(limit=limit)
    task.join()
    out = []
    for root, _, files in os.walk(folder):
        if "status" not in root:
            out += [os.path.join(root, f) for f in files]
    return out


def chain_of(path):
    m = re.search(r"(?:Stores|PriceFull)(\d{13})", os.path.basename(path), re.I)
    return m and m.group(1)


def parse_stores(paths):
    """Newest stores file per chain -> {key: store}"""
    newest = {}
    for p in paths:
        c = chain_of(p)
        if c and re.search(r"stores", os.path.basename(p), re.I):
            if c not in newest or os.path.basename(p) > os.path.basename(newest[c]):
                newest[c] = p
    stores = {}
    for chain_id, p in newest.items():
        try:
            root = read_xml(p)
        except Exception as e:
            log("stores parse failed", p, e)
            continue
        top = fields(root)
        chain_name = top.get("chainname", "")
        for st in root.iter():
            if not isinstance(st.tag, str) or st.tag.lower() != "store":
                continue
            f = fields(st)
            sid = f.get("storeid", "").lstrip("0") or "0"
            name = f.get("storename", "")
            stores[f"{chain_id}-{sid}"] = {
                "key": f"{chain_id}-{sid}", "chain_id": chain_id,
                "chain_name": f.get("chainname") or chain_name or chain_id,
                "store_id": sid, "name": name, "address": f.get("address", ""),
                "city": f.get("city", ""), "type": f.get("storetype", ""),
            }
        log(f"stores: {chain_name or chain_id}: {sum(1 for s in stores.values() if s['chain_id'] == chain_id)}")
    return stores


def parse_prices(path):
    root = read_xml(path)
    items = []
    for it in root.iter():
        if not isinstance(it.tag, str) or it.tag.lower() != "item":
            continue
        f = fields(it)
        code, name = f.get("itemcode", ""), f.get("itemname") or f.get("itemnm", "")
        try:
            price = float(f.get("itemprice") or 0)
        except ValueError:
            price = 0
        if not code or not name or price <= 0:
            continue
        items.append({
            "barcode": code, "name": " ".join(name.split()), "price": round(price, 2),
            "manufacturer": f.get("manufacturername") or f.get("manufacturename", ""),
            "quantity": f.get("quantity", ""), "unit": f.get("unitofmeasure", ""),
            "weighted": f.get("bisweighted") == "1",
        })
    return items


# ---------- geography ----------

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def city_names():
    try:
        r = requests.get("https://data.gov.il/api/3/action/datastore_search",
                         params={"resource_id": CITY_RESOURCE, "limit": 5000}, headers={"User-Agent": UA}, timeout=60)
        out = {}
        for rec in r.json()["result"]["records"]:
            code = str(rec.get("סמל_ישוב") or rec.get("semel_yeshuv") or "").strip()
            name = (rec.get("שם_ישוב") or rec.get("shem_yeshuv") or "").strip()
            if code and name:
                out[code.lstrip("0")] = name
        log("city codes:", len(out))
        return out
    except Exception as e:
        log("city codes unavailable:", e)
        return {}


class Geocoder:
    def __init__(self, cache):
        self.cache = cache  # query -> (lat, lng) or None
        self.new = {}
        self.last = 0

    def __call__(self, q, street=None, city=None):
        if q in self.cache:
            return self.cache[q]
        wait = 1.1 - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        self.last = time.time()
        res = None
        params = {"street": street, "city": city} if street else {"q": q}
        try:
            r = requests.get("https://nominatim.openstreetmap.org/search",
                             params={**params, "format": "json", "limit": 1, "countrycodes": "il"},
                             headers={"User-Agent": UA, "Accept-Language": "he"}, timeout=30)
            j = r.json()
            if j:
                res = (float(j[0]["lat"]), float(j[0]["lon"]))
        except Exception as e:
            log("geocode failed", q, e)
            return None  # do not cache network failures
        self.cache[q] = self.new[q] = res
        return res


def clean_address(a):
    a = re.sub(r"\b(רח'|רחוב|שד'|שדרות)\s*", "", a)
    a = re.split(r"\s*(?:פינת|פ\.|,|\(|מרכז|קניון)", a)[0]
    a = re.sub(r"([א-ת])(\d)", r"\1 \2", a)      # "אבן גבירול157" -> "אבן גבירול 157"
    m = re.match(r"^(\d+)\s+(.+)$", a.strip())     # "1 אחי מאיר" -> "אחי מאיר 1"
    if m:
        a = f"{m.group(2)} {m.group(1)}"
    return " ".join(a.split())


def clean_city(c):
    return re.sub(r"\s*-\s*", "-", c).replace("תל אביב-יפו", "תל אביב")


def city_of(store, codes):
    c = store["city"].strip()
    if c.isdigit():
        c = codes.get(c.lstrip("0"), "") if c.strip("0") else ""
    if c:
        return c
    # No city in the file: look for a known city name in the branch name or address.
    text = f" {norm(store['name'])} {norm(store['address'])} "
    names = sorted({clean_city(n) for n in codes.values() if len(n) >= 3} | {"תל אביב"}, key=len, reverse=True)
    for n in names:
        if f" {norm(n)} " in text:
            return n
    return ""


def locate(stores, homes, geo, codes):
    """Give stores near a home coordinates. Cities are geocoded first so far-away stores are skipped."""
    for s in stores.values():
        if s.get("lat") is not None:
            continue
        city = city_of(s, codes)
        if city:
            c = geo(f"{city}, ישראל")
            if not c or min(km(c, h["home"]) for h in homes) > h_radius(homes) + 15:
                continue
            p = None
            street = clean_address(s["address"]) if s["address"] else ""
            if street and re.search(r"\d", street):
                p = geo(f"street:{street}|{clean_city(city)}", street=street, city=clean_city(city))
            if not p and street:
                p = geo(f"{street}, {clean_city(city)}")
            s["approx"] = not p
        else:
            continue  # without a city a geocode is a guess; leave the store out
        if not p:
            s["approx"] = True
        p = p or c
        if p:
            s["lat"], s["lng"] = p
            s["geocoded"] = True
            s["city_name"] = city


def h_radius(homes):
    return max(h["radius"] for h in homes)


# ---------- generic matching ----------

def norm(s):
    return " ".join(re.sub(r"[\"'׳״`.,()\-]", " ", s).split())


def variants(p):
    """Plural and singular spellings of the first word: עגבניות -> עגבניה, מלפפונים -> מלפפון."""
    first, rest = p.split()[0], p.split()[1:]
    forms = {first}
    if first.endswith("ות") and len(first) > 3:
        forms |= {first[:-2] + "ה", first[:-2] + "ת", first[:-2]}
    if first.endswith("ים") and len(first) > 3:
        forms |= {first[:-2], first[:-2] + "ה"}
    final = str.maketrans("כמנפצ", "ךםןףץ")
    forms = {f[:-1] + f[-1].translate(final) for f in forms}
    return {" ".join([f, *rest]) for f in forms}


def generic_matches(items, product_names):
    """Item for a generic product name, per store.

    Candidates are items whose name starts with the product name (or its singular) as whole words.
    An item named exactly like the product wins, then items sold by weight (fresh produce),
    then the cheapest of the rest.
    """
    by_first = collections.defaultdict(list)
    for it in items:
        n = norm(it["name"])
        if n:
            by_first[n.split()[0]].append((n, it))
    out = {}
    for pname in product_names:
        p = norm(pname)
        if not p:
            continue
        best, best_rank = None, None
        for v in variants(p):
            for n, it in by_first.get(v.split()[0], []):
                if n == v or n.startswith(v + " "):
                    rank = (0 if n == v else 1 if it.get("weighted") else 2, it["price"])
                    if best_rank is None or rank < best_rank:
                        best, best_rank = it, rank
        if best:
            out[pname] = best
    return out


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--home", help="LAT,LNG for --dry-run")
    ap.add_argument("--radius", type=float, default=5)
    ap.add_argument("--chains", default=",".join(CHAINS))
    ap.add_argument("--list-online", action="store_true", help="print online-looking stores and exit")
    args = ap.parse_args()
    chains = args.chains.split(",")

    db = None
    if args.dry_run:
        lat, lng = map(float, args.home.split(","))
        homes = [{"home": (lat, lng), "radius": min(args.radius, MAX_RADIUS_KM)}]
        product_names = ["חלב", "לחם", "ביצים", "עגבניות", "במבה", "קוטג'", "שמן זית", "אורז", "פסטה", "מלפפונים", "בננות", "תפוחי אדמה", "גבינה צהובה", "שניצל", "קפה"]
        known, cache = {}, {}
    else:
        db = DB(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        hh = db.get("households", {"select": "id,home_lat,home_lng,radius_km", "home_lat": "not.is.null"})
        homes = [{"home": (h["home_lat"], h["home_lng"]), "radius": min(h["radius_km"] or 5, MAX_RADIUS_KM)} for h in hh]
        if not homes:
            log("no household has a home location yet; nothing to load")
            return
        ids = ",".join(h["id"] for h in hh)
        product_names = sorted({p["name"] for p in db.get("products", {"select": "name", "household_id": f"in.({ids})"})})
        known = {s["key"]: s for s in db.get("chain_stores", {"select": "*"})}
        cache = {r["query"]: (r["lat"], r["lng"]) if r["lat"] is not None else None
                 for r in db.get("geo_cache", {"select": "*"})}
    log(f"homes: {len(homes)}, product names: {len(product_names)}")

    # 1. Stores of every chain, with coordinates for the ones near a home.
    paths = scrape(chains, [FileTypesFilters.STORE_FILE.name], folder="dumps/stores", limit=1)
    stores = parse_stores(paths)
    for k, s in stores.items():
        old = known.get(k)
        if old and old.get("lat") is not None and old.get("address") == s["address"] and not old.get("city", "").strip("0123456789 ") == "":
            s["lat"], s["lng"], s["geocoded"], s["approx"] = old["lat"], old["lng"], True, old.get("approx")
    geo = Geocoder(cache)
    if args.list_online:
        for st in stores.values():
            if st["type"] != "1" or ONLINE.search(st["name"] + " " + st["address"]):
                log(f"online? type={st['type']} {st['key']} {st['chain_name']} | {st['name']} | {st['address']} | {st['city']}")
        log("types:", collections.Counter((s_["chain_name"], s_["type"]) for s_ in stores.values()))
        return
    locate(stores, homes, geo, city_names())

    # 2. Nearest stores per home.
    chosen = {}
    for h in homes:
        near = sorted(((km(h["home"], (s["lat"], s["lng"])), s) for s in stores.values() if s.get("lat") is not None),
                      key=lambda x: x[0])
        for d, s in [x for x in near if x[0] <= h["radius"]][:MAX_STORES_PER_HOME]:
            chosen[s["key"]] = (d, s)
    log(f"stores in range: {len(chosen)}")
    for d, s in sorted(chosen.values(), key=lambda x: x[0]):
        log(f"  {d:5.1f} km{' ~' if s.get('approx') else '  '} {s['chain_name']} {s['name']} | {s['address']} {s.get('city_name', '')}")

    if db:
        rows = [{k: s.get(k) for k in ("key", "chain_id", "chain_name", "store_id", "name", "address", "lat", "lng")}
                | {"geocoded": bool(s.get("geocoded")), "approx": bool(s.get("approx"))}
                | {"city": s.get("city_name") or s["city"]} for s in stores.values()]
        db.upsert("chain_stores", rows, "key")
        if geo.new:
            db.upsert("geo_cache", [{"query": q, "lat": v and v[0], "lng": v and v[1]} for q, v in geo.new.items()], "query")

    if not chosen:
        return

    # 3. Price files for the chosen stores only.
    by_chain = collections.defaultdict(list)
    for _, s in chosen.values():
        by_chain[s["chain_id"]].append(s["store_id"])
    regex = "|".join(f"PriceFull{c}-(?:\\d+-)?0*(?:{'|'.join(ids)})-\\d{{8}}" for c, ids in by_chain.items())
    chain_names = [c for c in chains]
    paths = scrape(chain_names, [FileTypesFilters.PRICE_FULL_FILE.name], regex=regex, folder="dumps/prices")
    newest = {}
    for p in paths:
        m = re.search(r"PriceFull(\d{13})-(?:\d+-)?0*(\d+)-(\d{8})", os.path.basename(p), re.I)
        if not m:
            continue
        key = f"{m.group(1)}-{m.group(2)}"
        if key in chosen and (key not in newest or os.path.basename(p) > os.path.basename(newest[key])):
            newest[key] = p
    log(f"price files: {len(newest)} of {len(chosen)} stores")

    all_items = {}
    for key, p in newest.items():
        try:
            items = parse_prices(p)
        except Exception as e:
            log("price parse failed", p, e)
            continue
        matches = generic_matches(items, product_names)
        s = chosen[key][1]
        log(f"{s['chain_name']} {s['name']}: {len(items)} items, {len(matches)}/{len(product_names)} names matched")
        if args.dry_run:
            for n, it in list(matches.items())[:10]:
                log(f"    {n} -> {it['name']} {it['price']}")
            continue
        for it in items:
            all_items[it["barcode"]] = it
        db.delete("store_prices", {"store_key": f"eq.{key}"})
        db.upsert("store_prices", [{"store_key": key, "barcode": it["barcode"], "price": it["price"]} for it in items],
                  "store_key,barcode")
        db.delete("store_generic_prices", {"store_key": f"eq.{key}"})
        db.upsert("store_generic_prices", [{"store_key": key, "product_name": n, "barcode": it["barcode"],
                                            "item_name": it["name"], "price": it["price"]} for n, it in matches.items()],
                  "store_key,product_name")
    if db and all_items:
        db.upsert("chain_items", [{k: it[k] for k in ("barcode", "name", "manufacturer", "quantity", "unit")}
                                  for it in all_items.values()], "barcode")
        log(f"items catalog: {len(all_items)}")


if __name__ == "__main__":
    main()
