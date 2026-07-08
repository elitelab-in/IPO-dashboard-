// ═══════════════════════════════════════════════════════════════
//  Elitelab Unified Screener — Intraday + Swing Tab Logic
// ═══════════════════════════════════════════════════════════════

// ── Shared: Chart Tooltip ───────────────────────────────────────
const tooltip   = document.getElementById('chart-tooltip');
const chartIframe = document.getElementById('chart-iframe');

if (tooltip) {
    tooltip.addEventListener('mouseenter', () => clearTimeout(window.tooltipHideTimeout));
    tooltip.addEventListener('mouseleave', () => {
        window.tooltipHideTimeout = setTimeout(() => {
            tooltip.classList.remove('visible');
            if (chartIframe) chartIframe.src = '';
            tooltip.dataset.symbol = '';
        }, 300);
    });
}

function attachTooltip(target, symbol) {
    target.addEventListener('mouseenter', (e) => {
        if (!tooltip) return;
        clearTimeout(window.tooltipHideTimeout);
        const sym = `BSE:${symbol}`;
        if (tooltip.dataset.symbol !== sym) {
            const encoded = encodeURIComponent(sym);
            if (chartIframe) chartIframe.src = `https://s.tradingview.com/widgetembed/?symbol=${encoded}&interval=D&theme=dark&style=1&hide_top_toolbar=0&hide_legend=0&save_image=0&timezone=Asia%2FKolkata`;
            tooltip.dataset.symbol = sym;
        }
        if (!tooltip.classList.contains('visible')) {
            let left = e.clientX + 100;
            let top  = e.clientY - 250;
            if (left + 800 > window.innerWidth) left = e.clientX - 860;
            if (top < 20) top = 20;
            if (top + 500 > window.innerHeight) top = window.innerHeight - 520;
            tooltip.style.left = left + 'px';
            tooltip.style.top  = top + 'px';
        }
        tooltip.classList.add('visible');
    });
    target.addEventListener('mouseleave', () => {
        if (!tooltip) return;
        window.tooltipHideTimeout = setTimeout(() => {
            tooltip.classList.remove('visible');
            if (chartIframe) chartIframe.src = '';
            tooltip.dataset.symbol = '';
        }, 300);
    });
}

// ── Tab Switch ──────────────────────────────────────────────────
let activeTab = 'intraday';
let swingLoaded = false;

function switchTab(tab) {
    activeTab = tab;

    document.getElementById('panel-intraday').classList.toggle('active', tab === 'intraday');
    document.getElementById('panel-swing').classList.toggle('active', tab === 'swing');
    document.getElementById('btn-intraday').classList.toggle('active', tab === 'intraday');
    document.getElementById('btn-swing').classList.toggle('active', tab === 'swing');

    // Lazy-load Swing data the first time its tab is clicked
    if (tab === 'swing' && !swingLoaded) {
        fetchSwingData();
        swingLoaded = true;
    }
}

// ═══════════════════════════════════════════════════════════════
//  INTRADAY TAB
// ═══════════════════════════════════════════════════════════════

const formatVolume = (vol) => {
    if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
    if (vol >= 100000)   return `${(vol / 100000).toFixed(2)} L`;
    if (vol >= 1000)     return `${(vol / 1000).toFixed(1)} K`;
    return vol.toString();
};

let intradayStocks   = [];
let intradayFiltered = [];
let intradayPage     = 1;
const intradayPerPage = 10;

function renderIntradayTable() {
    const tableBody = document.getElementById('intraday-table-body');
    const emptyEl   = document.getElementById('intraday-empty');
    const pagination = document.getElementById('intraday-pagination');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    pagination.innerHTML = '';

    if (intradayFiltered.length === 0) {
        emptyEl.style.display = 'flex';
        return;
    }
    emptyEl.style.display = 'none';

    const start = (intradayPage - 1) * intradayPerPage;
    const paginated = intradayFiltered.slice(start, start + intradayPerPage);

    paginated.forEach(stock => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        let ratingClass = 'rating-badge';
        if      (stock.rating === 'Very Strong') ratingClass += ' rating-very-strong';
        else if (stock.rating === 'Strong')      ratingClass += ' rating-strong';
        else if (stock.rating === 'Moderate')    ratingClass += ' rating-moderate';
        else                                     ratingClass += ' rating-avoid';

        const isPos = stock.change_pct >= 0;
        const chgColor = isPos ? '#22C55E' : '#EF4444';
        const sign = isPos ? '+' : '';

        tr.innerHTML = `
            <td class="hover-target" style="cursor:pointer;">
                <span style="font-weight:700; color:#8B5CF6;">${stock.symbol}</span>
            </td>
            <td class="hover-target" style="cursor:pointer;">${stock.name}</td>
            <td style="font-weight:600;">₹${parseFloat(stock.price).toFixed(2)}</td>
            <td style="font-weight:600; color:${chgColor};">${sign}${parseFloat(stock.change_pct).toFixed(2)}%</td>
            <td style="font-family:monospace;">${formatVolume(stock.volume)}</td>
            <td>${stock.sector}</td>
            <td><span style="font-weight:800;">${stock.score}</span></td>
            <td><span class="${ratingClass}">${stock.rating}</span></td>
        `;

        tr.querySelectorAll('.hover-target').forEach(t => attachTooltip(t, stock.symbol));
        tr.addEventListener('click', () => { window.location.href = `/fundamentals?symbol=${stock.symbol}`; });
        tableBody.appendChild(tr);
    });

    renderIntradayPagination();
}

function renderIntradayPagination() {
    const ctrl = document.getElementById('intraday-pagination');
    ctrl.innerHTML = '';
    const totalPages = Math.ceil(intradayFiltered.length / intradayPerPage);
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prev.disabled = intradayPage === 1;
    prev.onclick = () => { intradayPage--; renderIntradayTable(); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === intradayPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => { intradayPage = i; renderIntradayTable(); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    next.disabled = intradayPage === totalPages;
    next.onclick = () => { intradayPage++; renderIntradayTable(); };
    ctrl.appendChild(next);
}

function fetchIntradayData() {
    const loadingEl = document.getElementById('intraday-loading');
    const emptyEl   = document.getElementById('intraday-empty');
    const tableBody = document.getElementById('intraday-table-body');

    loadingEl.style.display = 'flex';
    emptyEl.style.display = 'none';
    tableBody.innerHTML = '';
    intradayPage = 1;

    fetch('/api/intraday/screener')
        .then(res => { if (!res.ok) throw new Error(); return res.json(); })
        .then(data => {
            loadingEl.style.display = 'none';
            intradayStocks   = data.stocks || [];
            intradayFiltered = [...intradayStocks];

            document.getElementById('intraday-stat-total').textContent = intradayStocks.length;

            if (intradayStocks.length > 0) {
                const sectors = {};
                intradayStocks.forEach(s => { sectors[s.sector] = (sectors[s.sector] || 0) + 1; });
                const top = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0];
                document.getElementById('intraday-stat-sector').textContent = `${top[0]} (${top[1]} Stocks)`;
            } else {
                document.getElementById('intraday-stat-sector').textContent = '-';
            }

            renderIntradayTable();
        })
        .catch(() => {
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'flex';
        });
}

// Search filter
document.getElementById('intraday-search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    intradayPage = 1;
    intradayFiltered = q
        ? intradayStocks.filter(s =>
            s.symbol.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.sector.toLowerCase().includes(q))
        : [...intradayStocks];
    renderIntradayTable();
});

document.getElementById('intraday-refresh-btn').addEventListener('click', fetchIntradayData);

// ═══════════════════════════════════════════════════════════════
//  SWING TAB
// ═══════════════════════════════════════════════════════════════

let swingData = [];
let swingPage = 1;
const swingPerPage = 20;

function renderSwingTable() {
    const tableBody  = document.getElementById('swing-table-body');
    const pagination = document.getElementById('swing-pagination');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    pagination.innerHTML = '';

    if (!swingData || swingData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-secondary);">No stocks found matching the criteria.</td></tr>`;
        return;
    }

    const start = (swingPage - 1) * swingPerPage;
    const paginated = swingData.slice(start, start + swingPerPage);

    paginated.forEach(stock => {
        const isPos = stock.per_chg >= 0;
        const chgClass = isPos ? 'success' : 'danger';
        const chgIcon  = isPos ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const chgSign  = isPos ? '+' : '';

        const vol = stock.volume;
        const volStr = vol > 1000000 ? (vol/1000000).toFixed(2)+'M' : vol > 1000 ? (vol/1000).toFixed(1)+'K' : vol;

        const tickerName = stock.nsecode || (stock.name || '').split(' ')[0].toUpperCase();

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="hover-target" style="cursor:pointer;">
                <div class="symbol">${tickerName}</div>
            </td>
            <td class="hover-target" style="cursor:pointer;">
                <div class="company-name">${stock.name}</div>
            </td>
            <td style="font-weight:600;">&#8377;${parseFloat(stock.close).toFixed(2)}</td>
            <td>
                <span class="badge ${chgClass}">
                    <i class="fa-solid ${chgIcon}"></i> ${chgSign}${stock.per_chg}%
                </span>
            </td>
            <td style="color:var(--text-secondary);">${volStr}</td>
            <td>
                <span class="badge sector-span" style="background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid var(--glass-border);">
                    ${(stock.sector && stock.sector !== 'Unknown') ? stock.sector : 'N/A'}
                </span>
            </td>
        `;

        tr.querySelectorAll('.hover-target').forEach(t => attachTooltip(t, tickerName));
        tableBody.appendChild(tr);
    });

    renderSwingPagination();
}

function renderSwingPagination() {
    const ctrl = document.getElementById('swing-pagination');
    ctrl.innerHTML = '';
    const totalPages = Math.ceil(swingData.length / swingPerPage);
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prev.disabled = swingPage === 1;
    prev.onclick = () => { swingPage--; renderSwingTable(); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === swingPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => { swingPage = i; renderSwingTable(); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    next.disabled = swingPage === totalPages;
    next.onclick = () => { swingPage++; renderSwingTable(); };
    ctrl.appendChild(next);
}

function updateSwingStats(data) {
    document.getElementById('swing-stat-total').textContent = data.length;
    const sectorEl = document.getElementById('swing-stat-sector');
    if (!sectorEl) return;
    if (data.length === 0) { sectorEl.textContent = '-'; return; }
    const counts = {};
    data.forEach(s => {
        const sec = (s.sector && s.sector !== 'Unknown') ? s.sector : 'Other';
        counts[sec] = (counts[sec] || 0) + 1;
    });
    const top3 = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,3);
    sectorEl.innerHTML = top3.map(([s, c]) => `${s} (${c})`).join(' &bull; ');
}

function fetchSwingData() {
    const loadingEl = document.getElementById('swing-loading-state');
    const tableBody = document.getElementById('swing-table-body');
    const statusEl  = document.getElementById('swing-scan-status');

    if (loadingEl) loadingEl.classList.add('active');
    if (tableBody) tableBody.innerHTML = '';
    if (statusEl)  statusEl.textContent = 'Scanning...';

    fetch('/api/screener')
        .then(res => res.json())
        .then(result => {
            if (result.data) {
                result.data.sort((a, b) => b.per_chg - a.per_chg);
                swingData = result.data;
                swingPage = 1;
                updateSwingStats(swingData);
                renderSwingTable();
            } else {
                swingData = [];
                updateSwingStats([]);
                renderSwingTable();
            }
        })
        .catch(err => {
            console.error('Swing screener error:', err);
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--danger);">Error loading data. Please try again.</td></tr>`;
        })
        .finally(() => {
            if (loadingEl) loadingEl.style.display = 'none';
            if (statusEl)  statusEl.textContent = 'Live';
        });
}

// ═══════════════════════════════════════════════════════════════
//  INIT — Load Intraday on page load; Swing loads lazily on click
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    fetchIntradayData();
    // Auto-refresh intraday every 2 minutes
    setInterval(fetchIntradayData, 120000);

    // Ticker fetch (index.html scroll ticker)
    const fetchTicker = async () => {
        const track = document.getElementById('ticker-track');
        if (!track) return;
        try {
            const res  = await fetch('/api/ticker');
            const data = await res.json();
            if (data && data.length > 0) {
                track.innerHTML = '';
                const render = (list) => list.forEach(item => {
                    const isPos = item.change >= 0;
                    const div = document.createElement('div');
                    div.className = 'ticker-item';
                    div.innerHTML = `<span class="ticker-name">${item.name}</span><span class="ticker-change ${isPos ? 'positive' : 'negative'}">${isPos ? '+' : ''}${item.change}%</span>`;
                    track.appendChild(div);
                });
                render(data); render(data);
            }
        } catch(e) {}
    };
    fetchTicker();
});
