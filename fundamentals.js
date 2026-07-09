// Fundamentals Page Logic (Redesigned for Momentum Scorecard only)

document.addEventListener('DOMContentLoaded', () => {
    // Search functionality
    const searchInput = document.getElementById('stock-search');
    const searchBtn = document.getElementById('search-submit');
    const initialState = document.getElementById('initial-state');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const dashboardData = document.getElementById('dashboard-data');

    async function fetchFundamentals() {
        let symbol = searchInput.value.trim().toUpperCase();
        if (!symbol) return;
        
        // Extract base symbol (remove .NS, .BO suffix if user enters it)
        const baseSymbol = symbol.split('.')[0];
        searchInput.value = baseSymbol;

        // UI States
        initialState.style.display = 'none';
        errorState.style.display = 'none';
        dashboardData.style.display = 'none';
        loadingState.style.display = 'flex';

        try {
            // Fetch momentum checklist scorecard
            const response = await fetch(`/api/intraday/analyze?symbol=${baseSymbol}`);
            if (!response.ok) {
                throw new Error('Symbol not found or technical load error');
            }
            
            const momData = await response.json();
            if (momData.error) {
                throw new Error(momData.error);
            }

            // Add has-results class to search hero to trigger transition
            document.getElementById('search-hero').classList.add('has-results');

            renderDashboard(momData);
            
            loadingState.style.display = 'none';
            dashboardData.style.display = 'block';

        } catch (error) {
            console.error('Error fetching stock data:', error);
            loadingState.style.display = 'none';
            errorState.style.display = 'block';
            document.getElementById('error-message').textContent = error.message || 'Could not fetch data';
        }
    }

    const suggestionsBox = document.getElementById('search-suggestions');
    let debounceTimer;

    searchBtn.addEventListener('click', fetchFundamentals);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (suggestionsBox) {
                suggestionsBox.style.display = 'none';
            }
            fetchFundamentals();
        }
    });

    if (suggestionsBox) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();
            if (query.length < 1) {
                suggestionsBox.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
                    if (!response.ok) return;
                    const suggestions = await response.json();
                    
                    if (suggestions.length === 0) {
                        suggestionsBox.style.display = 'none';
                        return;
                    }

                    suggestionsBox.innerHTML = suggestions.map(s => `
                        <div class="suggestion-item" data-symbol="${s.symbol}">
                            <div style="display: flex; align-items: center;">
                                <span class="suggestion-symbol">${s.symbol}</span>
                                <span class="suggestion-name">${s.name}</span>
                            </div>
                            <span class="suggestion-sector">${s.sector}</span>
                        </div>
                    `).join('');
                    
                    suggestionsBox.style.display = 'block';

                    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            searchInput.value = item.getAttribute('data-symbol');
                            suggestionsBox.style.display = 'none';
                            fetchFundamentals();
                        });
                    });
                } catch (err) {
                    console.error('Error fetching suggestions:', err);
                }
            }, 150);
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
            }
        });
    }

    // Bind trending stock pills click
    document.querySelectorAll('.trend-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            searchInput.value = pill.getAttribute('data-symbol');
            fetchFundamentals();
        });
    });

    // Check for deep link from screener
    const urlParams = new URLSearchParams(window.location.search);
    const deepLinkSymbol = urlParams.get('symbol');
    if (deepLinkSymbol) {
        searchInput.value = deepLinkSymbol;
        fetchFundamentals();
    }

    function renderDashboard(momData) {
        // 1. Header & Overview Stats
        document.getElementById('stock-name').innerHTML = `${momData.name || 'Unknown Company'} <span class="stock-symbol-badge" id="stock-symbol">${momData.symbol}</span>`;
        
        // Find sector from tickertape metadata if available
        const sectorName = (momData.tickertape && momData.tickertape.sector) ? momData.tickertape.sector.title : 'Equities';
        document.getElementById('stock-sector').textContent = sectorName;
        
        document.getElementById('live-price').textContent = `₹${parseFloat(momData.price).toFixed(2)}`;
        
        const changeEl = document.getElementById('live-change');
        const changePct = parseFloat(momData.change_pct);
        const isPositive = changePct >= 0;
        if (isPositive) {
            changeEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> ${changePct.toFixed(2)}%`;
            changeEl.className = 'change positive';
        } else {
            changeEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${Math.abs(changePct).toFixed(2)}%`;
            changeEl.className = 'change negative';
        }

        // 2. Render Momentum Scorecard elements
        document.getElementById('res-score').textContent = momData.score;
        
        const resRating = document.getElementById('res-rating');
        resRating.className = 'rating-badge';
        
        const scoreCircle = document.getElementById('res-score');
        if (momData.rating === 'Very Strong') {
            resRating.innerHTML = '<i class="fa-solid fa-star" style="font-size: 0.85rem;"></i>';
            resRating.classList.add('rating-very-strong');
            scoreCircle.style.borderColor = '#22C55E';
        } else {
            resRating.textContent = momData.rating;
            if (momData.rating === 'Strong') {
                resRating.classList.add('rating-strong');
                scoreCircle.style.borderColor = '#22C55E';
            } else if (momData.rating === 'Moderate') {
                resRating.classList.add('rating-moderate');
                scoreCircle.style.borderColor = '#F59E0B';
            } else {
                resRating.classList.add('rating-avoid');
                scoreCircle.style.borderColor = '#EF4444';
            }
        }

        document.getElementById('res-updated').textContent = `Synced: ${momData.last_updated}`;

        // Tickertape Summary cards
        const ttSector = momData.tickertape.sector;
        document.getElementById('tt-sector-title').innerHTML = `${ttSector.title} <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: var(--text-secondary);"></i>`;
        document.getElementById('tt-sector-tag').textContent = ttSector.tag;

        const ttCap = momData.tickertape.cap;
        document.getElementById('tt-cap-title').innerHTML = `${ttCap.title} <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: var(--text-secondary);"></i>`;
        document.getElementById('tt-cap-desc').textContent = ttCap.desc;

        const ttRisk = momData.tickertape.risk;
        document.getElementById('tt-risk-title').innerHTML = `${ttRisk.title} <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: var(--text-secondary);"></i>`;
        document.getElementById('tt-risk-desc').textContent = ttRisk.desc;

        const idxSign = momData.index_change_pct >= 0 ? '+' : '';
        const idxColor = momData.index_change_pct >= 0 ? '#22C55E' : '#EF4444';
        document.getElementById('tt-index-title').innerHTML = `Index: ${momData.index_name} <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: var(--text-secondary);"></i>`;
        document.getElementById('tt-index-desc').innerHTML = `Index daily change is <span style="color: ${idxColor}; font-weight: 700;">${idxSign}${parseFloat(momData.index_change_pct).toFixed(2)}%</span>`;

        // Company Profile Description Truncation
        const fullDesc = momData.company_summary || 'No description available.';
        const maxChars = 150;
        const textSpan = document.getElementById('res-metadata-summary-text');
        const readMoreBtn = document.getElementById('res-metadata-read-more-btn');
        
        if (fullDesc.length <= maxChars) {
            textSpan.textContent = fullDesc;
            readMoreBtn.style.display = 'none';
        } else {
            const shortDesc = fullDesc.substring(0, maxChars) + '...';
            textSpan.textContent = shortDesc;
            readMoreBtn.style.display = 'inline-block';
            readMoreBtn.textContent = 'Read More';
            
            const newBtn = readMoreBtn.cloneNode(true);
            readMoreBtn.parentNode.replaceChild(newBtn, readMoreBtn);
            
            newBtn.addEventListener('click', () => {
                if (newBtn.textContent === 'Read More') {
                    textSpan.textContent = fullDesc;
                    newBtn.textContent = 'Read Less';
                } else {
                    textSpan.textContent = shortDesc;
                    newBtn.textContent = 'Read More';
                }
            });
        }

        // Analyst Ratings & Forecast circle
        const forecast = momData.analyst_forecast || { rating: null, percentage: 0, num_analysts: 0 };
        const percentEl = document.getElementById('analyst-percentage');
        const descEl = document.getElementById('analyst-desc');
        const progressBar = document.getElementById('analyst-progress-bar');
        
        if (forecast.rating && forecast.num_analysts > 0) {
            percentEl.textContent = `${forecast.percentage}%`;
            
            const circumference = 201.06;
            const offset = circumference - (circumference * forecast.percentage / 100);
            progressBar.style.strokeDashoffset = offset;
            
            let ratingColor = '#22C55E';
            let actionText = 'buy';
            if (forecast.rating === 'hold') {
                ratingColor = '#F59E0B';
                actionText = 'hold';
            } else if (forecast.rating === 'sell') {
                ratingColor = '#EF4444';
                actionText = 'sell';
            }
            
            progressBar.style.stroke = ratingColor;
            descEl.innerHTML = `Analysts have suggested that investors can <span style="font-weight: 800; color: ${ratingColor};">${actionText}</span> this stock from <span style="font-weight: 700; color: var(--text-primary);">${forecast.num_analysts}</span> analysts.`;
        } else {
            percentEl.textContent = '0%';
            progressBar.style.strokeDashoffset = 201.06;
            progressBar.style.stroke = 'rgba(255, 255, 255, 0.1)';
            descEl.innerHTML = `<span style="color: var(--text-secondary);">No analyst coverage available for this stock.</span>`;
        }

        // checklist rules grid
        const resChecklistGrid = document.getElementById('res-checklist-grid');
        resChecklistGrid.innerHTML = '';
        Object.entries(momData.rules).forEach(([key, rule]) => {
            const card = document.createElement('div');
            card.className = 'checklist-item';
            
            const badgeClass = rule.passed ? 'checklist-status status-pass' : 'checklist-status status-fail';
            const badgeText = rule.passed ? '✔ PASS' : '✖ FAIL';
            
            card.innerHTML = `
                <div class="checklist-row-top">
                    <span class="checklist-label">${rule.name}</span>
                    <span class="${badgeClass}">${badgeText}</span>
                </div>
                <span class="checklist-value">${rule.val}</span>
            `;
            resChecklistGrid.appendChild(card);
        });

        // 3. Render Shareholding Pattern Table
        const shHeaders = document.getElementById('holdings-table-headers');
        shHeaders.innerHTML = '<th style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); font-weight: 600;">Sector</th>';
        
        const shPattern = momData.shareholding_pattern || { quarters: [], promoters: [], fii: [], dii: [], public: [], shareholders: [] };
        
        shPattern.quarters.forEach(q => {
            const th = document.createElement('th');
            th.style.padding = '0.75rem';
            th.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
            th.style.color = 'var(--text-secondary)';
            th.style.fontWeight = '600';
            th.textContent = q;
            shHeaders.appendChild(th);
        });

        const shBody = document.getElementById('holdings-table-body');
        shBody.innerHTML = '';

        const rowsData = [
            { label: 'Promoters +', key: 'promoters', isPercent: true, color: '#FFFFFF' },
            { label: 'FIIs +', key: 'fii', isPercent: true, color: '#A78BFA' },
            { label: 'DIIs +', key: 'dii', isPercent: true, color: '#60A5FA' },
            { label: 'Public +', key: 'public', isPercent: true, color: '#F472B6' },
            { label: 'No. of Shareholders', key: 'shareholders', isPercent: false, color: '#94A3B8' }
        ];

        // Track trend notes for bottom display
        const notes = [];

        rowsData.forEach(rowInfo => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
            
            const tdLabel = document.createElement('td');
            tdLabel.style.padding = '0.75rem';
            tdLabel.style.fontWeight = '700';
            tdLabel.style.color = rowInfo.color;
            tdLabel.textContent = rowInfo.label;
            tr.appendChild(tdLabel);

            const values = shPattern[rowInfo.key] || [];
            
            // Calculate promoter/FII/DII quarterly trends
            const isTrendable = ['promoters', 'fii', 'dii'].includes(rowInfo.key) && values.length >= 2;
            if (isTrendable) {
                const oldest = parseFloat(values[0]);
                const latest = parseFloat(values[values.length - 1]);
                const diff = latest - oldest;
                const absDiff = Math.abs(diff).toFixed(2);
                
                let trendColor = '';
                let iconClass = '';
                let text = '';
                
                const labelText = rowInfo.label.replace(' +', '').replace('s', ''); // Promoters -> Promoter, FIIs -> FII
                
                if (diff > 0.005) {
                    trendColor = '#22C55E'; // green
                    iconClass = 'fa-circle-chevron-up';
                    text = `${labelText} holdings have increased from ${oldest.toFixed(2)}% to ${latest.toFixed(2)}% (+${absDiff}%) over the last 3 quarters.`;
                } else if (diff < -0.005) {
                    trendColor = '#EF4444'; // red
                    iconClass = 'fa-circle-chevron-down';
                    text = `${labelText} holdings have decreased from ${oldest.toFixed(2)}% to ${latest.toFixed(2)}% (-${absDiff}%) over the last 3 quarters.`;
                } else {
                    trendColor = '#94A3B8'; // gray
                    iconClass = 'fa-circle';
                    text = `${labelText} holdings remained stable at ${latest.toFixed(2)}% over the last 3 quarters.`;
                }
                
                notes.push({ color: trendColor, icon: iconClass, text });
            }

            values.forEach(val => {
                const td = document.createElement('td');
                td.style.padding = '0.75rem';
                td.style.fontWeight = '500';
                td.style.color = 'var(--text-primary)';
                
                if (rowInfo.isPercent) {
                    td.textContent = `${parseFloat(val).toFixed(2)}%`;
                } else {
                    td.textContent = parseInt(val).toLocaleString('en-IN');
                }
                tr.appendChild(td);
            });

            shBody.appendChild(tr);
        });

        // Render dynamic trend notes
        const notesContainer = document.getElementById('holdings-trend-notes');
        notesContainer.innerHTML = '';
        notes.forEach(n => {
            const noteEl = document.createElement('div');
            noteEl.style.fontSize = '0.9rem';
            noteEl.style.fontWeight = '600';
            noteEl.style.display = 'flex';
            noteEl.style.alignItems = 'center';
            noteEl.style.gap = '0.6rem';
            noteEl.style.color = n.color;
            noteEl.innerHTML = `<i class="fa-solid ${n.icon}"></i> <span>${n.text}</span>`;
            notesContainer.appendChild(noteEl);
        });


    }
});
