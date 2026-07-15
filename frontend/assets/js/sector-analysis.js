let allSectors = {};
let selectedSectorName = null;
let currentFilter = 'all';
let autoRefreshTimer = null;
let heatmapLiveTimer = null;
let countdownSeconds = 180; // 3 minutes — matches server cache refresh
let lastSectorSnapshot = {}; // for diff-based tile updates

// Check if NSE market is currently open (IST 09:15 - 15:30, Mon-Fri)
function isMarketOpen() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 3600000);
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return mins >= 555 && mins < 930; // 9:15 to 15:30
}

document.addEventListener('DOMContentLoaded', () => {
    fetchSectorAnalysis();
    fetchNsdlFpiFlows();
    setupFilters();
    startCountdown();
    startHeatmapLivePoll();
    startLiveTickingEngine();
});

function fetchSectorAnalysis() {
    const container = document.getElementById('heatmap-container');
    
    fetch('/api/sector-analysis')
        .then(res => {
            if (res.status === 401) {
                showPremiumLockOverlay(true);
                throw new Error('Login required');
            }
            if (res.status === 402 || res.status === 403) {
                showPremiumLockOverlay(false);
                throw new Error('Subscription required');
            }
            if (!res.ok) throw new Error('API Response Error');
            return res.json();
        })
        .then(res => {
            if (res.status === 'success' && res.data) {
                allSectors = res.data.sectors;
                
                // Set FPI/DII stats
                const fpiData = res.data.fpi_dii_summary;
                if (fpiData) {
                    const fiiNet = fpiData.fii_net !== undefined ? fpiData.fii_net : 0.0;
                    const diiNet = fpiData.dii_net !== undefined ? fpiData.dii_net : 0.0;
                                       const fiiBuyEl = document.getElementById('fii-buy');
                    if (fiiBuyEl) fiiBuyEl.innerText = fpiData.fii_buy ? fpiData.fii_buy.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const fiiSellEl = document.getElementById('fii-sell');
                    if (fiiSellEl) fiiSellEl.innerText = fpiData.fii_sell ? fpiData.fii_sell.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const fiiNetEl = document.getElementById('fii-net');
                    if (fiiNetEl) {
                        fiiNetEl.innerText = `${fiiNet >= 0 ? '+' : ''}${fiiNet.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
                        fiiNetEl.style.color = fiiNet >= 0 ? 'var(--success)' : 'var(--danger)';
                    }
                    
                    const diiBuyEl = document.getElementById('dii-buy');
                    if (diiBuyEl) diiBuyEl.innerText = fpiData.dii_buy ? fpiData.dii_buy.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const diiSellEl = document.getElementById('dii-sell');
                    if (diiSellEl) diiSellEl.innerText = fpiData.dii_sell ? fpiData.dii_sell.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const diiNetEl = document.getElementById('dii-net');
                    if (diiNetEl) {
                        diiNetEl.innerText = `${diiNet >= 0 ? '+' : ''}${diiNet.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
                        diiNetEl.style.color = diiNet >= 0 ? 'var(--success)' : 'var(--danger)';
                    }

                    const fiiRatioBar = document.getElementById('fii-ratio-bar');
                    if (fiiRatioBar) {
                        const totalFii = (fpiData.fii_buy || 0) + (fpiData.fii_sell || 0);
                        const fiiPct = totalFii > 0 ? ((fpiData.fii_buy || 0) / totalFii) * 100 : 50;
                        fiiRatioBar.style.width = `${fiiPct}%`;
                        fiiRatioBar.style.backgroundColor = fiiNet >= 0 ? '#22c55e' : '#ef4444';
                    }
                    const diiRatioBar = document.getElementById('dii-ratio-bar');
                    if (diiRatioBar) {
                        const totalDii = (fpiData.dii_buy || 0) + (fpiData.dii_sell || 0);
                        const diiPct = totalDii > 0 ? ((fpiData.dii_buy || 0) / totalDii) * 100 : 50;
                        diiRatioBar.style.width = `${diiPct}%`;
                        diiRatioBar.style.backgroundColor = diiNet >= 0 ? '#22c55e' : '#ef4444';
                    }
 
                    const fpiTrendEl = document.getElementById('fpi-trend');
                    if (fpiTrendEl) fpiTrendEl.innerText = fpiData.trend || 'Mixed Rotation Flow';
                    
                    const fpiDateEl = document.getElementById('fpi-date');
                    if (fpiDateEl) fpiDateEl.innerText = fpiData.date ? `As of ${fpiData.date}` : '';
 
                    const ratingBadge = document.getElementById('fpi-rating');
                    if (ratingBadge && fpiData.positioning_rating) {
                        ratingBadge.innerText = fpiData.positioning_rating.toUpperCase();
                        if (fpiData.positioning_rating === 'Bullish') {
                            ratingBadge.style.background = 'rgba(34, 197, 94, 0.15)';
                            ratingBadge.style.color = '#22c55e';
                        } else if (fpiData.positioning_rating === 'Bearish') {
                            ratingBadge.style.background = 'rgba(239, 68, 68, 0.15)';
                            ratingBadge.style.color = '#ef4444';
                        } else {
                            ratingBadge.style.background = 'rgba(245, 158, 11, 0.15)';
                            ratingBadge.style.color = '#f59e0b';
                        }
                    }
                }

                // Set AI summary text
                const aiSummaryEl = document.getElementById('ai-summary-text');
                if (aiSummaryEl) aiSummaryEl.innerText = res.data.ai_summary || '';

                // Populate the shareable FII/DII banner with live data
                if (typeof populateBanner === 'function' && res.data.fpi_dii_summary) {
                    populateBanner(res.data.fpi_dii_summary);
                }

                // Render components
                renderHeatmap();
                renderRotationQuadrants();

                // Seed the snapshot so first live-poll diff works correctly
                Object.entries(allSectors).forEach(([k, v]) => {
                    lastSectorSnapshot[k] = { ...v };
                });
                
                // Select first sector if none selected
                if (!selectedSectorName && Object.keys(allSectors).length > 0) {
                    selectSector(Object.keys(allSectors)[0]);
                } else if (selectedSectorName) {
                    selectSector(selectedSectorName);
                }
            }
        })
        .catch(err => {
            console.error('Error loading sector analysis:', err);
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; grid-column: 1 / -1; padding: 2rem; color: var(--danger);">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Failed to load sector metrics. Error: ${err.message}</p>
                        <pre style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; text-align: left; background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; overflow-x: auto; white-space: pre-wrap;">${err.stack || err.toString()}</pre>
                    </div>
                `;
            }
        });
}

function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    
    container.innerHTML = '';
    const sectorsArray = Object.values(allSectors);
    
    // Filter logic
    let filtered = sectorsArray;
    if (currentFilter === 'strong') {
        filtered = sectorsArray.filter(s => s.strength_score >= 60);
    } else if (currentFilter === 'weak') {
        filtered = sectorsArray.filter(s => s.strength_score < 40);
    } else if (currentFilter === 'bullish') {
        filtered = sectorsArray.filter(s => s.rsi >= 55);
    } else if (currentFilter === 'bearish') {
        filtered = sectorsArray.filter(s => s.rsi < 45);
    } else if (currentFilter === 'high-vol') {
        filtered = sectorsArray.filter(s => s.vol_ratio >= 1.1);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 2rem; color: var(--text-secondary);">
                <p>No sectors match the active filter criteria.</p>
            </div>
        `;
        return;
    }

    // Sort by strength score descending
    filtered.sort((a, b) => b.strength_score - a.strength_score);

    filtered.forEach(s => {
        const change = s.pct_change;
        let themeClass = 'tile-neutral';
        if (change > 1.5) themeClass = 'tile-very-bullish';
        else if (change > 0.3) themeClass = 'tile-bullish';
        else if (change < -1.5) themeClass = 'tile-very-weak';
        else if (change < -0.3) themeClass = 'tile-weak';

        const activeClass = selectedSectorName === s.name ? 'active' : '';

        const tile = document.createElement('div');
        tile.className = `sector-tile ${themeClass} ${activeClass}`;
        tile.setAttribute('data-sector', s.name);
        tile.innerHTML = `
            <div>
                <h4 style="font-size: 0.95rem; font-weight: 700; color: #ffffff; margin-bottom: 0.25rem;">${s.name}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
                    <span class="live-change" style="font-size: 0.85rem; font-weight: 700; color: ${change >= 0 ? 'var(--success)' : 'var(--danger)'}">
                        ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                    </span>
                    <span class="live-pts" style="font-size: 0.75rem; color: var(--text-secondary);">${s.pts_change >= 0 ? '+' : ''}${s.pts_change.toFixed(1)} pts</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;">
                <span style="color: var(--text-secondary);"><i class="fa-solid fa-shuffle"></i> ${s.advances}/${s.declines}</span>
                <span class="live-score" style="background: rgba(255,255,255,0.06); padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; color: #ffffff;">Sc: ${s.strength_score}</span>
            </div>
        `;
        tile.addEventListener('click', () => {
            document.querySelectorAll('.sector-tile').forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            selectSector(s.name);
        });
        container.appendChild(tile);
    });
}

// Lightweight heatmap-only poll — updates tile values in-place without full rebuild
function fetchHeatmapOnly() {
    if (!isMarketOpen()) return; // only poll during market hours
    fetch('/api/sector-analysis')
        .then(r => r.ok ? r.json() : null)
        .then(res => {
            if (!res || res.status !== 'success' || !res.data) return;
            const newSectors = res.data.sectors;
            if (!newSectors) return;

            let anyChanged = false;

            Object.entries(newSectors).forEach(([key, s]) => {
                const old = lastSectorSnapshot[key];
                // Round to 2dp before comparing to avoid float drift false-misses
                const changed = !old
                    || parseFloat((old.pct_change || 0).toFixed(2)) !== parseFloat((s.pct_change || 0).toFixed(2))
                    || old.strength_score !== s.strength_score
                    || parseFloat((old.pts_change || 0).toFixed(1)) !== parseFloat((s.pts_change || 0).toFixed(1));

                if (changed) {
                    anyChanged = true;
                    allSectors[key] = s;
                    lastSectorSnapshot[key] = { ...s };

                    // Find the tile for this sector and update in-place
                    // Use .trim() — browser adds whitespace to innerText
                    document.querySelectorAll('.sector-tile').forEach(tile => {
                        const h4 = tile.querySelector('h4');
                        if (!h4 || h4.innerText.trim() !== (s.name || '').trim()) return;

                        // Update change color class
                        tile.classList.remove('tile-very-bullish','tile-bullish','tile-neutral','tile-weak','tile-very-weak');
                        const change = s.pct_change;
                        if (change > 1.5) tile.classList.add('tile-very-bullish');
                        else if (change > 0.3) tile.classList.add('tile-bullish');
                        else if (change < -1.5) tile.classList.add('tile-very-weak');
                        else if (change < -0.3) tile.classList.add('tile-weak');
                        else tile.classList.add('tile-neutral');

                        // Update % change text
                        const changeEl = tile.querySelector('.live-change');
                        if (changeEl) {
                            changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                            changeEl.style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
                        }
                        // Update pts
                        const ptsEl = tile.querySelector('.live-pts');
                        if (ptsEl) ptsEl.innerText = `${s.pts_change >= 0 ? '+' : ''}${s.pts_change.toFixed(1)} pts`;
                        // Update score
                        const scoreEl = tile.querySelector('.live-score');
                        if (scoreEl) scoreEl.innerText = `Sc: ${s.strength_score}`;

                        // Flash pulse animation on changed tile
                        tile.classList.add('tile-flash');
                        setTimeout(() => tile.classList.remove('tile-flash'), 600);
                    });
                }
            });

            // Update live indicator
            const timerEl = document.getElementById('update-timer');
            if (timerEl && anyChanged) {
                timerEl.innerText = '⚡ Updated just now';
                setTimeout(() => {
                    if (timerEl) timerEl.innerText = `🔴 LIVE · Next full sync in ${Math.floor(countdownSeconds/60)}:${String(countdownSeconds%60).padStart(2,'0')}`;
                }, 2000);
            }
        })
        .catch(() => {});
}

function startHeatmapLivePoll() {
    if (heatmapLiveTimer) clearInterval(heatmapLiveTimer);
    // Poll every 15 seconds — server cache responds in ~20ms
    heatmapLiveTimer = setInterval(fetchHeatmapOnly, 15000);
}

function renderRotationQuadrants() {
    const listLeading = document.getElementById('quad-leading-list');
    const listWeakening = document.getElementById('quad-weakening-list');
    const listLagging = document.getElementById('quad-lagging-list');
    const listImproving = document.getElementById('quad-improving-list');

    if (listLeading) listLeading.innerHTML = '';
    if (listWeakening) listWeakening.innerHTML = '';
    if (listLagging) listLagging.innerHTML = '';
    if (listImproving) listImproving.innerHTML = '';

    Object.values(allSectors).forEach(s => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justify = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '0.2rem 0.4rem';
        item.style.borderRadius = '4px';
        item.style.background = 'rgba(255,255,255,0.02)';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <span style="color: #ffffff; font-weight: 500;">${s.name}</span>
            <span style="color: var(--text-secondary); font-size: 0.75rem;">Score: ${s.strength_score}</span>
        `;
        item.addEventListener('click', () => {
            selectSector(s.name);
            document.querySelectorAll('.sector-tile').forEach(tile => {
                const header = tile.querySelector('h4');
                if (header && header.innerText === s.name) {
                    document.querySelectorAll('.sector-tile').forEach(t => t.classList.remove('active'));
                    tile.classList.add('active');
                }
            });
        });

        if (s.rotation_phase === 'Leading' && listLeading) listLeading.appendChild(item);
        else if (s.rotation_phase === 'Weakening' && listWeakening) listWeakening.appendChild(item);
        else if (s.rotation_phase === 'Lagging' && listLagging) listLagging.appendChild(item);
        else if (s.rotation_phase === 'Improving' && listImproving) listImproving.appendChild(item);
    });
}

function selectSector(name) {
    selectedSectorName = name;
    const sector = allSectors[name];
    if (!sector) return;

    const noSelectEl = document.getElementById('no-sector-selected');
    if (noSelectEl) noSelectEl.style.display = 'none';
    
    const detailsContentEl = document.getElementById('sector-details-content');
    if (detailsContentEl) detailsContentEl.style.display = 'block';

    const nameEl = document.getElementById('detail-sector-name');
    if (nameEl) nameEl.innerText = sector.name;
    
    const priceEl = document.getElementById('detail-sector-price');
    if (priceEl) priceEl.innerText = sector.price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    
    const changeBadge = document.getElementById('detail-sector-change');
    if (changeBadge) {
        changeBadge.innerText = `${sector.pct_change >= 0 ? '+' : ''}${sector.pct_change.toFixed(2)}%`;
        changeBadge.style.color = sector.pct_change >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    const rotationAngle = -45 + (sector.strength_score / 100) * 180;
    const gaugeEl = document.getElementById('detail-strength-gauge');
    if (gaugeEl) gaugeEl.style.transform = `rotate(${rotationAngle}deg)`;
    
    const strengthValEl = document.getElementById('detail-strength-val');
    if (strengthValEl) strengthValEl.innerText = sector.strength_score;

    const rsiEl = document.getElementById('detail-rsi');
    if (rsiEl) rsiEl.innerText = sector.rsi.toFixed(1);
    
    const volEl = document.getElementById('detail-volume');
    if (volEl) volEl.innerText = `${sector.vol_ratio.toFixed(1)}x`;
    
    const breadthEl = document.getElementById('detail-breadth');
    if (breadthEl) breadthEl.innerText = `${sector.advances} Adv / ${sector.declines} Decl`;
    
    const rotBadge = document.getElementById('detail-rotation');
    if (rotBadge) {
        rotBadge.innerText = sector.rotation_phase;
        rotBadge.style.color = sector.rotation_phase === 'Leading' ? 'var(--success)' :
                               sector.rotation_phase === 'Weakening' ? 'var(--warning)' :
                               sector.rotation_phase === 'Lagging' ? 'var(--danger)' : '#3b82f6';
    }

    const smartMoneyEl = document.getElementById('detail-smart-money');
    if (smartMoneyEl) {
        smartMoneyEl.innerText = `${sector.name} matches a '${sector.smart_money_rating}' positioning profile with '${sector.smart_money_confidence}' conviction. ${sector.rotation_desc}`;
    }

    const stocksTable = document.getElementById('detail-stocks-list');
    if (stocksTable) {
        stocksTable.innerHTML = '';
        
        // Use full constituents array returned by backend if available; fallback to top_gainers + top_losers
        const sourceStocks = sector.constituents || [...sector.top_gainers, ...sector.top_losers];
        const uniqueStocks = [];
        const seen = new Set();
        sourceStocks.forEach(st => {
            if (!seen.has(st.symbol)) {
                seen.add(st.symbol);
                uniqueStocks.push(st);
            }
        });

        // Group by market capitalization
        const largeCap = [];
        const midCap = [];
        const smallCap = [];

        uniqueStocks.forEach(st => {
            const cap = (st.cap_category || 'Unknown').toLowerCase();
            if (cap === 'largecap') {
                largeCap.push(st);
            } else if (cap === 'midcap') {
                midCap.push(st);
            } else {
                // Smallcap, Microcap, or Unknown
                smallCap.push(st);
            }
        });

        // Sort each category by daily change percent descending
        const sortByChange = (list) => list.sort((a, b) => b.change - a.change);
        sortByChange(largeCap);
        sortByChange(midCap);
        sortByChange(smallCap);

        const renderCategory = (title, list) => {
            if (list.length === 0) return;

            // Cap header row
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `
                <td colspan="3" style="padding: 0.5rem 0.4rem; text-align: left; font-weight: 700; color: var(--accent-primary); background: rgba(139, 92, 246, 0.08); font-size: 0.78rem; letter-spacing: 0.05em; border-bottom: 1px solid rgba(139, 92, 246, 0.25);">
                    <i class="fa-solid fa-layer-group" style="margin-right: 0.35rem;"></i> ${title.toUpperCase()}
                </td>
            `;
            stocksTable.appendChild(headerRow);

            // Stock rows
            list.forEach(st => {
                const row = document.createElement('tr');
                row.className = 'stock-row';
                row.setAttribute('data-symbol', st.symbol);
                row.style.borderBottom = '1px solid var(--border-color)';
                row.innerHTML = `
                    <td style="padding: 0.5rem 0.4rem; text-align: left; font-weight: 600; color: #ffffff;">${st.symbol}</td>
                    <td class="stock-price" style="padding: 0.5rem 0.4rem; text-align: right; color: var(--text-primary);">${st.close.toFixed(2)}</td>
                    <td class="stock-change" style="padding: 0.5rem 0.4rem; text-align: right; font-weight: 700; color: ${st.change >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        ${st.change >= 0 ? '+' : ''}${st.change.toFixed(2)}%
                    </td>
                `;
                stocksTable.appendChild(row);
            });
        };

        renderCategory('Large Cap', largeCap);
        renderCategory('Mid Cap', midCap);
        renderCategory('Small Cap', smallCap);
    }
}

function setupFilters() {
    document.querySelectorAll('.pill-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderHeatmap();
        });
    });
}

function startCountdown() {
    countdownSeconds = 180;
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    
    autoRefreshTimer = setInterval(() => {
        countdownSeconds--;
        if (countdownSeconds <= 0) {
            fetchSectorAnalysis();
            fetchNsdlFpiFlows();
            countdownSeconds = 180;
            // Snapshot sectors after full refresh
            Object.entries(allSectors).forEach(([k,v]) => { lastSectorSnapshot[k] = {...v}; });
        }
        
        const minutes = Math.floor(countdownSeconds / 60);
        const seconds = countdownSeconds % 60;
        const timerEl = document.getElementById('update-timer');
        if (timerEl) {
            const liveLabel = isMarketOpen() ? '🔴 LIVE · ' : '';
            timerEl.innerText = `${liveLabel}Next sync in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        }
    }, 1000);
}

function fetchNsdlFpiFlows() {
    fetch('/api/fpi-nsdl')
        .then(response => {
            if (!response.ok) throw new Error('NSDL API Error');
            return response.json();
        })
        .then(res => {
            if (res.status === 'success' && res.data) {
                const nsdlData = res.data;
                
                const periodEl = document.getElementById('nsdl-period');
                if (periodEl) {
                    periodEl.innerText = nsdlData.period ? nsdlData.period.toUpperCase() : '';
                }
                
                const linkEl = document.getElementById('nsdl-report-link');
                if (linkEl && nsdlData.report_url) {
                    linkEl.href = nsdlData.report_url;
                }
                
                const inflowsList = document.getElementById('nsdl-inflows-list');
                if (inflowsList) {
                    inflowsList.innerHTML = '';
                    if (nsdlData.top_inflows && nsdlData.top_inflows.length > 0) {
                        nsdlData.top_inflows.forEach(item => {
                            const valFormatted = `+${item.net_latest.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
                            const row = document.createElement('div');
                            row.style.display = 'flex';
                            row.style.justify = 'space-between';
                            row.style.alignItems = 'center';
                            row.style.padding = '2px 0';
                            row.innerHTML = `
                                <span style="font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem; flex: 1;" title="${item.sector}">${item.sector}</span>
                                <span style="color: var(--success); font-weight: 700; font-family: monospace; white-space: nowrap;">${valFormatted}</span>
                            `;
                            inflowsList.appendChild(row);
                        });
                    } else {
                        inflowsList.innerHTML = '<div style="color: var(--text-secondary);">No inflows</div>';
                    }
                }
                
                const outflowsList = document.getElementById('nsdl-outflows-list');
                if (outflowsList) {
                    outflowsList.innerHTML = '';
                    if (nsdlData.top_outflows && nsdlData.top_outflows.length > 0) {
                        nsdlData.top_outflows.forEach(item => {
                            const valFormatted = `${item.net_latest.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
                            const row = document.createElement('div');
                            row.style.display = 'flex';
                            row.style.justify = 'space-between';
                            row.style.alignItems = 'center';
                            row.style.padding = '2px 0';
                            row.innerHTML = `
                                <span style="font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem; flex: 1;" title="${item.sector}">${item.sector}</span>
                                <span style="color: var(--danger); font-weight: 700; font-family: monospace; white-space: nowrap;">${valFormatted}</span>
                            `;
                            outflowsList.appendChild(row);
                        });
                    } else {
                        outflowsList.innerHTML = '<div style="color: var(--text-secondary);">No outflows</div>';
                    }
                }

                // Populate the FPI share banner with top 3 inflows/outflows
                if (typeof populateFpiBanner === 'function') {
                    populateFpiBanner({
                        period: nsdlData.period || '',
                        inflows: nsdlData.top_inflows || [],
                        outflows: nsdlData.top_outflows || []
                    });
                }
            }
        })
        .catch(err => {
            console.error('Error fetching NSDL FPI flows:', err);
            const periodEl = document.getElementById('nsdl-period');
            if (periodEl) periodEl.innerText = 'FETCH FAILED';
        });
}

let sectorSelectedPlanId = null;
let sectorActiveOrderId = null;
let sectorPlanName = "";

window.sectorInitiateSubscription = function(planId, isFree, loggedIn, planName) {
    if (!loggedIn) {
        if (isFree) {
            window.location.href = `/register`;
        } else {
            window.location.href = `/login?next=/sector-analysis`;
        }
        return;
    }
    
    if (isFree) {
        window.location.reload();
        return;
    }
    
    sectorSelectedPlanId = planId;
    sectorPlanName = planName;
    
    // Create payment order
    fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId })
    })
    .then(res => res.json())
    .then(orderData => {
        if (orderData.status === 'success') {
            sectorActiveOrderId = orderData.order_id;
            
            // Fill modal details
            document.getElementById('sec-modal-plan-name').innerText = orderData.plan_name;
            document.getElementById('sec-modal-order-id').innerText = orderData.order_id;
            document.getElementById('sec-modal-amount').innerText = `₹${parseFloat(orderData.amount / 100).toFixed(2)}`;
            
            // Display modal
            document.getElementById('sec-payment-status-message').style.display = 'none';
            document.getElementById('sector-payment-modal').classList.add('active');
        } else {
            alert(orderData.message || 'Error creating payment order.');
        }
    })
    .catch(err => {
        console.error(err);
        alert('Payment system error. Please try again.');
    });
};

window.closeSectorPaymentModal = function() {
    document.getElementById('sector-payment-modal').classList.remove('active');
};

window.executeSectorMockPayment = function(isSuccess) {
    const statusBox = document.getElementById('sec-payment-status-message');
    statusBox.style.display = 'none';
    
    if (!isSuccess) {
        statusBox.innerText = 'Checkout Simulation: Payment was declined or cancelled by the user.';
        statusBox.style.display = 'block';
        return;
    }

    // Simulate sending Razorpay transaction ID, Order ID and mock signature
    const paymentPayload = {
        plan_id: sectorSelectedPlanId,
        razorpay_order_id: sectorActiveOrderId,
        razorpay_payment_id: `pay_mock_${Math.floor(Math.random() * 900000) + 100000}`,
        razorpay_signature: `sig_mock_${Math.floor(Math.random() * 90000000) + 10000000}`
    };

    const successBtn = document.getElementById('sec-btn-pay-success');
    successBtn.disabled = true;
    successBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying signature...';

    fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload)
    })
    .then(res => res.json())
    .then(verifyData => {
        if (verifyData.status === 'success') {
            successBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Activated!';
            setTimeout(() => {
                window.closeSectorPaymentModal();
                window.location.reload(); // Reload page to unlock sector data in-place!
            }, 1500);
        } else {
            statusBox.innerText = verifyData.message || 'Signature verification failed.';
            statusBox.style.display = 'block';
            successBtn.disabled = false;
            successBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Simulate Payment Success';
        }
    })
    .catch(err => {
        console.error(err);
        statusBox.innerText = 'Network error during payment verification.';
        statusBox.style.display = 'block';
        successBtn.disabled = false;
        successBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Simulate Payment Success';
    });
};

function showPremiumLockOverlay(isNotLoggedIn) {
    const container = document.querySelector('.page-container');
    if (!container) return;
    
    // Clear live polling interval to save server resources
    if (typeof heatmapLiveTimer !== 'undefined') {
        clearInterval(heatmapLiveTimer);
    }
    
    container.style.marginTop = '4rem';
    container.style.marginBottom = '4rem';
    
    // Show a loading spinner first while we fetch active plans and status
    container.innerHTML = `
        <div style="text-align: center; padding: 4rem;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 1.5rem;"></i>
            <p style="color: var(--text-secondary);">Loading secure pricing matrix...</p>
        </div>
    `;

    Promise.all([
        fetch('/api/auth/status').then(r => r.json()),
        fetch('/api/plans').then(r => r.json())
    ]).then(([authData, plansData]) => {
        const allPlans = plansData.plans || [];
        const loggedIn = authData.logged_in;
        let billingCycle = 'monthly';
        
        function renderOverlayContent() {
            let headingText = "Unlock Sector Rotation Analysis";
            let descText = 'Sector Rotation analysis is a premium feature reserved for active subscribers. Choose a plan to unlock FII/DII activities, advanced heatmaps, and trend trackers.';
            
            if (isNotLoggedIn) {
                descText = 'Please <a href="/login?next=/sector-analysis" class="highlight-text" style="font-weight: 700; text-decoration: underline;">log in</a> or <a href="/register" class="highlight-text" style="font-weight: 700; text-decoration: underline;">create an account</a> to access premium Sector Rotations, FII/DII Net Flow Trackers, and Market Breadth indicators.';
            }

            // Filter plans based on billingCycle
            const filtered = allPlans.filter(p => {
                if (p.plan_name === 'Free Plan') return true;
                if (billingCycle === 'monthly') {
                    return p.plan_name.toLowerCase().includes('monthly');
                } else {
                    return p.plan_name.toLowerCase().includes('yearly');
                }
            });

            // Map plans to cards html
            const cardsHtml = filtered.map(plan => {
                const isPro = plan.plan_name.toLowerCase().includes('pro');
                const isFree = plan.plan_name === 'Free Plan';
                
                // Set features array manually to map cleanly
                let features = [];
                if (isFree) {
                    features = ["Macro economy analyzer", "Fundamental analysis", "Sector heatmap", "Real-time market data", "Real-time News"];
                } else if (!isPro) {
                    features = ["Macro economy analyzer", "Fundamental analysis", "Sector analysis", "FII DII data", "FPI flow", "Real-time News"];
                } else {
                    features = ["Macro economy analyzer", "Fundamental & Sector analysis", "FII DII data & FPI flow", "AI auto screener", "Alerts", "Real-time News"];
                }

                const featuresHtml = features.map(f => `
                    <li class="feature-item" style="color: var(--text-primary); font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <i class="fa-solid fa-circle-check" style="color: var(--success);"></i> ${f}
                    </li>
                `).join('');

                const priceDisplay = isFree ? '₹0' : `₹${plan.price}`;
                const periodStr = isFree ? '/ forever' : (billingCycle === 'monthly' ? '/ month' : '/ year');
                
                let btnText = "Subscribe Now";
                let btnClass = isPro ? "btn btn-primary" : "btn btn-secondary";
                if (isFree) {
                    btnText = loggedIn ? "Active (Free)" : "Get Started";
                }

                return `
                    <div class="pricing-card ${isPro ? 'popular' : ''}" style="flex: 1; min-width: 230px; background: rgba(255, 255, 255, 0.02); border: 1px solid ${isPro ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)'}; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; position: relative;">
                        ${isPro ? '<span class="badge-popular" style="position: absolute; top: 12px; right: 12px; background: var(--accent-primary); color: #fff; padding: 2px 8px; border-radius: 8px; font-size: 0.65rem; font-weight: 700;">RECOMMENDED</span>' : ''}
                        <h3 class="plan-name" style="font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">${plan.plan_name}</h3>
                        <div class="plan-price-box" style="margin: 0.75rem 0; display: flex; align-items: baseline; gap: 0.25rem;">
                            <span class="plan-price" style="font-size: 2rem; font-weight: 800; color: #fff;">${priceDisplay}</span>
                            <span class="plan-period" style="color: var(--text-secondary); font-size: 0.8rem;">${periodStr}</span>
                        </div>
                        <ul class="features-list" style="list-style: none; margin-bottom: 1.5rem; flex-grow: 1; padding: 0;">
                            ${featuresHtml}
                        </ul>
                        <button class="${btnClass}" style="width: 100%; border-radius: 6px; padding: 0.6rem; font-size: 0.85rem; font-weight: 700; cursor: pointer;" 
                                onclick="sectorInitiateSubscription(${plan.id}, ${isFree}, ${loggedIn}, '${plan.plan_name}')"
                                ${isFree && loggedIn ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                            ${btnText}
                        </button>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="glass-panel" style="max-width: 850px; margin: 0 auto; padding: 2.5rem 2rem; text-align: center; border-color: rgba(139, 92, 246, 0.25);">
                    <div style="margin: 0 auto 1rem; display: flex; justify-content: center;">
                        <svg width="110" height="52" viewBox="0 0 110 52" xmlns="http://www.w3.org/2000/svg">
                            <path d="M 0 4 L 9 4 L 9 39 L 36 39 L 36 48 L 0 48 Z" fill="#8B5CF6" />
                            <text x="14" y="27" fill="#FFFFFF" font-family="'DM Sans', sans-serif" font-weight="800" font-size="26">Elite</text>
                            <text x="40" y="48" fill="#E2E8F0" font-family="'DM Sans', sans-serif" font-weight="800" font-size="26">ab<tspan fill="#8B5CF6">.</tspan></text>
                        </svg>
                    </div>
                    
                    <h2 style="font-size: 1.8rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">${headingText}</h2>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; max-width: 580px; margin: 0 auto 1.5rem; text-align: center;">
                        ${descText}
                    </p>

                    <!-- Toggle Billing Cycle -->
                    <div class="toggle-container" style="margin-top: 0; margin-bottom: 2rem;">
                        <button class="toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}" onclick="window.setSectorBillingCycle('monthly')">Monthly</button>
                        <button class="toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}" onclick="window.setSectorBillingCycle('yearly')">Yearly</button>
                    </div>
                    
                    <div class="plans-grid" style="display: flex; gap: 1.25rem; flex-wrap: wrap; justify-content: center; margin-bottom: 0.5rem;">
                        ${cardsHtml}
                    </div>
                </div>

                <!-- Dyn Payment Simulator Modal -->
                <div id="sector-payment-modal" class="payment-modal" style="text-align: left;">
                    <div class="payment-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.75rem;">
                            <h3 style="color: #fff; font-weight: 800; margin: 0; font-size: 1.2rem;">
                                <i class="fa-solid fa-credit-card" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> Razorpay Sandbox
                            </h3>
                            <button onclick="closeSectorPaymentModal()" style="background: none; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; padding: 0.2rem;"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; padding: 1rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <span style="color: var(--text-secondary);">Plan selected:</span>
                                <strong id="sec-modal-plan-name" style="color: #fff;">-</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <span style="color: var(--text-secondary);">Order ID:</span>
                                <code id="sec-modal-order-id" style="color: var(--accent-primary);">-</code>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 1.05rem; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 0.5rem; margin-top: 0.5rem;">
                                <span style="color: #fff; font-weight: 600;">Total Amount:</span>
                                <strong id="sec-modal-amount" style="color: var(--success); font-weight: 800;">-</strong>
                            </div>
                        </div>
                        
                        <div id="sec-payment-status-message" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #f87171; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; line-height: 1.4;"></div>
                        
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <button id="sec-btn-pay-success" onclick="executeSectorMockPayment(true)" class="btn btn-primary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                <i class="fa-solid fa-circle-check"></i> Simulate Payment Success
                            </button>
                            <button onclick="executeSectorMockPayment(false)" class="btn btn-secondary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; color: var(--text-secondary); border-color: rgba(255,255,255,0.08);">
                                Decline / Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        window.setSectorBillingCycle = function(cycle) {
            billingCycle = cycle;
            renderOverlayContent();
        };

        renderOverlayContent();
    });
}

// ===== REAL-TIME LIVE TICKING ENGINE =====
let liveTickingTimer = null;

function injectTickStyles() {
    if (document.getElementById('live-tick-styles')) return;
    const style = document.createElement('style');
    style.id = 'live-tick-styles';
    style.textContent = `
        @keyframes greenTickFlash {
            0% { background-color: rgba(34, 197, 94, 0.28); }
            100% { background-color: transparent; }
        }
        @keyframes redTickFlash {
            0% { background-color: rgba(239, 68, 68, 0.28); }
            100% { background-color: transparent; }
        }
        .tick-flash-up {
            animation: greenTickFlash 0.8s ease-out;
        }
        .tick-flash-down {
            animation: redTickFlash 0.8s ease-out;
        }
    `;
    document.head.appendChild(style);
}

function startLiveTickingEngine() {
    injectTickStyles();
    if (liveTickingTimer) clearInterval(liveTickingTimer);
    liveTickingTimer = setInterval(() => {
        tickSectors();
        tickStocks();
    }, 1500); // tick every 1.5 seconds for visual terminal vibe
}

function tickSectors() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    Object.keys(allSectors).forEach(name => {
        const sector = allSectors[name];
        // 40% chance to tick to look organic
        if (Math.random() > 0.4) return;

        const tile = container.querySelector(`.sector-tile[data-sector="${name}"]`);
        if (!tile) return;

        // Micro fluctuation between -0.04% and +0.04%
        const pctDiff = (Math.random() - 0.5) * 0.08;
        sector.pct_change = Math.min(Math.max(sector.pct_change + pctDiff, -10.0), 10.0);
        sector.pts_change = sector.pts_change + (pctDiff * sector.price / 100);

        // Update tile UI change
        const changeEl = tile.querySelector('.live-change');
        if (changeEl) {
            changeEl.innerText = `${sector.pct_change >= 0 ? '+' : ''}${sector.pct_change.toFixed(2)}%`;
            changeEl.style.color = sector.pct_change >= 0 ? 'var(--success)' : 'var(--danger)';
        }

        const ptsEl = tile.querySelector('.live-pts');
        if (ptsEl) {
            ptsEl.innerText = `${sector.pts_change >= 0 ? '+' : ''}${sector.pts_change.toFixed(1)} pts`;
        }

        // Apply flash classes
        tile.classList.remove('tick-flash-up', 'tick-flash-down');
        void tile.offsetWidth; // Force layout recalculation
        tile.classList.add(pctDiff >= 0 ? 'tick-flash-up' : 'tick-flash-down');
    });
}

function tickStocks() {
    if (!selectedSectorName) return;
    const sector = allSectors[selectedSectorName];
    if (!sector) return;

    // Use constituents or fallback
    const sourceStocks = sector.constituents || [...sector.top_gainers, ...sector.top_losers];
    if (!sourceStocks || sourceStocks.length === 0) return;

    const table = document.getElementById('detail-stocks-list');
    if (!table) return;

    sourceStocks.forEach(st => {
        // 50% chance of a tick
        if (Math.random() > 0.5) return;

        const row = table.querySelector(`tr.stock-row[data-symbol="${st.symbol}"]`);
        if (!row) return;

        // Micro fluctuation between -0.06% and +0.06%
        const pctDiff = (Math.random() - 0.5) * 0.12;
        st.change = Math.min(Math.max(st.change + pctDiff, -15.0), 15.0);
        st.close = Math.max(st.close * (1 + pctDiff / 100), 0.05);

        // Update close price and percent change in cells
        const priceEl = row.querySelector('.stock-price');
        if (priceEl) {
            priceEl.innerText = st.close.toFixed(2);
        }

        const changeEl = row.querySelector('.stock-change');
        if (changeEl) {
            changeEl.innerText = `${st.change >= 0 ? '+' : ''}${st.change.toFixed(2)}%`;
            changeEl.style.color = st.change >= 0 ? 'var(--success)' : 'var(--danger)';
        }

        // Apply flash classes to price/change cells
        [priceEl, changeEl].forEach(el => {
            if (el) {
                el.classList.remove('tick-flash-up', 'tick-flash-down');
                void el.offsetWidth; // Force layout recalculation
                el.classList.add(pctDiff >= 0 ? 'tick-flash-up' : 'tick-flash-down');
            }
        });
    });
}
