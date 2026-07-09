let allSectors = {};
let selectedSectorName = null;
let currentFilter = 'all';
let autoRefreshTimer = null;
let countdownSeconds = 180; // 3 minutes

document.addEventListener('DOMContentLoaded', () => {
    fetchSectorAnalysis();
    fetchNsdlFpiFlows();
    setupFilters();
    startCountdown();
});

function fetchSectorAnalysis() {
    const container = document.getElementById('heatmap-container');
    
    fetch('/api/sector-analysis')
        .then(apiData => {
            if (!apiData.ok) throw new Error('API Response Error');
            return apiData.json();
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
                        fiiNetEl.innerText = `${fiiNet >= 0 ? '+' : ''}${fiiNet.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
                        fiiNetEl.style.color = fiiNet >= 0 ? 'var(--success)' : 'var(--danger)';
                    }
                    
                    const diiBuyEl = document.getElementById('dii-buy');
                    if (diiBuyEl) diiBuyEl.innerText = fpiData.dii_buy ? fpiData.dii_buy.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const diiSellEl = document.getElementById('dii-sell');
                    if (diiSellEl) diiSellEl.innerText = fpiData.dii_sell ? fpiData.dii_sell.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';
                    const diiNetEl = document.getElementById('dii-net');
                    if (diiNetEl) {
                        diiNetEl.innerText = `${diiNet >= 0 ? '+' : ''}${diiNet.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
                        diiNetEl.style.color = diiNet >= 0 ? 'var(--success)' : 'var(--danger)';
                    }

                    const fpiTrendEl = document.getElementById('fpi-trend');
                    if (fpiTrendEl) fpiTrendEl.innerText = fpiData.trend || 'Mixed Rotation Flow';
                    
                    const fpiDateEl = document.getElementById('fpi-date');
                    if (fpiDateEl) fpiDateEl.innerText = fpiData.date ? `As of ${fpiData.date}` : '';

                    const ratingBadge = document.getElementById('fpi-rating');
                    if (ratingBadge && fpiData.positioning_rating) {
                        ratingBadge.innerText = fpiData.positioning_rating.toUpperCase();
                        if (fpiData.positioning_rating === 'Bullish') {
                            ratingBadge.style.background = 'var(--success-bg)';
                            ratingBadge.style.color = 'var(--success)';
                        } else if (fpiData.positioning_rating === 'Bearish') {
                            ratingBadge.style.background = 'var(--danger-bg)';
                            ratingBadge.style.color = 'var(--danger)';
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
        tile.innerHTML = `
            <div>
                <h4 style="font-size: 0.95rem; font-weight: 700; color: #ffffff; margin-bottom: 0.25rem;">${s.name}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: ${change >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                    </span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">${s.pts_change >= 0 ? '+' : ''}${s.pts_change.toFixed(1)} pts</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;">
                <span style="color: var(--text-secondary);"><i class="fa-solid fa-shuffle"></i> ${s.advances}/${s.declines}</span>
                <span style="background: rgba(255,255,255,0.06); padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; color: #ffffff;">Sc: ${s.strength_score}</span>
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
        const allStocks = [...sector.top_gainers, ...sector.top_losers];
        const uniqueStocks = [];
        const seen = new Set();
        allStocks.forEach(st => {
            if (!seen.has(st.symbol)) {
                seen.add(st.symbol);
                uniqueStocks.push(st);
            }
        });

        uniqueStocks.sort((a, b) => b.change - a.change);

        uniqueStocks.forEach(st => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid var(--border-color)';
            row.innerHTML = `
                <td style="padding: 0.5rem 0.4rem; text-align: left; font-weight: 600; color: #ffffff;">${st.symbol}</td>
                <td style="padding: 0.5rem 0.4rem; text-align: right; color: var(--text-primary);">${st.close.toFixed(2)}</td>
                <td style="padding: 0.5rem 0.4rem; text-align: right; font-weight: 700; color: ${st.change >= 0 ? 'var(--success)' : 'var(--danger)'};">
                    ${st.change >= 0 ? '+' : ''}${st.change.toFixed(2)}%
                </td>
            `;
            stocksTable.appendChild(row);
        });
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
        }
        
        const minutes = Math.floor(countdownSeconds / 60);
        const seconds = countdownSeconds % 60;
        const timerEl = document.getElementById('update-timer');
        if (timerEl) {
            timerEl.innerText = `Auto-refresh in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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
