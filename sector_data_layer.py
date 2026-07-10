import yfinance as yf
import threading
import concurrent.futures
import time
import pandas as pd

# Define sectors with index tickers and major constituent stocks
SECTORS_CONFIG = {
    "Nifty IT": {
        "ticker": "^CNXIT",
        "constituents": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "COFORGE", "MPHASIS", "PERSISTENT"]
    },
    "Bank Nifty": {
        "ticker": "^NSEBANK",
        "constituents": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "PNB", "FEDERALBNK"]
    },
    "Financial Services": {
        "ticker": "NIFTY_FIN_SERVICE.NS",
        "constituents": ["BAJFINANCE", "BAJAJFINSV", "CHOLAFIN", "RECLTD", "PFC", "MUTHOOTFIN"]
    },
    "Auto": {
        "ticker": "^CNXAUTO",
        "constituents": ["M&M", "MARUTI", "BAJAJ-AUTO", "HEROMOTOCO", "TVSMOTOR", "EICHERMOT"]
    },
    "Pharma": {
        "ticker": "^CNXPHARMA",
        "constituents": ["SUNPHARMA", "CIPLA", "DRREDDY", "DIVISLAB", "LUPIN", "AUROPHARMA"]
    },
    "FMCG": {
        "ticker": "^CNXFMCG",
        "constituents": ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO"]
    },
    "Metal": {
        "ticker": "^CNXMETAL",
        "constituents": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "JINDALSTEL", "COALINDIA", "VEDL"]
    },
    "Realty": {
        "ticker": "^CNXREALTY",
        "constituents": ["DLF", "LODHA", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "SOBHA"]
    },
    "PSU Bank": {
        "ticker": "^CNXPSUBANK",
        "constituents": ["SBIN", "PNB", "BANKBARODA", "CANBK", "UNIONBANK", "INDIANB"]
    },
    "Energy": {
        "ticker": "^CNXENERGY",
        "constituents": ["RELIANCE", "NTPC", "POWERGRID", "ONGC", "TATAPOWER", "ADANIGREEN"]
    },
    "Oil & Gas": {
        "ticker": "NIFTY_OIL_AND_GAS.NS",
        "constituents": ["RELIANCE", "ONGC", "BPCL", "IOC", "GAIL", "MGL"]
    },
    "Media": {
        "ticker": "^CNXMEDIA",
        "constituents": ["SUNTV", "ZEEL", "PVRINOX", "NAZARA", "SAREGAMA"]
    },
    "Healthcare": {
        "ticker": "NIFTY_HEALTHCARE.NS",
        "constituents": ["SUNPHARMA", "APOLLOHOSP", "MAXHEALTH", "FORTIS", "LALPATHLAB"]
    },
    "Consumer Durables": {
        "ticker": "NIFTY_CONSR_DURBL.NS",
        "constituents": ["TITAN", "HAVELLS", "VOLTAS", "DIXON", "BLUESTARCO"]
    },
    "Infrastructure": {
        "ticker": "^CNXINFRA",
        "constituents": ["LT", "RELIANCE", "NTPC", "POWERGRID", "BHARTIARTL", "ULTRACEMCO"]
    },
    "Capital Goods": {
        "ticker": "NIFTY_CPSE.NS",
        "constituents": ["LT", "BEL", "BHEL", "HAL", "ABB", "SIEMENS"]
    },
    "Chemicals": {
        "ticker": "CHEMICALS.SYNTHETIC",
        "constituents": ["SRF", "AARTIIND", "DEEPAKNTR", "TATACHEM", "PIIND", "UPL"]
    },
    "Defence": {
        "ticker": "DEFENCE.SYNTHETIC",
        "constituents": ["BEL", "HAL", "BDL", "BEML", "COCHINSHIP", "MAZDOCK"]
    },
    "Telecom": {
        "ticker": "TELECOM.SYNTHETIC",
        "constituents": ["BHARTIARTL", "INDUSTOWER", "ROUTE", "TEJASNET", "TATACOMM"]
    },
    "Services": {
        "ticker": "^CNXSERVICE",
        "constituents": ["LT", "BHARTIARTL", "TCS", "INFY", "HDFCBANK", "ICICIBANK"]
    }
}

class SectorDataLayer:
    def __init__(self):
        self.cache = {}
        self.lock = threading.Lock()
        self.cache_duration = 60  # 60s — batch download makes this safe without rate limiting

    def _is_history_stale(self, df):
        """Checks if the history dataframe has a date gap at the end (greater than 2 business days)."""
        if df is None or df.empty:
            return True
        try:
            import datetime
            import pytz
            last_date = df.index[-1]
            if hasattr(last_date, "date"):
                last_date = last_date.date()
            # Get current date in IST
            today_dt = datetime.datetime.now(pytz.timezone("Asia/Kolkata")).date()
            # Calculate business days gap
            b_days = len(pd.bdate_range(start=last_date, end=today_dt))
            return b_days > 3
        except Exception:
            return False

    def _ensure_latest_day(self, df, ticker):
        """Appends live intraday price (1m interval) so we get real-time close during market hours."""
        if df is None or df.empty:
            return df
        # Normalize history index to timezone-naive
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
            
        try:
            import datetime, pytz
            ist = pytz.timezone("Asia/Kolkata")
            now_ist = datetime.datetime.now(ist)
            # Try live 1m data first for real-time price
            live_df = ticker.history(period="1d", interval="1m")
            if live_df is not None and not live_df.empty:
                # Normalize live_df index to timezone-naive
                if live_df.index.tz is not None:
                    live_df.index = live_df.index.tz_localize(None)
                latest_price = float(live_df["Close"].dropna().iloc[-1])
                # Convert to date-only naive timestamp to match daily format
                latest_idx = pd.Timestamp(live_df.index[-1].date())
                
                # Normalise to date-only index to match 3mo history
                today_str = now_ist.date()
                # Update today's row in the 3mo history with live price
                last_hist_idx = df.index[-1]
                if hasattr(last_hist_idx, "date"):
                    last_hist_date = last_hist_idx.date()
                else:
                    last_hist_date = last_hist_idx
                if last_hist_date == today_str:
                    df.iloc[-1, df.columns.get_loc("Close")] = latest_price
                else:
                    # Market is open but today not in 3mo — append a new row
                    new_row = df.iloc[[-1]].copy()
                    new_row.iloc[0, new_row.columns.get_loc("Close")] = latest_price
                    new_row.index = [latest_idx]
                    df = pd.concat([df, new_row])
                return df
        except Exception as e:
            # print(f"[SectorDataLayer] Intraday append failed: {e}")
            pass
            
        # Fallback: use period=1d daily data
        try:
            latest_df = ticker.history(period="1d")
            if not latest_df.empty:
                if latest_df.index.tz is not None:
                    latest_df.index = latest_df.index.tz_localize(None)
                latest_idx = pd.Timestamp(latest_df.index[-1].date())
                # Update index of latest_df to be date-only as well
                latest_df.index = [latest_idx]
                
                if latest_idx not in df.index:
                    df = pd.concat([df, latest_df])
                else:
                    latest_close = latest_df["Close"].iloc[-1]
                    if not pd.isna(latest_close):
                        df.loc[latest_idx, "Close"] = latest_close
                        if "Volume" in latest_df.columns:
                            df.loc[latest_idx, "Volume"] = latest_df["Volume"].iloc[-1]
        except Exception as e:
            print(f"[SectorDataLayer] Error appending latest day: {e}")
        return df

    def get_stock_data(self, symbol):
        """Fetch stock data from yfinance with caching."""
        now = time.time()
        with self.lock:
            if symbol in self.cache:
                entry = self.cache[symbol]
                if now - entry["timestamp"] < self.cache_duration:
                    return entry["data"]
        
        # Format for Indian market
        yf_symbol = f"{symbol}.NS" if "." not in symbol else symbol
        # Common symbol fixes
        SYMBOL_FIXES = {
            "M&M.NS": "M&M.NS",
            "BAJAJ-AUTO.NS": "BAJAJ-AUTO.NS",
        }
        yf_symbol = SYMBOL_FIXES.get(yf_symbol, yf_symbol)
        try:
            ticker = yf.Ticker(yf_symbol)
            hist = ticker.history(period="3mo")
            if hist.empty:
                # Try .BO (BSE) as fallback
                ticker = yf.Ticker(yf_symbol.replace(".NS", ".BO"))
                hist = ticker.history(period="3mo")
            if hist.empty:
                return None
            
            hist = self._ensure_latest_day(hist, ticker)
            hist = hist.dropna(subset=['Close'])
            if hist.empty:
                return None
            
            data = {
                "history": hist,
                "info": {}
            }
            with self.lock:
                self.cache[symbol] = {
                    "timestamp": now,
                    "data": data
                }
            return data
        except Exception as e:
            print(f"[SectorDataLayer] Error fetching {symbol}: {e}")
            return None

    def get_index_data(self, name, ticker_symbol, fallback_constituents):
        """Fetch index data. Creates a synthetic index if yfinance has no data."""
        now = time.time()
        with self.lock:
            if name in self.cache:
                entry = self.cache[name]
                if now - entry["timestamp"] < self.cache_duration:
                    return entry["data"]

        # If it's a synthetic ticker, build it directly from constituents
        if "SYNTHETIC" in ticker_symbol or ticker_symbol.startswith("NIFTY_OIL") or ticker_symbol.startswith("NIFTY_HEALTH") or ticker_symbol.startswith("NIFTY_CONSR"):
            # Build synthetic index
            data = self._build_synthetic_index(fallback_constituents)
            if data:
                data["_ticker_symbol"] = ticker_symbol
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data

        # Otherwise try to download index ticker from yfinance
        try:
            ticker = yf.Ticker(ticker_symbol)
            hist = ticker.history(period="3mo")
            is_stale = self._is_history_stale(hist)
            
            if not hist.empty:
                hist = self._ensure_latest_day(hist, ticker)
                hist = hist.dropna(subset=['Close'])
                
            if hist.empty or len(hist) < 5 or is_stale:
                # Fallback to synthetic index
                data = self._build_synthetic_index(fallback_constituents)
            else:
                data = {
                    "history": hist,
                    "is_synthetic": False,
                    "_ticker_symbol": ticker_symbol
                }
            
            if data:
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data
        except Exception:
            data = self._build_synthetic_index(fallback_constituents)
            if data:
                data["_ticker_symbol"] = ticker_symbol
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data
        return None

    def _build_synthetic_index(self, constituents):
        """Builds a synthetic index by averaging performance of major constituent stocks."""
        dfs = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_stock = {executor.submit(self.get_stock_data, sym): sym for sym in constituents[:5]}
            for future in concurrent.futures.as_completed(future_to_stock):
                res = future.result()
                if res and not res["history"].empty:
                    dfs.append(res["history"][["Close", "Volume"]])
        
        if not dfs:
            return None
        
        # Align all dates by taking an average daily return
        returns_df = pd.DataFrame()
        for idx, df in enumerate(dfs):
            # Normalize index to timezone-naive to avoid "Cannot join tz-naive with tz-aware" errors
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            # Calculate daily returns
            pct = df["Close"].pct_change().fillna(0)
            returns_df[f"stock_{idx}"] = pct
            
        mean_returns = returns_df.mean(axis=1)
        # Reconstruct cumulative index starting at 1000
        synthetic_close = [1000.0]
        for r in mean_returns.iloc[1:]:
            synthetic_close.append(synthetic_close[-1] * (1.0 + r))
            
        # Build dummy dataframe matching dates of the returns
        hist_df = pd.DataFrame(index=returns_df.index)
        hist_df["Close"] = synthetic_close
        hist_df["Volume"] = 1000000.0  # Dummy volume
        
        return {
            "history": hist_df,
            "is_synthetic": True
        }

    def prefetch_batch(self):
        """Bulk-download ALL stocks + index tickers in 2 yf.download() calls.
        Seeds self.cache so individual get_stock_data/get_index_data calls hit cache."""
        now = time.time()

        # --- Collect all unique stock symbols ---
        all_stocks = set()
        for cfg in SECTORS_CONFIG.values():
            for sym in cfg["constituents"]:
                all_stocks.add(sym)

        # --- Collect all real index tickers (skip SYNTHETIC / NIFTY_ prefixed) ---
        all_indices = set()
        for cfg in SECTORS_CONFIG.values():
            t = cfg["ticker"]
            if "SYNTHETIC" not in t and not t.startswith("NIFTY_"):
                all_indices.add(t)
        all_indices.add("^NSEI")  # always include Nifty 50

        # --- Batch download stocks (3mo daily) ---
        try:
            ns_symbols = [f"{s}.NS" for s in all_stocks]
            print(f"[Batch] Downloading {len(ns_symbols)} stocks...")
            batch = yf.download(
                ns_symbols,
                period="3mo",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True
            )
            for sym in all_stocks:
                yf_sym = f"{sym}.NS"
                try:
                    if isinstance(batch.columns, pd.MultiIndex):
                        if yf_sym in batch.columns.get_level_values(0):
                            df = batch[yf_sym].dropna(how="all")
                        else:
                            continue
                    else:
                        df = batch.dropna(how="all")
                    if df.empty or "Close" not in df.columns:
                        continue
                    df = df[["Close", "Volume"]].dropna(subset=["Close"])
                    with self.lock:
                        self.cache[sym] = {
                            "timestamp": now,
                            "data": {"history": df, "info": {}}
                        }
                except Exception:
                    pass
            print(f"[Batch] Stocks cached: {len([k for k in self.cache if '.' not in k])}")
        except Exception as e:
            print(f"[Batch] Stock download error: {e}")

        # --- Batch download index tickers (3mo daily) ---
        try:
            idx_list = list(all_indices)
            print(f"[Batch] Downloading {len(idx_list)} indices...")
            ibatch = yf.download(
                idx_list,
                period="3mo",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True
            )
            for ticker_sym in idx_list:
                try:
                    if isinstance(ibatch.columns, pd.MultiIndex):
                        if ticker_sym in ibatch.columns.get_level_values(0):
                            df = ibatch[ticker_sym].dropna(how="all")
                        else:
                            continue
                    else:
                        df = ibatch.dropna(how="all")
                    if df.empty or "Close" not in df.columns:
                        continue
                    df = df[["Close", "Volume"]].dropna(subset=["Close"])
                    # Find which sector this ticker belongs to
                    for s_name, cfg in SECTORS_CONFIG.items():
                        if cfg["ticker"] == ticker_sym:
                            with self.lock:
                                self.cache[s_name] = {
                                    "timestamp": now,
                                    "data": {
                                        "history": df,
                                        "is_synthetic": False,
                                        "_ticker_symbol": ticker_sym
                                    }
                                }
                except Exception:
                    pass
            print("[Batch] Indices cached.")
        except Exception as e:
            print(f"[Batch] Index download error: {e}")

    def fetch_all_sectors_data(self):
        """Prefetch all data in batch, then process sectors concurrently."""
        # One batch call seeds the cache for all get_stock_data/get_index_data calls
        self.prefetch_batch()

        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_sector = {
                executor.submit(self.get_index_data, name, cfg["ticker"], cfg["constituents"]): name
                for name, cfg in SECTORS_CONFIG.items()
            }
            for future in concurrent.futures.as_completed(future_to_sector):
                name = future_to_sector[future]
                try:
                    results[name] = future.result()
                except Exception as e:
                    print(f"[SectorDataLayer] Error loading sector {name}: {e}")
                    results[name] = None
        return results
