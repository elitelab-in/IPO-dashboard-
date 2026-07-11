import requests
from bs4 import BeautifulSoup
import re
import time
import threading

class FpiNsdlService:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if not cls._instance:
                cls._instance = super(FpiNsdlService, cls).__new__(cls, *args, **kwargs)
                cls._instance.cache = None
                cls._instance.cache_time = 0
            return cls._instance

    def _clean_num(self, val_str):
        try:
            val_str = val_str.replace(",", "").replace(" ", "").strip()
            if val_str.startswith("(") and val_str.endswith(")"):
                return -float(val_str[1:-1])
            return float(val_str)
        except ValueError:
            return 0.0

    def fetch_latest_data(self):
        now = time.time()
        # Cache for 12 hours (43200 seconds) since NSDL updates fortnightly
        if self.cache and (now - self.cache_time < 43200):
            return self.cache
            
        selection_url = "https://www.fpi.nsdl.co.in/web/Reports/FPI_Fortnightly_Selection.aspx"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            res = requests.get(selection_url, headers=headers, timeout=10)
            soup = BeautifulSoup(res.content, "html.parser")
            
            select = soup.find("select", id="ddlfortnighly")
            if not select:
                return {"error": "Dropdown not found on NSDL site"}
                
            options = [opt.get("value") for opt in select.find_all("option")]
            options = [opt for opt in options if opt and "FIIInvestSector_" in opt]
            
            if not options:
                return {"error": "No reports found on NSDL site"}
                
            latest_opt = options[0]
            report_url = f"https://www.fpi.nsdl.co.in/{latest_opt.replace('~/', '')}"
            opt_text = select.find("option").text.strip()
            
            rep_res = requests.get(report_url, headers=headers, timeout=10)
            rep_soup = BeautifulSoup(rep_res.content, "html.parser")
            table = rep_soup.find("table")
            if not table:
                return {"error": "Table not found in report HTML"}
                
            rows = []
            for tr in table.find_all("tr"):
                cells = [td.text.strip().replace("\n", " ").replace("\r", " ") for td in tr.find_all(["td", "th"])]
                rows.append(cells)
                
            sectors_data = []
            for r in rows:
                if len(r) < 50:
                    continue
                sr_no = r[0]
                if not sr_no.isdigit():
                    continue
                    
                sector_name = r[1]
                if "Total" in sector_name or "Others" in sector_name:
                    continue
                    
                auc_prev = self._clean_num(r[2])
                net_prev = self._clean_num(r[26])
                net_latest = self._clean_num(r[50])
                auc_latest = self._clean_num(r[74])
                
                sectors_data.append({
                    "sector": sector_name,
                    "auc_prev": auc_prev,
                    "net_prev": net_prev,
                    "net_latest": net_latest,
                    "auc_latest": auc_latest,
                    "net_total_month": net_prev + net_latest
                })
                
            # Sort by latest fortnight net inflows
            sectors_data.sort(key=lambda x: x["net_latest"], reverse=True)
            
            inflows = sectors_data[:5] # Return top 5 inflows
            outflows = sorted([s for s in sectors_data if s["net_latest"] < 0], key=lambda x: x["net_latest"])[:5] # Return top 5 outflows
            
            data = {
                "period": opt_text,
                "report_url": report_url,
                "sectors": sectors_data,
                "top_inflows": inflows,
                "top_outflows": outflows
            }
            
            self.cache = data
            self.cache_time = now
            return data
            
        except Exception as e:
            return {"error": str(e)}

