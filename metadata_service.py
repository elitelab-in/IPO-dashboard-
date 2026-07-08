import json
import os
import time
import threading
import csv
import requests

# Path to local master metadata JSON database
METADATA_DB_PATH = os.path.join(os.path.dirname(__file__), 'stock_metadata_db.json')

# ─── NSE Industry → Indian Sector Mapping ────────────────────────────────────
# Maps the exact strings NSE uses in its index CSVs to a clean sector name
NSE_INDUSTRY_TO_SECTOR = {
    # Financial
    "Banks": "Financial Services",
    "Finance": "Financial Services",
    "Financial Services": "Financial Services",
    "Insurance": "Financial Services",
    "Capital Markets": "Financial Services",
    "Housing Finance": "Financial Services",
    "Micro Finance Institutions": "Financial Services",
    # Technology
    "Software & Services": "Technology",
    "IT-Software": "Technology",
    "IT Services & Consulting": "Technology",
    "Telecommunication-Services": "Technology",
    "Telecommunication": "Technology",
    # Healthcare & Pharma
    "Pharmaceuticals & Biotechnology": "Healthcare",
    "Pharmaceuticals": "Healthcare",
    "Healthcare Services": "Healthcare",
    "Biotechnology": "Healthcare",
    "Medical Devices": "Healthcare",
    "Hospital": "Healthcare",
    # Fast Moving Consumer Goods → we remap based on product type
    "Fast Moving Consumer Goods": "Consumer Staples",
    "FMCG": "Consumer Staples",
    "Food & Beverages": "Consumer Staples",
    "Agricultural Products": "Consumer Staples",
    "Tobacco": "Consumer Staples",
    "Household Products": "Consumer Staples",
    # Consumer Discretionary
    "Retail": "Consumer Discretionary",
    "Consumer Durables": "Consumer Durables",
    "Footwear": "Consumer Discretionary",
    "Textiles": "Consumer Discretionary",
    "Leisure Services": "Consumer Discretionary",
    "Hotels Restaurants and Tourism": "Consumer Discretionary",
    "Media & Entertainment": "Consumer Discretionary",
    "Advertising": "Consumer Discretionary",
    # Automotive
    "Automobiles": "Automobiles",
    "Auto Components": "Automobiles",
    "Auto Ancillaries": "Automobiles",
    # Metals & Mining
    "Ferrous Metals": "Metals & Mining",
    "Non-Ferrous Metals": "Metals & Mining",
    "Metals & Mining": "Metals & Mining",
    "Mining": "Metals & Mining",
    "Steel": "Metals & Mining",
    # Energy
    "Oil": "Energy",
    "Gas": "Energy",
    "Oil & Gas": "Energy",
    "Petroleum Products": "Energy",
    "Oil Exploration": "Energy",
    # Utilities / Power
    "Power": "Utilities",
    "Utilities": "Utilities",
    "Electricity": "Utilities",
    # Chemicals
    "Chemicals & Petrochemicals": "Chemicals",
    "Chemicals": "Chemicals",
    "Fertilizers & Agrochemicals": "Chemicals",
    "Paints": "Chemicals",
    # Real Estate
    "Realty": "Real Estate",
    "Real Estate": "Real Estate",
    "Construction": "Real Estate",
    "Housing": "Real Estate",
    # Industrials / Infrastructure
    "Industrial Products": "Industrials",
    "Industrial Manufacturing": "Industrials",
    "Electrical Equipments": "Industrials",
    "Engineering": "Industrials",
    "Capital Goods-Non Electrical Equipment": "Industrials",
    "Aerospace & Defense": "Industrials",
    "Infrastructure": "Industrials",
    "Cement": "Industrials",
    "Paper": "Industrials",
}

# ─── Manual Corrections Override ─────────────────────────────────────────────
# Stocks where both NSE and yfinance return wrong data.
# This is the FINAL override — it always wins.
METADATA_CORRECTIONS = {
    "CUPID": {
        "companyName": "Cupid Limited",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals & Medical Devices",
        "marketCapCategory": "Smallcap",
        "indices": ["Nifty Microcap 250"],
        "isin": "INE509F01029",
        "fnoEligible": False
    },
    "REDTAPE": {
        "companyName": "Redtape Limited",
        "sector": "Consumer Discretionary",
        "industry": "Footwear & Apparel",
        "marketCapCategory": "Smallcap",
        "indices": ["Nifty Smallcap 250"],
        "isin": "INE0L6C01019",
        "fnoEligible": False
    },
}

# ─── NSE Index Catalog ────────────────────────────────────────────────────────
INDEX_CATALOG = {
    "Nifty 50":           {"url": "https://archives.nseindia.com/content/indices/ind_nifty50list.csv",         "category": "Largecap"},
    "Nifty Next 50":      {"url": "https://archives.nseindia.com/content/indices/ind_niftynext50list.csv",     "category": "Largecap"},
    "Nifty Midcap 150":   {"url": "https://archives.nseindia.com/content/indices/ind_niftymidcap150list.csv",  "category": "Midcap"},
    "Nifty Smallcap 250": {"url": "https://archives.nseindia.com/content/indices/ind_niftysmallcap250list.csv","category": "Smallcap"},
    "Nifty 500":          {"url": "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",        "category": None},
    "Nifty Microcap 250": {"url": "https://archives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv","category": "Microcap"},
}


class StockMetadataService:
    def __init__(self):
        self.master_db = {}
        self._lock = threading.Lock()
        self._load_cache()
        threading.Thread(target=self._sync_all, daemon=True).start()

    # ── Cache I/O ─────────────────────────────────────────────────────────────
    def _load_cache(self):
        if os.path.exists(METADATA_DB_PATH):
            try:
                with open(METADATA_DB_PATH, 'r', encoding='utf-8') as f:
                    self.master_db = json.load(f)
                print(f"[MetadataSvc] Loaded {len(self.master_db)} records from cache.")
            except Exception as e:
                print(f"[MetadataSvc] Cache load error: {e}")
                self.master_db = {}
        self._apply_corrections()

    def _save_cache(self):
        try:
            with open(METADATA_DB_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.master_db, f, indent=2, ensure_ascii=False)
            print(f"[MetadataSvc] Saved {len(self.master_db)} records to cache.")
        except Exception as e:
            print(f"[MetadataSvc] Cache save error: {e}")

    def _apply_corrections(self):
        """Hardcoded corrections always override everything else."""
        for sym, data in METADATA_CORRECTIONS.items():
            self.master_db[sym] = {
                "symbol": sym,
                "companyName": data["companyName"],
                "sector": data["sector"],
                "industry": data["industry"],
                "marketCapCategory": data["marketCapCategory"],
                "indices": data["indices"],
                "isin": data["isin"],
                "exchange": "NSE",
                "fnoEligible": data["fnoEligible"],
                "_source": "correction"
            }

    # ── Background Sync ───────────────────────────────────────────────────────
    def _sync_all(self):
        """Only sync if cache is older than 24 hours."""
        if os.path.exists(METADATA_DB_PATH):
            age_hours = (time.time() - os.path.getmtime(METADATA_DB_PATH)) / 3600
            if age_hours < 24:
                print(f"[MetadataSvc] Cache is {age_hours:.1f}h old — skipping sync.")
                return

        print("[MetadataSvc] Starting full sync from NSE + yfinance fallback...")
        self._sync_equity_list()
        self._sync_index_lists()
        self._enrich_unknown_from_yfinance()
        self._apply_corrections()   # corrections always win at the end
        self._save_cache()
        print(f"[MetadataSvc] Sync complete. {len(self.master_db)} total stocks in DB.")

    def _sync_equity_list(self):
        """Load all NSE EQ segment symbols from EQUITY_L.csv."""
        try:
            res = requests.get("https://archives.nseindia.com/content/equities/EQUITY_L.csv", timeout=20)
            if res.status_code != 200:
                return
            reader = csv.reader(res.text.strip().splitlines())
            next(reader)  # skip header
            count = 0
            with self._lock:
                for row in reader:
                    if len(row) >= 6 and row[2].strip() == "EQ":
                        sym = row[0].strip()
                        if sym not in self.master_db:
                            self.master_db[sym] = {
                                "symbol": sym,
                                "companyName": row[1].strip(),
                                "sector": "Unknown",
                                "industry": "Unknown",
                                "marketCapCategory": "Unknown",
                                "indices": [],
                                "isin": row[5].strip(),
                                "exchange": "NSE",
                                "fnoEligible": False,
                                "_source": "equity_list"
                            }
                            count += 1
            print(f"[MetadataSvc] Added {count} new symbols from EQUITY_L.csv")
        except Exception as e:
            print(f"[MetadataSvc] equity_list sync error: {e}")

    def _sync_index_lists(self):
        """Download all index CSVs and enrich sector, industry, cap category, indices."""
        for index_name, cfg in INDEX_CATALOG.items():
            try:
                res = requests.get(cfg["url"], timeout=20)
                if res.status_code != 200:
                    continue
                reader = csv.reader(res.text.strip().splitlines())
                next(reader)  # skip header: Company Name, Industry, Symbol, Series, ISIN Code
                with self._lock:
                    for row in reader:
                        if len(row) < 3:
                            continue
                        sym = row[2].strip()
                        nse_industry = row[1].strip()
                        if not sym:
                            continue

                        if sym not in self.master_db:
                            self.master_db[sym] = {
                                "symbol": sym,
                                "companyName": row[0].strip(),
                                "sector": "Unknown",
                                "industry": "Unknown",
                                "marketCapCategory": cfg.get("category") or "Unknown",
                                "indices": [],
                                "isin": row[4].strip() if len(row) > 4 else "Unknown",
                                "exchange": "NSE",
                                "fnoEligible": False,
                                "_source": "index_list"
                            }

                        entry = self.master_db[sym]
                        # Add index membership
                        if index_name not in entry["indices"]:
                            entry["indices"].append(index_name)

                        # Update cap category (Nifty 50/Next50 > Midcap > Smallcap)
                        if cfg.get("category"):
                            priority = {"Largecap": 4, "Midcap": 3, "Smallcap": 2, "Microcap": 1}
                            cur_priority = priority.get(entry.get("marketCapCategory", ""), 0)
                            new_priority = priority.get(cfg["category"], 0)
                            if new_priority > cur_priority:
                                entry["marketCapCategory"] = cfg["category"]

                        # Enrich industry/sector from NSE classification
                        if nse_industry and entry.get("sector") in (None, "Unknown", ""):
                            mapped_sector = NSE_INDUSTRY_TO_SECTOR.get(nse_industry, "Industrials")
                            entry["industry"] = nse_industry
                            entry["sector"] = mapped_sector

                print(f"[MetadataSvc] Processed {index_name}")
            except Exception as e:
                print(f"[MetadataSvc] {index_name} sync error: {e}")

    def _enrich_unknown_from_yfinance(self):
        """
        For stocks still showing Unknown sector/industry after NSE sync,
        use yfinance as fallback. Runs only for Unknown stocks to save time.
        Also builds FNO eligibility from AngelOne ScripMaster.
        """
        # Step 1: Get FNO symbols from AngelOne ScripMaster
        try:
            res = requests.get(
                "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json",
                timeout=20
            )
            if res.status_code == 200:
                fno_syms = set()
                for item in res.json():
                    if item.get("exch_seg") == "NFO" and item.get("instrumenttype") in ("FUTSTK", "OPTSTK"):
                        # Extract base symbol (e.g. "TCS25JULXXX" → "TCS")
                        raw = item.get("name", "")
                        parts = raw.split()
                        if parts:
                            fno_syms.add(parts[0].upper())
                with self._lock:
                    for sym in fno_syms:
                        if sym in self.master_db:
                            self.master_db[sym]["fnoEligible"] = True
                print(f"[MetadataSvc] FNO eligibility set for {len(fno_syms)} symbols")
        except Exception as e:
            print(f"[MetadataSvc] AngelOne FNO sync error: {e}")

        # Step 2: yfinance fallback for Unknown sector stocks
        import yfinance as yf

        # Custom corrections for known yfinance misclassifications
        YF_SECTOR_FIXES = {
            "Consumer Defensive": "Consumer Staples",
            "Basic Materials": "Metals & Mining",
            "Financial": "Financial Services",
        }

        unknown_syms = []
        with self._lock:
            for sym, entry in self.master_db.items():
                if entry.get("sector") in (None, "Unknown", ""):
                    unknown_syms.append(sym)

        print(f"[MetadataSvc] Enriching {len(unknown_syms)} Unknown-sector stocks via yfinance...")
        enriched = 0
        for sym in unknown_syms[:500]:   # limit to first 500 to avoid long waits
            try:
                info = yf.Ticker(f"{sym}.NS").info
                sec = info.get("sector", "")
                ind = info.get("industry", "")
                if sec and sec != "Unknown":
                    # Apply known yfinance fixes
                    sec = YF_SECTOR_FIXES.get(sec, sec)
                    with self._lock:
                        if sym in self.master_db:
                            self.master_db[sym]["sector"] = sec
                            self.master_db[sym]["industry"] = ind
                            self.master_db[sym]["_source"] = "yfinance"
                    enriched += 1
            except Exception:
                pass
        print(f"[MetadataSvc] Enriched {enriched} stocks via yfinance fallback.")

    # ── Public API ────────────────────────────────────────────────────────────
    def get_metadata(self, symbol: str) -> dict:
        sym = symbol.strip().upper().split(".")[0]
        with self._lock:
            entry = self.master_db.get(sym)
        if entry:
            return entry

        # Not in cache at all — try live yfinance fetch (one-off, non-blocking is fine here)
        try:
            import yfinance as yf
            info = yf.Ticker(f"{sym}.NS").info
            sec = info.get("sector", "Unknown")
            ind = info.get("industry", "Unknown")
            YF_SECTOR_FIXES = {"Consumer Defensive": "Consumer Staples", "Basic Materials": "Metals & Mining"}
            sec = YF_SECTOR_FIXES.get(sec, sec)
            result = {
                "symbol": sym,
                "companyName": info.get("longName", sym),
                "sector": sec,
                "industry": ind,
                "marketCapCategory": "Unknown",
                "indices": [],
                "isin": "Unknown",
                "exchange": "NSE",
                "fnoEligible": False,
                "_source": "yfinance_live"
            }
            with self._lock:
                self.master_db[sym] = result
            return result
        except Exception:
            pass

        return {
            "symbol": sym, "companyName": sym,
            "sector": "Unknown", "industry": "Unknown",
            "marketCapCategory": "Unknown", "indices": [],
            "isin": "Unknown", "exchange": "NSE", "fnoEligible": False,
            "_source": "not_found"
        }


# ── Global Singleton ──────────────────────────────────────────────────────────
_service = StockMetadataService()


def getStockMetadata(symbol: str) -> dict:
    return _service.get_metadata(symbol)

def getSector(symbol: str) -> str:
    return _service.get_metadata(symbol).get("sector", "Unknown")

def getIndustry(symbol: str) -> str:
    return _service.get_metadata(symbol).get("industry", "Unknown")

def getIndices(symbol: str) -> list:
    return _service.get_metadata(symbol).get("indices", [])
