// Fundamentals Page Logic

document.addEventListener('DOMContentLoaded', () => {
    
    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Chart instances
    let priceChartInstance = null;
    let holdingsChartInstance = null;

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
        
        // Auto-append .NS if not specified, since most Indian stocks on yfinance use .NS
        if (!symbol.includes('.')) {
            symbol += '.NS';
            searchInput.value = symbol;
        }

        // UI States
        initialState.style.display = 'none';
        errorState.style.display = 'none';
        dashboardData.style.display = 'none';
        loadingState.style.display = 'block';

        try {
            const response = await fetch(`/api/fundamentals/${symbol}`);
            if (!response.ok) {
                throw new Error('Stock not found or server error');
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            renderDashboard(data);
            
            loadingState.style.display = 'none';
            dashboardData.style.display = 'block';
            
            // Re-render charts to fit new container dimensions
            if(priceChartInstance) priceChartInstance.resize();
            if(holdingsChartInstance) holdingsChartInstance.resize();

        } catch (error) {
            console.error('Error fetching fundamentals:', error);
            loadingState.style.display = 'none';
            errorState.style.display = 'block';
            document.getElementById('error-message').textContent = error.message || 'Could not fetch data';
        }
    }

    searchBtn.addEventListener('click', fetchFundamentals);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchFundamentals();
    });

    // Check for deep link from screener
    const urlParams = new URLSearchParams(window.location.search);
    const deepLinkSymbol = urlParams.get('symbol');
    if (deepLinkSymbol) {
        searchInput.value = deepLinkSymbol;
        fetchFundamentals();
    }

    // Formatters
    const formatCurrency = (val) => {
        if (val === undefined || val === null || val === '-') return '-';
        if (val > 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr';
        if (val > 100000) return '₹' + (val / 100000).toFixed(2) + ' L';
        return '₹' + val.toLocaleString('en-IN');
    };

    function renderDashboard(data) {
        // 1. Header & Overview Stats
        document.getElementById('stock-name').innerHTML = `${data.name || 'Unknown Company'} <span class="stock-symbol-badge" id="stock-symbol">${data.symbol}</span>`;
        document.getElementById('stock-sector').textContent = data.sector || 'Equities';
        
        document.getElementById('live-price').textContent = `₹${data.price.toFixed(2)}`;
        
        const changeEl = document.getElementById('live-change');
        if (data.change_pct >= 0) {
            changeEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> ${data.change_pct.toFixed(2)}%`;
            changeEl.className = 'change positive';
        } else {
            changeEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${Math.abs(data.change_pct).toFixed(2)}%`;
            changeEl.className = 'change negative';
        }

        document.getElementById('stat-mcap').textContent = formatCurrency(data.overview.market_cap);
        document.getElementById('stat-pe').textContent = data.overview.pe_ratio ? data.overview.pe_ratio.toFixed(2) : '-';
        document.getElementById('stat-eps').textContent = data.overview.eps ? '₹' + data.overview.eps.toFixed(2) : '-';
        document.getElementById('stat-high').textContent = data.overview.high_52 ? '₹' + data.overview.high_52.toFixed(2) : '-';
        document.getElementById('stat-pb').textContent = data.overview.pb_ratio ? data.overview.pb_ratio.toFixed(2) : '-';
        document.getElementById('stat-yield').textContent = data.overview.div_yield ? (data.overview.div_yield * 100).toFixed(2) + '%' : '-';

        // 2. Render Price Chart
        renderPriceChart(data.history);

        // 3. Render Financials
        renderFinancials(data.financials);

        // 4. Render Holdings Chart
        renderHoldingsChart(data.holdings);

        // 5. Render Dividends
        renderDividends(data.dividends);
    }

    function renderPriceChart(history) {
        const ctx = document.getElementById('priceChart').getContext('2d');
        
        if (priceChartInstance) {
            priceChartInstance.destroy();
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

        priceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.dates,
                datasets: [{
                    label: 'Close Price',
                    data: history.prices,
                    borderColor: '#22c55e',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#22c55e',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            color: 'rgba(255,255,255,0.05)'
                        },
                        ticks: {
                            color: 'rgba(255,255,255,0.5)'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    function renderFinancials(financials) {
        const headers = document.getElementById('financial-headers');
        const body = document.getElementById('financial-body');
        
        // Clear existing
        headers.innerHTML = '<th>Metric</th>';
        body.innerHTML = '';

        if (!financials || !financials.dates || financials.dates.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="text-center">No quarterly data available</td></tr>';
            return;
        }

        // Add Date Headers
        financials.dates.forEach(date => {
            const th = document.createElement('th');
            th.textContent = date;
            headers.appendChild(th);
        });

        // Add Rows
        const metrics = [
            { key: 'revenue', label: 'Total Revenue' },
            { key: 'ebitda', label: 'EBITDA' },
            { key: 'pbit', label: 'PBIT' },
            { key: 'pbt', label: 'PBT' },
            { key: 'net_income', label: 'Net Income' },
            { key: 'eps', label: 'EPS' }
        ];

        metrics.forEach(metric => {
            if (financials[metric.key] && financials[metric.key].length > 0) {
                const tr = document.createElement('tr');
                const tdLabel = document.createElement('td');
                tdLabel.innerHTML = `<strong>${metric.label}</strong>`;
                tr.appendChild(tdLabel);

                financials[metric.key].forEach(val => {
                    const td = document.createElement('td');
                    td.textContent = metric.key === 'eps' ? (val ? val.toFixed(2) : '-') : formatCurrency(val);
                    tr.appendChild(td);
                });

                body.appendChild(tr);
            }
        });
    }

    // Register datalabels
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    let currentHoldingsData = null;

    function renderHoldingsChart(holdings) {
        currentHoldingsData = holdings;
        const ctx = document.getElementById('holdingsChart').getContext('2d');
        const selectEl = document.getElementById('holdings-type-select');
        
        if (holdingsChartInstance) {
            holdingsChartInstance.destroy();
        }

        if (!holdings || !holdings.dates || holdings.dates.length === 0) {
            return;
        }
        
        // Remove existing listener if any to avoid duplicates
        const newSelect = selectEl.cloneNode(true);
        selectEl.parentNode.replaceChild(newSelect, selectEl);
        
        function updateChart() {
            const selectedType = newSelect.value;
            const dataMap = {
                'promoters': { data: holdings.promoters || [], color: '#3b82f6', label: 'Total Promoter Holding (%)' },
                'mutual_funds': { data: holdings.mutual_funds || [], color: '#f59e0b', label: 'Mutual Funds (%)' },
                'fii': { data: holdings.fii || [], color: '#4ade80', label: 'Foreign Institutions (%)' },
                'retail': { data: holdings.retail || [], color: '#ec4899', label: 'Retail and Others (%)' }
            };
            
            const conf = dataMap[selectedType] || dataMap['fii'];

            if (holdingsChartInstance) {
                holdingsChartInstance.destroy();
            }

            holdingsChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: holdings.dates,
                    datasets: [{
                        label: conf.label,
                        data: conf.data,
                        backgroundColor: conf.color,
                        borderRadius: 4,
                        barPercentage: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(15, 23, 42, 0.9)'
                        },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            color: 'rgba(255,255,255,0.9)',
                            font: { weight: 'bold' },
                            formatter: function(value) {
                                return value.toFixed(2) + '%';
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: 'rgba(255,255,255,0.5)' }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: {
                                color: 'rgba(255,255,255,0.5)',
                                callback: function(value) { return value + '%' }
                            },
                            suggestedMax: Math.max(...conf.data) * 1.2 // give room for label
                        }
                    }
                }
            });
        }
        
        newSelect.addEventListener('change', updateChart);
        updateChart(); // Initial render
    }

    function renderDividends(dividends) {
        const body = document.getElementById('dividends-body');
        body.innerHTML = '';

        if (!dividends || dividends.length === 0) {
            body.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">No recent dividend history found.</td></tr>';
            return;
        }

        dividends.forEach(div => {
            const tr = document.createElement('tr');
            
            const tdEvent = document.createElement('td');
            tdEvent.innerHTML = `<i class="fa-solid fa-money-bill" style="color: #f59e0b; margin-right: 0.5rem;"></i> Cash Dividend`;
            
            const tdAmount = document.createElement('td');
            tdAmount.innerHTML = `<strong>₹${div.amount.toFixed(2)}</strong>`;
            
            const tdDate = document.createElement('td');
            tdDate.textContent = div.date;
            
            tr.appendChild(tdEvent);
            tr.appendChild(tdAmount);
            tr.appendChild(tdDate);
            body.appendChild(tr);
        });
    }

});
