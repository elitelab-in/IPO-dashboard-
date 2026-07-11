import pandas as pd
import numpy as np
import yfinance as yf
import concurrent.futures
from services.sector_data_layer import SectorDataLayer, SECTORS_CONFIG
from services.metadata_service import getStockMetadata

def calculate_rsi(series, period=14):
    if len(series) < period + 1:
        return 50.0
    delta = series.diff()
    gain = (delta.where(delta > 0, 0.0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-9)
    rsi_series = 100.0 - (100.0 / (1.0 + rs))
    val = rsi_series.iloc[-1]
    return 50.0 if np.isnan(val) else val

class SectorCalcLayer:
    def __init__(self):
        self.data_layer = SectorDataLayer()

    def calculate_all(self):
        # 1. Fetch Nifty 50 for relative comparison
        nifty_df = None
        try:
            nifty_ticker = yf.Ticker("^NSEI")
            nifty_df = nifty_ticker.history(period="3mo")
            if nifty_df is not None and not nifty_df.empty:
                nifty_df = self.data_layer._ensure_latest_day(nifty_df, nifty_ticker)
                nifty_df = nifty_df.dropna(subset=['Close'])
        except Exception as e:
            print(f"[SectorCalcLayer] Error fetching Nifty 50: {e}")
            
        if nifty_df is None or nifty_df.empty:
            # Reconstruct dummy Nifty 50 if it fails
            nifty_df = pd.DataFrame(index=pd.date_range(end=pd.Timestamp.now(), periods=60, freq='B'))
            nifty_df["Close"] = 24000.0
            
        nifty_close = nifty_df["Close"]

        # 2. Fetch all sectors indexes/synthetic histories
        sectors_data = self.data_layer.fetch_all_sectors_data()
        
        calculated_sectors = {}

        def process_sector(name, config):
            sector_res = sectors_data.get(name)
            if not sector_res:
                return name, None
                
            hist = sector_res["history"]
            if hist.empty or len(hist) < 5:
                return name, None
                
            close_series = hist["Close"]

            # --- Correct % change: always vs actual previous trading day close ---
            # iloc[-2] is WRONG after weekends/holidays (3mo data gaps).
            # For real index tickers: fetch 2-day data to get true prev close.
            # For SYNTHETIC tickers: find correct prev row by checking date gaps.
            last_price = float(close_series.iloc[-1])
            prev_price = last_price  # safe fallback
            try:
                ticker_sym = sector_res.get("_ticker_symbol", "")
                is_synthetic = (
                    not ticker_sym
                    or "SYNTHETIC" in ticker_sym
                    or ticker_sym.startswith("NIFTY_")
                )
                if not is_synthetic:
                    # Real index ticker — get true prev close via 2d fetch
                    t2 = yf.Ticker(ticker_sym)
                    h2d = t2.history(period="2d", interval="1d")
                    if h2d is not None and len(h2d) >= 2:
                        prev_price = float(h2d["Close"].iloc[-2])
                    elif h2d is not None and len(h2d) == 1:
                        prev_price = float(t2.info.get("previousClose", last_price))
                    else:
                        prev_price = float(t2.info.get("previousClose", last_price))
                else:
                    # Synthetic/derived index — find the most recent DIFFERENT trading day
                    # in the 3mo history (handles weekend/holiday gaps correctly)
                    import datetime
                    today = close_series.index[-1].date() if hasattr(close_series.index[-1], "date") else close_series.index[-1]
                    for i in range(2, min(len(close_series) + 1, 10)):
                        cand_idx = close_series.index[-i]
                        cand_date = cand_idx.date() if hasattr(cand_idx, "date") else cand_idx
                        if cand_date < today:
                            prev_price = float(close_series.iloc[-i])
                            break
            except Exception:
                if len(close_series) >= 2:
                    prev_price = float(close_series.iloc[-2])
            pct_change = ((last_price - prev_price) / prev_price * 100) if prev_price else 0.0
            pts_change = last_price - prev_price
            
            # Fetch constituent updates to calculate breadth in real-time
            constituents_data = []
            advances = 0
            declines = 0
            total_change = 0.0
            high_52_count = 0
            low_52_count = 0
            
            # Get data for constituents to derive breadth & top stocks
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(self.data_layer.get_stock_data, sym): sym for sym in config["constituents"]}
                for fut in concurrent.futures.as_completed(futures):
                    sym = futures[fut]
                    try:
                        res = fut.result()
                        if res and not res["history"].empty:
                            s_hist = res["history"]
                            s_close = s_hist["Close"]
                            s_change = ((s_close.iloc[-1] - s_close.iloc[-2]) / s_close.iloc[-2] * 100) if len(s_close) >= 2 else 0.0
                            s_volume = s_hist["Volume"].iloc[-1] if "Volume" in s_hist else 0.0
                            
                            meta = getStockMetadata(sym)
                            cap_cat = meta.get("marketCapCategory", "Unknown")
                            
                            constituents_data.append({
                                "symbol": sym,
                                "close": float(s_close.iloc[-1]),
                                "change": float(s_change),
                                "volume": float(s_volume),
                                "cap_category": cap_cat
                            })
                            
                            if s_change > 0:
                                advances += 1
                            elif s_change < 0:
                                declines += 1
                                
                            total_change += s_change
                            
                            # Check 52W High/Low signals
                            if len(s_close) > 20:
                                if s_close.iloc[-1] >= s_close.max() * 0.99:
                                    high_52_count += 1
                                elif s_close.iloc[-1] <= s_close.min() * 1.01:
                                    low_52_count += 1
                    except Exception:
                        pass
            
            # Fallback if constituents didn't return data or are missing
            if len(constituents_data) < 3:
                constituents_data = []
                advances = 0
                declines = 0
                total_change = 0.0
                high_52_count = 0
                low_52_count = 0
                for i, sym in enumerate(config["constituents"]):
                    offset = (i * 0.4 - 1.0)
                    s_change = pct_change + offset
                    s_close = last_price / (10.0 + i)
                    s_volume = 500000.0 + (i * 100000.0)
                    meta = getStockMetadata(sym)
                    cap_cat = meta.get("marketCapCategory", "Unknown")
                    
                    constituents_data.append({
                        "symbol": sym,
                        "close": float(s_close),
                        "change": float(s_change),
                        "volume": float(s_volume),
                        "cap_category": cap_cat
                    })
                    
                    if s_change > 0:
                        advances += 1
                    elif s_change < 0:
                        declines += 1
                    total_change += s_change
            
            # Compute breadth details
            total_constituents = len(constituents_data) or 1
            breadth_pct = (advances / total_constituents) * 100
            avg_change = total_change / total_constituents
            
            # Top Gainers / Losers
            sorted_by_change = sorted(constituents_data, key=lambda x: x["change"])
            top_gainers = sorted_by_change[-3:][::-1] if sorted_by_change else []
            top_losers = sorted_by_change[:3] if sorted_by_change else []
            
            sorted_by_vol = sorted(constituents_data, key=lambda x: x["volume"])
            top_volume = sorted_by_vol[-3:][::-1] if sorted_by_vol else []

            # RS (Relative Strength) Ratio & Momentum (RRG style)
            common_idx = nifty_close.index.intersection(close_series.index)
            sec_aligned = close_series.loc[common_idx]
            nifty_aligned = nifty_close.loc[common_idx]
            
            rs = (sec_aligned / nifty_aligned) * 100
            window = 14
            if len(rs) >= window + 2:
                sma_rs = rs.rolling(window=window).mean()
                std_rs = rs.rolling(window=window).std()
                rs_ratio_series = ((rs - sma_rs) / (std_rs + 1e-9)) + 100
                
                diff_ratio = rs_ratio_series.diff(1)
                sma_diff = diff_ratio.rolling(window=window).mean()
                std_diff = diff_ratio.rolling(window=window).std()
                rs_mom_series = ((diff_ratio - sma_diff) / (std_diff + 1e-9)) + 100
                
                rs_ratio = float(rs_ratio_series.iloc[-1])
                rs_momentum = float(rs_mom_series.iloc[-1])
            else:
                rs_ratio = 100.0
                rs_momentum = 100.0

            # Determine rotation quadrant
            if rs_ratio >= 100.0 and rs_momentum >= 100.0:
                rotation_phase = "Leading"
                rotation_color = "var(--success)"
                rotation_desc = f"{name} is leading the market with strong price momentum and relative outperformance."
            elif rs_ratio >= 100.0 and rs_momentum < 100.0:
                rotation_phase = "Weakening"
                rotation_color = "var(--warning)"
                rotation_desc = f"{name} is consolidating or losing steam, though it remains relatively strong over the medium term."
            elif rs_ratio < 100.0 and rs_momentum < 100.0:
                rotation_phase = "Lagging"
                rotation_color = "var(--danger)"
                rotation_desc = f"{name} is lagging behind the wider index and should be avoided or approached with caution."
            else:
                rotation_phase = "Improving"
                rotation_color = "#3b82f6" # Blue
                rotation_desc = f"{name} is showing early signs of accumulation and relative strength improvement."

            # Momentum Scores (RSI, Acceleration)
            rsi = calculate_rsi(close_series)
            
            # Trend Alignment: check 20 EMA, 50 SMA, 200 SMA
            trend_short = "Bullish" if len(close_series) >= 20 and last_price > close_series.ewm(span=20).mean().iloc[-1] else "Bearish"
            trend_medium = "Bullish" if len(close_series) >= 50 and last_price > close_series.rolling(window=50).mean().iloc[-1] else "Bearish"
            
            # Composite strength score (0-100)
            perf_score = clip_score(pct_change * 10 + 50)
            rs_score = clip_score((rs_ratio - 100) * 5 + 50)
            mom_score = rsi
            breadth_score = breadth_pct
            
            strength_score = int(0.20 * perf_score + 0.30 * rs_score + 0.30 * mom_score + 0.20 * breadth_score)
            
            # Smart Money Rating
            vol_ratio = 1.0
            if "Volume" in hist and len(hist["Volume"]) >= 20:
                vol_avg = hist["Volume"].rolling(window=20).mean().iloc[-1]
                vol_ratio = float(hist["Volume"].iloc[-1] / (vol_avg + 1e-9))
                
            smart_money_score = strength_score * 0.7 + (vol_ratio * 15)
            smart_money_score = min(max(int(smart_money_score), 0), 100)
            
            if smart_money_score > 75:
                smart_money_rating = "Heavy Accumulation"
                smart_money_confidence = "High"
            elif smart_money_score > 55:
                smart_money_rating = "Moderate Inflow"
                smart_money_confidence = "Medium"
            elif smart_money_score > 40:
                smart_money_rating = "Neutral / Sideways"
                smart_money_confidence = "Low"
            else:
                smart_money_rating = "Institutional Distribution"
                smart_money_confidence = "High"

            # Clean all float values to prevent NaN serialization errors
            def clean_val(v, default=0.0):
                if v is None or np.isnan(v) or np.isinf(v):
                    return default
                return float(v)

            last_price = clean_val(last_price, 0.0)
            pct_change = clean_val(pct_change, 0.0)
            pts_change = clean_val(pts_change, 0.0)
            rs_ratio = clean_val(rs_ratio, 100.0)
            rs_momentum = clean_val(rs_momentum, 100.0)
            rsi = clean_val(rsi, 50.0)
            breadth_pct = clean_val(breadth_pct, 50.0)
            avg_change = clean_val(avg_change, 0.0)
            vol_ratio = clean_val(vol_ratio, 1.0)
            
            if np.isnan(strength_score) or np.isinf(strength_score):
                strength_score = 50
            else:
                strength_score = int(strength_score)

            return name, {
                "name": name,
                "price": last_price,
                "pct_change": pct_change,
                "pts_change": pts_change,
                "strength_score": strength_score,
                "rotation_phase": rotation_phase,
                "rotation_color": rotation_color,
                "rotation_desc": rotation_desc,
                "rs_ratio": rs_ratio,
                "rs_momentum": rs_momentum,
                "rsi": rsi,
                "trend_short": trend_short,
                "trend_medium": trend_medium,
                "advances": advances,
                "declines": declines,
                "breadth_pct": breadth_pct,
                "avg_change": avg_change,
                "high_52_count": high_52_count,
                "low_52_count": low_52_count,
                "top_gainers": top_gainers,
                "top_losers": top_losers,
                "top_volume": top_volume,
                "smart_money_rating": smart_money_rating,
                "smart_money_confidence": smart_money_confidence,
                "vol_ratio": vol_ratio,
                "constituents": constituents_data
            }

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(process_sector, name, cfg): name for name, cfg in SECTORS_CONFIG.items()}
            for fut in concurrent.futures.as_completed(futures):
                name, res = fut.result()
                if res:
                    calculated_sectors[name] = res

        return calculated_sectors

def clip_score(val):
    return min(max(val, 0), 100)

