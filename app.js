document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body');
    const loadingState = document.getElementById('loading-state');
    const refreshBtn = document.getElementById('refresh-btn');
    const scanStatus = document.getElementById('scan-status');
    const tooltip = document.getElementById('chart-tooltip');
    const iframe = document.getElementById('chart-iframe');
    const paginationControls = document.getElementById('pagination-controls');
    
    // Pagination State
    let currentData = [];
    let currentPage = 1;
    const rowsPerPage = 20;
    
    // Add tooltip interaction listeners if tooltip exists
    if (tooltip) {
        tooltip.addEventListener('mouseenter', () => {
            clearTimeout(window.tooltipHideTimeout);
        });
        tooltip.addEventListener('mouseleave', () => {
            window.tooltipHideTimeout = setTimeout(() => {
                tooltip.classList.remove('visible');
                if (iframe) iframe.src = '';
                tooltip.dataset.symbol = '';
            }, 300);
        });
    }

    // Function to render table rows
    const renderTable = () => {
        if (!tableBody || !paginationControls) return;
        
        tableBody.innerHTML = '';
        paginationControls.innerHTML = '';
        
        if (!currentData || currentData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        No stocks found matching the criteria.
                    </td>
                </tr>
            `;
            return;
        }

        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const paginatedData = currentData.slice(start, end);

        paginatedData.forEach(stock => {
            const isPositive = stock.per_chg >= 0;
            const chgClass = isPositive ? 'success' : 'danger';
            const chgIcon = isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            const chgSign = isPositive ? '+' : '';
            
            const volumeStr = stock.volume > 1000000 
                ? (stock.volume / 1000000).toFixed(2) + 'M' 
                : (stock.volume > 1000 ? (stock.volume / 1000).toFixed(1) + 'K' : stock.volume);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="hover-target" style="cursor: pointer;">
                    <div class="symbol">${stock.nsecode || stock.bsecode || 'N/A'}</div>
                </td>
                <td class="hover-target" style="cursor: pointer;">
                    <div class="company-name">${stock.name}</div>
                </td>
                <td style="font-weight: 600;">&#8377;${parseFloat(stock.close).toFixed(2)}</td>
                <td>
                    <span class="badge ${chgClass}">
                        <i class="fa-solid ${chgIcon}"></i> ${chgSign}${stock.per_chg}%
                    </span>
                </td>
                <td style="color: var(--text-secondary);">${volumeStr}</td>
                <td>
                    <span class="badge sector-span" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--glass-border);">
                        ${(stock.sector && stock.sector !== 'Unknown') ? stock.sector : 'N/A'}
                    </span>
                </td>
            `;
            
            // The sector is already in stock.sector from backend
            
            const hoverTargets = tr.querySelectorAll('.hover-target');
            
            hoverTargets.forEach(target => {
                target.addEventListener('mouseenter', (e) => {
                    if (!tooltip) return;
                    clearTimeout(window.tooltipHideTimeout);
                    
                    const tickerName = stock.nsecode || stock.name.split(' ')[0].toUpperCase();
                    const symbol = `BSE:${tickerName}`;
                    
                    if (!symbol) return;
                    
                    if (tooltip.dataset.symbol !== symbol) {
                        const encodedSymbol = encodeURIComponent(symbol);
                        if (iframe) iframe.src = `https://s.tradingview.com/widgetembed/?symbol=${encodedSymbol}&interval=D&theme=dark&style=1&hide_top_toolbar=1&hide_legend=1&save_image=0&timezone=Asia/Kolkata`;
                        tooltip.dataset.symbol = symbol;
                    }
                    
                    if (!tooltip.classList.contains('visible')) {
                        let left = e.clientX + 20;
                        let top = e.clientY - 150;
                        if (left + 420 > window.innerWidth) left = e.clientX - 440;
                        if (top < 20) top = 20;
                        if (top + 320 > window.innerHeight) top = window.innerHeight - 340;
                        
                        tooltip.style.left = left + 'px';
                        tooltip.style.top = top + 'px';
                    }
                    
                    tooltip.classList.add('visible');
                });

                target.addEventListener('mouseleave', () => {
                    if (!tooltip) return;
                    window.tooltipHideTimeout = setTimeout(() => {
                        tooltip.classList.remove('visible');
                        if (iframe) iframe.src = '';
                        tooltip.dataset.symbol = '';
                    }, 300);
                });
            });

            tableBody.appendChild(tr);
        });
        
        renderPagination();
    };

    // Function to render pagination controls
    const renderPagination = () => {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        
        const totalPages = Math.ceil(currentData.length / rowsPerPage);
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        });
        paginationControls.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderTable();
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
                renderTable();
            }
        });
        paginationControls.appendChild(nextBtn);
    };

    // Function to update quick stats
    const updateStats = (data) => {
        const scannedEl = document.getElementById('stat-total-scanned');
        if (scannedEl) scannedEl.textContent = data.length;
        
        const sectorEl = document.getElementById('stat-top-sector');
        if (!sectorEl) return;
        
        if (data.length === 0) {
            sectorEl.textContent = '-';
            return;
        }

        const counts = {};
        data.forEach(stock => {
            const sec = stock.sector && stock.sector !== 'Unknown' ? stock.sector : 'Other';
            counts[sec] = (counts[sec] || 0) + 1;
        });

        // Sort by count descending and take top 3
        const sortedSectors = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        
        // Format string: IT (5) • PSU (3) • Power (2)
        const displayString = sortedSectors.map(([sec, count]) => `${sec} (${count})`).join(' &bull; ');
        
        sectorEl.innerHTML = displayString;
        sectorEl.title = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([sec, count]) => `${sec}: ${count}`).join(', '); // Show all on hover
    };

    // Function to fetch data
    const fetchScreenerData = async () => {
        if (loadingState) loadingState.classList.add('active');
        if (tableBody) tableBody.innerHTML = '';
        if (scanStatus) scanStatus.textContent = 'Scanning...';
        
        try {
            const response = await fetch('/api/screener');
            const result = await response.json();
            
            if (result.data) {
                result.data.sort((a, b) => b.per_chg - a.per_chg);
                currentData = result.data;
                currentPage = 1;
                updateStats(currentData);
                renderTable();
            } else {
                currentData = [];
                updateStats([]);
                renderTable();
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--danger);">
                            Error loading screener data. Please try again later.
                        </td>
                    </tr>
                `;
            }
        } finally {
            document.getElementById('loading-state')?.style.setProperty('display', 'none');
            if (scanStatus) {
                scanStatus.textContent = 'Live';
                if (scanStatus.previousElementSibling) scanStatus.previousElementSibling.classList.remove('scanning');
            }
            
            const panel = document.querySelector('.glass-panel');
            if (panel) {
                panel.style.boxShadow = '0 0 30px rgba(139, 92, 246, 0.3)';
                setTimeout(() => {
                    panel.style.boxShadow = '';
                }, 1000);
            }
        }
    };

    // Event listeners
    if (refreshBtn) refreshBtn.addEventListener('click', fetchScreenerData);

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Push Notification Logic
    const alertBtns = document.querySelectorAll('.alert-btn');
    alertBtns.forEach(alertBtn => {
        // Check current permission on load
        if ('Notification' in window && Notification.permission === 'granted') {
            alertBtn.innerHTML = '<i class="fa-solid fa-check"></i> Subscribed';
            alertBtn.classList.replace('btn-secondary', 'btn-primary');
        }

        alertBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!('Notification' in window)) {
                alert("This browser does not support desktop notifications.");
                return;
            }

            if (Notification.permission === 'granted') {
                alert("You are already subscribed to EliteLab alerts!");
                return;
            }

            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    // Update all buttons if granted
                    alertBtns.forEach(btn => {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> Subscribed';
                        btn.classList.replace('btn-secondary', 'btn-primary');
                    });
                    
                    // Trigger a test local notification
                    new Notification("EliteLab Alerts", {
                        body: "You are now successfully subscribed to market alerts!",
                        icon: "data:image/svg+xml,%3Csvg width='110' height='52' viewBox='0 0 110 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 0 4 L 9 4 L 9 39 L 36 39 L 36 48 L 0 48 Z' fill='%238B5CF6' /%3E%3C/svg%3E"
                    });
                }
            } else {
                alert("Notification permissions are blocked in your browser settings.");
            }
        });
    });

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js').then(function(registration) {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    // Initial load
    if (tableBody) fetchScreenerData();
});
