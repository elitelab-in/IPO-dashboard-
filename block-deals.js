// Fetch real data from NSE via our backend API.
let allDeals = [];
let currentFilter = 'BUY';

document.addEventListener('DOMContentLoaded', () => {
    loadBlockDeals();
});

function loadBlockDeals() {
    const tableBody = document.getElementById('dealsTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;"><div class="spinner" style="margin:0 auto 1rem;"></div>Loading NSE Deals...</td></tr>';
    
    fetch('/api/block-deals')
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'error') {
                throw new Error(resData.message);
            }
            
            allDeals = resData.data || [];
            applyFilters();
        })
        .catch(err => {
            console.error(err);
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load deals: ${err.message}</td></tr>`;
        });
}

function renderDeals(deals) {
    const tableBody = document.getElementById('dealsTableBody');
    tableBody.innerHTML = ''; // Clear existing rows

    if (!deals || deals.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No deals match the selected criteria.</td></tr>';
        return;
    }

    deals.forEach(deal => {
        const tr = document.createElement('tr');
        
        const typeClass = deal.buySell === 'BUY' ? 'type-buy' : 'type-sell';
        
        // Parse values safely
        const qty = parseFloat(deal.qty) || 0;
        const price = parseFloat(deal.watp) || 0;
        const valueCr = (qty * price) / 10000000;
        
        tr.innerHTML = `
            <td>${deal.date}</td>
            <td class="symbol-col hover-target" style="cursor: pointer;" title="Click for Fundamental Analysis">${deal.symbol}</td>
            <td>${deal.clientName}</td>
            <td><span class="${typeClass}">${deal.buySell}</span></td>
            <td style="text-align: right; font-family: monospace;">${qty.toLocaleString('en-IN')}</td>
            <td style="text-align: right; font-family: monospace;">${price.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 600;">${valueCr.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        `;
        
        tr.querySelectorAll('.hover-target').forEach(t => attachTooltip(t, deal.symbol));
        tr.addEventListener('click', () => { window.location.href = `/fundamentals?symbol=${deal.symbol}`; });
        tableBody.appendChild(tr);
    });
}

function setDealType(type) {
    if (currentFilter === type) return;
    
    currentFilter = type;
    document.getElementById('btn-buy-toggle').classList.remove('active');
    document.getElementById('btn-sell-toggle').classList.remove('active');
    document.getElementById(`btn-${type.toLowerCase()}-toggle`).classList.add('active');
    
    applyFilters();
}

function applyFilters() {
    const filteredDeals = allDeals.filter(deal => deal.buySell === currentFilter);
    renderDeals(filteredDeals);
}

// Chart Tooltip Logic
const tooltip = document.getElementById('chart-tooltip');
const chartContainer = document.getElementById('chart-container');

if (tooltip) {
    tooltip.addEventListener('mouseenter', () => clearTimeout(window.tooltipHideTimeout));
    tooltip.addEventListener('mouseleave', () => {
        window.tooltipHideTimeout = setTimeout(() => {
            tooltip.classList.remove('visible');
            tooltip.dataset.symbol = '';
        }, 300);
    });
}

function loadTVWidget(symbol) {
    if (!chartContainer) return;
    chartContainer.innerHTML = '';
    new TradingView.widget({
        symbol: symbol,
        interval: "D",
        timezone: "Asia/Kolkata",
        theme: "dark",
        style: "1",
        locale: "en",
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: "chart-container",
        autosize: true,
        studies: [
            { id: "MAExp@tv-basicstudies", inputs: { length: 9 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 20 } }
        ]
    });
}

function attachTooltip(target, symbol) {
    target.addEventListener('mouseenter', (e) => {
        if (!tooltip) return;
        clearTimeout(window.tooltipHideTimeout);
        // Clean the symbol: sometimes NSE block deals have weird suffixes, we strip them.
        let cleanSymbol = symbol.split('-')[0].replace(/[^a-zA-Z0-9]/g, '');
        // Use BSE because TradingView free widgets often block NSE real-time data or show errors
        const sym = `BSE:${cleanSymbol}`; 
        if (tooltip.dataset.symbol !== sym) {
            loadTVWidget(sym);
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
            tooltip.dataset.symbol = '';
        }, 300);
    });
}

// Function to export HTML table to CSV
function exportTableToCSV(filename) {
    const table = document.getElementById('dealsTable');
    let csv = [];
    
    for (let i = 0; i < table.rows.length; i++) {
        let row = [], cols = table.rows[i].querySelectorAll('td, th');
        
        for (let j = 0; j < cols.length; j++) {
            // Escape double quotes and wrap in quotes to handle commas in numbers/text
            let data = cols[j].innerText.replace(/"/g, '""');
            row.push('"' + data + '"');
        }
        
        csv.push(row.join(','));
    }
    
    downloadCSV(csv.join('\n'), filename);
}

function downloadCSV(csv, filename) {
    let csvFile;
    let downloadLink;

    csvFile = new Blob([csv], {type: 'text/csv'});

    downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);

    downloadLink.click();
    document.body.removeChild(downloadLink);
}
