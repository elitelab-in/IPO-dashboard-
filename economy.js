// ── Economy Scenario Analysis & Simulator Controller ──────────────────────────

const searchInput  = document.getElementById('econ-search');
const submitBtn    = document.getElementById('econ-submit');
const loader       = document.getElementById('econ-loader');
const resultPanel  = document.getElementById('econ-result-panel');

// Search Functionality
async function performSearch(queryText) {
    const query = queryText || searchInput.value.trim();
    if (!query) return;

    if (loader) loader.style.display = 'block';
    if (resultPanel) {
        resultPanel.style.display = 'none';
        resultPanel.classList.remove('panel-fade-in');
    }

    try {
        const response = await fetch(`/api/economy/analyze?query=${encodeURIComponent(query)}`);
        const result = await response.json();

        if (loader) loader.style.display = 'none';

        if (result.status === 'success' && result.found) {
            renderAnalysis(result.data);
        } else {
            renderNoMatch(result.message || 'No direct scenario match found.', result.suggestions);
        }
    } catch (error) {
        console.error('Error fetching economy analysis:', error);
        if (loader) loader.style.display = 'none';
    }
}

// Render dynamic results
function renderAnalysis(data) {
    if (!resultPanel) return;

    // Elements
    const titleEl  = document.getElementById('res-event-title');
    const badgeEl  = document.getElementById('res-impact-badge');
    const reasonEl = document.getElementById('res-event-reason');
    const posSecs  = document.getElementById('res-pos-sectors');
    const negSecs  = document.getElementById('res-neg-sectors');
    const posStks  = document.getElementById('res-pos-stocks');
    const negStks  = document.getElementById('res-neg-stocks');

    titleEl.textContent = data.title;
    reasonEl.textContent = data.reason;

    // Impact Badge status
    badgeEl.textContent = data.market_impact;
    badgeEl.className = 'impact-badge ' + data.market_impact.toLowerCase().split(' ')[0];

    // Sectors Positive
    posSecs.innerHTML = '';
    data.pos_sectors.forEach(sec => {
        posSecs.innerHTML += `<span class="tag-pill">${sec}</span>`;
    });

    // Sectors Negative
    negSecs.innerHTML = '';
    data.neg_sectors.forEach(sec => {
        negSecs.innerHTML += `<span class="tag-pill">${sec}</span>`;
    });

    // Stocks Positive
    posStks.innerHTML = '';
    if (data.pos_stocks.length > 0) {
        data.pos_stocks.forEach(stk => {
            posStks.innerHTML += `<a href="/fundamentals?symbol=${stk}" class="stock-link">${stk} <i class="fa-solid fa-arrow-trend-up"></i></a>`;
        });
    } else {
        posStks.innerHTML = '<span style="font-size:0.8rem; color:var(--text-secondary);">No prominent positive stocks</span>';
    }

    // Stocks Negative
    negStks.innerHTML = '';
    if (data.neg_stocks.length > 0) {
        data.neg_stocks.forEach(stk => {
            negStks.innerHTML += `<a href="/fundamentals?symbol=${stk}" class="stock-link" style="background:rgba(239,68,68,0.06); border-color:rgba(239,68,68,0.2); color:#f87171;">${stk} <i class="fa-solid fa-arrow-trend-down"></i></a>`;
        });
    } else {
        negStks.innerHTML = '<span style="font-size:0.8rem; color:var(--text-secondary);">No prominent negative stocks</span>';
    }

    resultPanel.style.display = 'block';
    resultPanel.classList.add('panel-fade-in');
}

// Render fallback/not found options
function renderNoMatch(message, suggestions) {
    if (!resultPanel) return;

    const titleEl  = document.getElementById('res-event-title');
    const badgeEl  = document.getElementById('res-impact-badge');
    const reasonEl = document.getElementById('res-event-reason');
    const posSecs  = document.getElementById('res-pos-sectors');
    const negSecs  = document.getElementById('res-neg-sectors');
    const posStks  = document.getElementById('res-pos-stocks');
    const negStks  = document.getElementById('res-neg-stocks');

    titleEl.textContent = "Scenario Not Found";
    badgeEl.textContent = "Neutral";
    badgeEl.className = 'impact-badge neutral';
    reasonEl.innerHTML = `${message}<br/><br/><strong style="color:#ffffff;">Suggested Searches:</strong>`;

    posSecs.innerHTML = '';
    negSecs.innerHTML = '';
    posStks.innerHTML = '';
    negStks.innerHTML = '';

    if (suggestions && suggestions.length > 0) {
        suggestions.forEach(sug => {
            reasonEl.innerHTML += `<br/><button class="trend-pill" style="margin-top: 0.5rem; text-align: left;" onclick="triggerSearch('${sug.query}')">${sug.title}</button>`;
        });
    }

    resultPanel.style.display = 'block';
    resultPanel.classList.add('panel-fade-in');
}

// External triggers from pills
function triggerSearch(term) {
    if (searchInput) searchInput.value = term;
    performSearch(term);
}

// Bind search buttons
if (submitBtn) submitBtn.addEventListener('click', () => performSearch());
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}


let liveCrudePrice = null;
let commoditiesLoadedOnce = false;

// ── Live Commodities Data & Heatmap Simulation ────────────────────────────────

let commoditiesData = [];

// Simulation matrix mapping driven by live commodity data
function runSimulation() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    // Helper to get commodity price with fallbacks
    const getPrice = (name, fallback) => {
        const item = commoditiesData.find(c => c.name === name);
        return item ? item.price : fallback;
    };

    // Extract live prices
    const brentCrude = getPrice("Brent Crude", 80.0);
    const bondYield  = getPrice("US 10Y Yield", 4.2);
    const copper     = getPrice("Copper", 4.0);
    const usdInr     = getPrice("USD/INR", 83.5);

    // Classify levels
    // Oil: High > 85, Low < 73
    const oilState = brentCrude > 85.0 ? "high" : (brentCrude < 73.0 ? "low" : "normal");
    // Yield: High > 4.3, Low < 3.5
    const yieldState = bondYield > 4.3 ? "high" : (bondYield < 3.5 ? "low" : "normal");
    // Copper: High > 4.3, Low < 3.5
    const copperState = copper > 4.3 ? "high" : (copper < 3.5 ? "low" : "normal");
    // USD/INR: High > 84.5 (Weak Rupee), Low < 81.0 (Strong Rupee)
    const rupeeState = usdInr > 84.5 ? "high" : (usdInr < 81.0 ? "low" : "normal");

    // Sectors definitions driven directly by live levels
    const sectors = [
        {
            name: "Automobiles",
            calc: () => {
                let s = 1;
                if (oilState === "high") s -= 2;
                else if (oilState === "low") s += 1;
                if (copperState === "high") s -= 1;
                if (yieldState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Favorable commodity prices and low interest rates support high vehicle sales.",
                bearish: "High crude prices (fuel cost) and high material costs (copper) depress auto sales.",
                neutral: "Stable financing rates balance out higher input chemical costs."
            }
        },
        {
            name: "Banking & Financials",
            calc: () => {
                let s = 0;
                if (yieldState === "high") s += 2;
                else if (yieldState === "low") s -= 1;
                return s;
            },
            descMap: {
                bullish: "High bond yields and interest rates expand lending margins and net interest income.",
                bearish: "Low interest spreads compress bank net interest margins.",
                neutral: "Moderate loan growth is offset by stable deposit spreads."
            }
        },
        {
            name: "Paints & Chemicals",
            calc: () => {
                let s = 0;
                if (oilState === "high") s -= 3;
                else if (oilState === "low") s += 2;
                return s;
            },
            descMap: {
                bullish: "Low crude oil prices significantly reduce petrochemical raw material costs.",
                bearish: "Spiking crude oil prices compress paint and chemical margins.",
                neutral: "Stable raw material prices maintain normal operational margins."
            }
        },
        {
            name: "Real Estate & Housing",
            calc: () => {
                let s = 0;
                if (yieldState === "high") s -= 3;
                else if (yieldState === "low") s += 2;
                if (copperState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Low mortgage rates and stable material costs support strong pre-sales.",
                bearish: "High interest rates raise mortgage EMIs and construction material costs.",
                neutral: "Consistent luxury demand counters minor construction cost inflation."
            }
        },
        {
            name: "IT Services (Exporters)",
            calc: () => {
                let s = 1;
                if (rupeeState === "high") s += 2;
                if (yieldState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "A weak Rupee expands profit margins on dollar-denominated contracts.",
                bearish: "High global bond yields reduce client capital budgets.",
                neutral: "Steady long-term deal closures offset currency fluctuations."
            }
        },
        {
            name: "FMCG (Consumer Goods)",
            calc: () => {
                let s = 1;
                if (oilState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Low packaging and transportation costs support product margins.",
                bearish: "High logistics distribution costs and material inflation pressure margins.",
                neutral: "Steady urban consumption matches minor packaging cost increases."
            }
        },
        {
            name: "Oil Upstream (ONGC/OIL)",
            calc: () => {
                let s = 0;
                if (oilState === "high") s += 3;
                else if (oilState === "low") s -= 2;
                return s;
            },
            descMap: {
                bullish: "High crude oil prices expand net realization margins on production.",
                bearish: "Low global crude prices compress extraction profits.",
                neutral: "Stable crude oil prices keep production margins standard."
            }
        },
        {
            name: "Infrastructure & Metals",
            calc: () => {
                let s = 0;
                if (copperState === "high") s += 2;
                else if (copperState === "low") s -= 1;
                if (yieldState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Strong global metal prices boost realizations for steel and copper producers.",
                bearish: "Low commodity demand and high funding rates slow execution.",
                neutral: "Moderate material prices support stable infrastructure developments."
            }
        },
        {
            name: "Pharmaceuticals & Healthcare",
            calc: () => {
                let s = 1;
                if (rupeeState === "high") s += 1;
                if (yieldState === "high") s += 1;
                return s;
            },
            descMap: {
                bullish: "Weak Rupee and defensive capital shifts boost pharma realizations.",
                bearish: "Appreciating Rupee and pricing pressures limit export margins.",
                neutral: "Steady export sales match research capex funding cost spikes."
            }
        },
        {
            name: "Aviation & Logistics",
            calc: () => {
                let s = 0;
                if (oilState === "high") s -= 3;
                else if (oilState === "low") s += 2;
                if (rupeeState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Plunging Brent Crude prices significantly drop aviation turbine fuel (ATF) costs.",
                bearish: "High fuel costs and depreciating rupee squeeze airline operating margins.",
                neutral: "Moderate cargo volumes balance out passenger ticket yields."
            }
        },
        {
            name: "Power & Renewable Energy",
            calc: () => {
                let s = 0;
                if (oilState === "high") s -= 1;
                else if (oilState === "low") s += 1;
                return s;
            },
            descMap: {
                bullish: "Low raw feedstock costs and rising consumption support high grids.",
                bearish: "High fuel costs (gas/coal) compress power tariff spreads.",
                neutral: "Steady long-term utility supply agreements keep cashflows stable."
            }
        },
        {
            name: "Cement & Construction",
            calc: () => {
                let s = 0;
                if (yieldState === "high") s -= 2;
                if (copperState === "high") s -= 1;
                return s;
            },
            descMap: {
                bullish: "Low capital borrowing rates stimulate capital projects and bulk cement orders.",
                bearish: "High interest rates and material inflation slow down execution speeds.",
                neutral: "Public infrastructure projects support baseline order books."
            }
        }
    ];

    // Sort sectors by state: bullish first, then neutral, then bearish
    const stateRank = { "bullish": 2, "neutral": 1, "bearish": 0 };
    
    // First calculate state for all sectors
    const evaluatedSectors = sectors.map(sec => {
        const score = sec.calc();
        let state = "neutral";
        if (score >= 1) state = "bullish";
        else if (score <= -1) state = "bearish";
        
        return {
            name: sec.name,
            state: state,
            desc: sec.descMap[state]
        };
    });
    
    // Sort
    evaluatedSectors.sort((a, b) => stateRank[b.state] - stateRank[a.state]);
    
    // Render sorted list
    container.innerHTML = '';
    evaluatedSectors.forEach(sec => {
        container.innerHTML += `
            <div class="heat-cell heat-${sec.state}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="heat-title">${sec.name}</span>
                    <span class="heat-badge ${sec.state}">${sec.state}</span>
                </div>
                <p class="heat-desc">${sec.desc}</p>
            </div>
        `;
    });
}

// Function to render the global commodities table
function renderCommoditiesTable() {
    const tableBody = document.getElementById('commodities-table-body');
    if (!tableBody || commoditiesData.length === 0) return;

    tableBody.innerHTML = '';
    commoditiesData.forEach(item => {
        const isPos = item.change_pct >= 0;
        const color = isPos ? '#22C55E' : '#EF4444';
        const sign = isPos ? '+' : '';
        
        let formattedPrice;
        const cur = item.currency || '';
        if (cur.startsWith('₹')) {
            // INR-based: Gold MCX, Silver MCX, USD/INR
            formattedPrice = `₹${item.price.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else if (cur === '%') {
            formattedPrice = `${item.price.toFixed(2)}%`;
        } else {
            formattedPrice = `$${item.price.toFixed(2)}`;
        }

        tableBody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background-color 0.2s ease;">
                <td style="padding: 0.55rem 0.25rem; font-weight: 700; color: #FFFFFF;">${item.name}</td>
                <td style="padding: 0.55rem 0.25rem; text-align: right; font-weight: 600;">${formattedPrice}</td>
                <td style="padding: 0.55rem 0.25rem; text-align: right; font-weight: 700; color: ${color}; font-family: monospace;">
                    ${sign}${item.change_pct.toFixed(2)}%
                </td>
            </tr>
        `;
    });
}

// Function to fetch live commodity prices from the server
async function fetchCommodities() {
    try {
        const response = await fetch('/api/economy/commodities');
        const result = await response.json();

        if (result.status === 'success' && result.data) {
            commoditiesData = result.data;
            renderCommoditiesTable();
            runSimulation();
        }
    } catch (e) {
        console.error('Error fetching commodities:', e);
        const tableBody = document.getElementById('commodities-table-body');
        if (tableBody && tableBody.innerHTML === '') {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--danger); padding:1rem;">Error loading prices</td></tr>';
        }
    }
}

// Sub-second client-side tick simulator to make prices tick realistically every second
function simulateTicks() {
    if (commoditiesData.length === 0) return;

    commoditiesData.forEach(item => {
        // Random fluctuation between -0.05% and +0.05%
        const percentOffset = (Math.random() - 0.5) * 0.1; 
        const delta = item.price * (percentOffset / 100);
        item.price += delta;
        item.change += delta;
        item.change_pct += percentOffset;
    });

    renderCommoditiesTable();
    runSimulation();
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchCommodities();
    
    // Poll the backend server every 2 seconds for fresh API data
    setInterval(fetchCommodities, 2000);

    // Fluctuate prices on client-side every 1 second to make table active and ticking
    setInterval(simulateTicks, 1000);
});
