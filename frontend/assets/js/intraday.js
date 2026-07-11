document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    
    // Chartink Table Elements
    const tableBody = document.getElementById('table-body');
    const tableEmpty = document.getElementById('table-empty');
    const tableLoading = document.getElementById('table-loading');
    const tableSearchBar = document.getElementById('table-search-bar');
    const refreshScannerBtn = document.getElementById('refresh-scanner-btn');
    
    // Stats elements
    const statTotalScanned = document.getElementById('stat-total-scanned');
    const statTopSector = document.getElementById('stat-top-sector');

    // Local State
    let screenerStocks = [];
    let filteredStocks = [];

    // Pagination State
    let currentPage = 1;
    const rowsPerPage = 10;

    // Format Large Volumes (Indian standard Cr/L or K)
    const formatVolume = (vol) => {
        if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
        if (vol >= 100000) return `${(vol / 100000).toFixed(2)} L`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)} K`;
        return vol.toString();
    };

    // ── TradingView Chart Tooltip — same as AI Auto Screener ─────────────────
    const tooltip = document.getElementById('chart-tooltip');
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

    // Render Chartink Scanner Table
    const renderScannerTable = () => {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        
        if (filteredStocks.length === 0) {
            tableEmpty.style.display = 'flex';
            const paginationControls = document.getElementById('pagination-controls');
            if (paginationControls) paginationControls.innerHTML = '';
            return;
        }
        tableEmpty.style.display = 'none';

        // Slice for pagination
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const paginated = filteredStocks.slice(start, end);

        paginated.forEach(stock => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            
            // Format rating classes
            let ratingClass = 'rating-badge';
            let ratingContent = stock.rating;
            if (stock.rating === 'Very Strong') {
                ratingClass += ' rating-very-strong';
                ratingContent = '<i class="fa-solid fa-star" style="font-size: 0.8rem;"></i>';
            } else if (stock.rating === 'Strong') {
                ratingClass += ' rating-strong';
            } else if (stock.rating === 'Moderate') {
                ratingClass += ' rating-moderate';
            } else {
                ratingClass += ' rating-avoid';
            }

            const isPositive = stock.change_pct >= 0;
            const chgColor = isPositive ? '#22C55E' : '#EF4444';
            const sign = isPositive ? '+' : '';

            tr.innerHTML = `
                <td class="hover-target" style="cursor: pointer;">
                    <span style="font-weight: 700; color: #8B5CF6;">${stock.symbol}</span>
                </td>
                <td class="hover-target" style="cursor: pointer;">
                    <span>${stock.name}</span>
                </td>
                <td style="font-weight: 600;">₹${parseFloat(stock.price).toFixed(2)}</td>
                <td style="font-weight: 600; color: ${chgColor};">${sign}${parseFloat(stock.change_pct).toFixed(2)}%</td>
                <td style="font-family: monospace;">${formatVolume(stock.volume)}</td>
                <td>${stock.sector}</td>
                <td><span style="font-weight: 800; color: var(--text-primary);">${stock.score}</span></td>
                <td><span class="${ratingClass}">${ratingContent}</span></td>
            `;

            // Hover chart on symbol + name cells (same logic as app.js)
            const hoverTargets = tr.querySelectorAll('.hover-target');
            hoverTargets.forEach(target => {
                target.addEventListener('mouseenter', (e) => {
                    if (!tooltip) return;
                    clearTimeout(window.tooltipHideTimeout);

                    const symbol = `NSE:${stock.symbol}`;
                    if (tooltip.dataset.symbol !== symbol) {
                        const encoded = encodeURIComponent(symbol);
                        if (chartIframe) chartIframe.src = `https://s.tradingview.com/widgetembed/?symbol=${encoded}&interval=D&theme=dark&style=3&hide_top_toolbar=1&hide_side_toolbar=1&hide_legend=1&symboledit=0&save_image=0&timezone=Asia%2FKolkata`;
                        tooltip.dataset.symbol = symbol;
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
            });

            // Row click redirects to Fundamentals page to view detailed technical & fundamental scorecard
            tr.addEventListener('click', () => {
                window.location.href = `/fundamentals?symbol=${stock.symbol}`;
            });

            tableBody.appendChild(tr);
        });

        renderPagination();
    };


    // Render Pagination Controls
    const renderPagination = () => {
        const paginationControls = document.getElementById('pagination-controls');
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        
        const totalPages = Math.ceil(filteredStocks.length / rowsPerPage);
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderScannerTable();
            }
        });
        paginationControls.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderScannerTable();
            });
            paginationControls.appendChild(pageBtn);
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderScannerTable();
            }
        });
        paginationControls.appendChild(nextBtn);
    };

    // Filter Table Data
    const filterTableData = () => {
        const query = tableSearchBar.value.toLowerCase().trim();
        currentPage = 1; // Reset to page 1 on filter
        if (!query) {
            filteredStocks = [...screenerStocks];
        } else {
            filteredStocks = screenerStocks.filter(stock => 
                stock.symbol.toLowerCase().includes(query) || 
                stock.name.toLowerCase().includes(query) || 
                stock.sector.toLowerCase().includes(query)
            );
        }
        renderScannerTable();
    };

    tableSearchBar.addEventListener('input', filterTableData);

    // Fetch Live Chartink Screener results
    const fetchScreenerResults = () => {
        tableLoading.style.display = 'flex';
        tableEmpty.style.display = 'none';
        tableBody.innerHTML = '';
        currentPage = 1; // Reset to page 1 on fetch

        fetch('/api/intraday/screener')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load scanner results');
                return res.json();
            })
            .then(data => {
                tableLoading.style.display = 'none';
                screenerStocks = data.stocks || [];
                filteredStocks = [...screenerStocks];
                
                // Update Stats
                statTotalScanned.textContent = screenerStocks.length;
                
                if (screenerStocks.length > 0) {
                    // Calculate Top Sectors
                    const sectors = {};
                    screenerStocks.forEach(s => {
                        sectors[s.sector] = (sectors[s.sector] || 0) + 1;
                    });
                    const topSector = Object.entries(sectors).sort((a,b) => b[1] - a[1])[0];
                    statTopSector.textContent = `${topSector[0]} (${topSector[1]} Stocks)`;
                } else {
                    statTopSector.textContent = '-';
                }

                renderScannerTable();
            })
            .catch(err => {
                tableLoading.style.display = 'none';
                tableEmpty.style.display = 'flex';
                console.error(err);
            });
    };

    refreshScannerBtn.addEventListener('click', fetchScreenerResults);

    // Initial Load
    fetchScreenerResults();
    
    // Auto-refresh every 2 minutes
    setInterval(fetchScreenerResults, 120000);
});
