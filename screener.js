// ═══════════════════════════════════════════════════════════════
//  Elitelab Unified Screener — Intraday + Swing Tab Logic
// ═══════════════════════════════════════════════════════════════

let screenerSelectedPlanId = null;
let screenerActiveOrderId = null;
let screenerPlanName = "";

window.screenerInitiateSubscription = function(planId, isFree, loggedIn, planName) {
    if (!loggedIn) {
        if (isFree) {
            window.location.href = `/register`;
        } else {
            window.location.href = `/login?next=/screener`;
        }
        return;
    }
    
    if (isFree) {
        window.location.reload();
        return;
    }
    
    screenerSelectedPlanId = planId;
    screenerPlanName = planName;
    
    // Create payment order
    fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId })
    })
    .then(res => res.json())
    .then(orderData => {
        if (orderData.status === 'success') {
            screenerActiveOrderId = orderData.order_id;
            
            // Fill modal details
            document.getElementById('scr-modal-plan-name').innerText = orderData.plan_name;
            document.getElementById('scr-modal-order-id').innerText = orderData.order_id;
            document.getElementById('scr-modal-amount').innerText = `₹${parseFloat(orderData.amount / 100).toFixed(2)}`;
            
            // Display modal
            document.getElementById('scr-payment-status-message').style.display = 'none';
            document.getElementById('screener-payment-modal').classList.add('active');
        } else {
            alert(orderData.message || 'Error creating payment order.');
        }
    })
    .catch(err => {
        console.error(err);
        alert('Payment system error. Please try again.');
    });
};

window.closeScreenerPaymentModal = function() {
    document.getElementById('screener-payment-modal').classList.remove('active');
};

window.executeScreenerMockPayment = function(isSuccess) {
    const statusBox = document.getElementById('scr-payment-status-message');
    statusBox.style.display = 'none';
    
    if (!isSuccess) {
        statusBox.innerText = 'Checkout Simulation: Payment was declined or cancelled by the user.';
        statusBox.style.display = 'block';
        return;
    }

    // Simulate sending Razorpay transaction ID, Order ID and mock signature
    const paymentPayload = {
        plan_id: screenerSelectedPlanId,
        razorpay_order_id: screenerActiveOrderId,
        razorpay_payment_id: `pay_mock_${Math.floor(Math.random() * 900000) + 100000}`,
        razorpay_signature: `sig_mock_${Math.floor(Math.random() * 90000000) + 10000000}`
    };

    const successBtn = document.getElementById('scr-btn-pay-success');
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
                window.closeScreenerPaymentModal();
                window.location.reload(); // Reload page to unlock scanner data in-place!
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

function showPremiumLockOverlay(isNotLoggedIn, isUpgrade = false) {
    const container = document.querySelector('.dashboard-container');
    if (!container) return;

    // Hide the hero header section completely so background scanner structure is hidden
    const hero = document.querySelector('.hero');
    if (hero) hero.style.display = 'none';

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
            let headingText = isUpgrade ? "Upgrade to Elite Pro Plan" : "Unlock Elite AI Scanner";
            let descText = isUpgrade 
                ? 'Your current standard <span class="highlight-text" style="font-weight: 700;">Elite Plan</span> does not include the AI Scanner. Upgrade to <span class="highlight-text" style="font-weight: 700;">Elite Pro</span> to unlock real-time breakouts, swing scanner signals, and priority support.'
                : 'The AI Scanner is a premium feature reserved for active subscribers. Choose a plan to unlock real-time breakouts, advanced filters, and priority support.';
            
            if (isNotLoggedIn) {
                descText = 'Please <a href="/login?next=/screener" class="highlight-text" style="font-weight: 700; text-decoration: underline;">log in</a> or <a href="/register" class="highlight-text" style="font-weight: 700; text-decoration: underline;">create an account</a> to access our premium AI Scanner.';
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
                const isElite = !isPro && !isFree;
                
                // Set features array manually to map cleanly
                let features = [];
                if (isFree) {
                    features = ["Economy Analyser Features", "Daily Sector Heatmaps", "Basic Fundamental Search"];
                } else if (isElite) {
                    features = ["Economy Analyser", "Sector Analysis", "Fundamental Analysis", "Standard Filters"];
                } else {
                    features = ["AI Scanner (Intraday + Swing)", "Sector Analysis", "Fundamental Analysis", "Economy Analyser", "Unlimited Usage", "Priority Support"];
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
                } else if (isUpgrade && isElite) {
                    btnText = "Current Plan";
                } else if (isUpgrade && isPro) {
                    btnText = "Upgrade to Pro";
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
                                onclick="screenerInitiateSubscription(${plan.id}, ${isFree}, ${loggedIn}, '${plan.plan_name}')"
                                ${isFree && loggedIn ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}
                                ${isUpgrade && isElite ? 'disabled style="opacity: 0.6; cursor: not-allowed; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: var(--text-secondary);"' : ''}>
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
                        <button class="toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}" onclick="window.setScreenerBillingCycle('monthly')">Monthly</button>
                        <button class="toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}" onclick="window.setScreenerBillingCycle('yearly')">Yearly</button>
                    </div>
                    
                    <div class="plans-grid" style="display: flex; gap: 1.25rem; flex-wrap: wrap; justify-content: center; margin-bottom: 0.5rem;">
                        ${cardsHtml}
                    </div>
                </div>

                <!-- Dyn Payment Simulator Modal -->
                <div id="screener-payment-modal" class="payment-modal" style="text-align: left;">
                    <div class="payment-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.75rem;">
                            <h3 style="color: #fff; font-weight: 800; margin: 0; font-size: 1.2rem;">
                                <i class="fa-solid fa-credit-card" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> Razorpay Sandbox
                            </h3>
                            <button onclick="closeScreenerPaymentModal()" style="background: none; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; padding: 0.2rem;"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; padding: 1rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <span style="color: var(--text-secondary);">Plan selected:</span>
                                <strong id="scr-modal-plan-name" style="color: #fff;">-</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <span style="color: var(--text-secondary);">Order ID:</span>
                                <code id="scr-modal-order-id" style="color: var(--accent-primary);">-</code>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 1.05rem; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 0.5rem; margin-top: 0.5rem;">
                                <span style="color: #fff; font-weight: 600;">Total Amount:</span>
                                <strong id="scr-modal-amount" style="color: var(--success); font-weight: 800;">-</strong>
                            </div>
                        </div>
                        
                        <div id="scr-payment-status-message" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #f87171; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; line-height: 1.4;"></div>
                        
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <button id="scr-btn-pay-success" onclick="executeScreenerMockPayment(true)" class="btn btn-primary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                <i class="fa-solid fa-circle-check"></i> Simulate Payment Success
                            </button>
                            <button onclick="executeScreenerMockPayment(false)" class="btn btn-secondary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; color: var(--text-secondary); border-color: rgba(255,255,255,0.08);">
                                Decline / Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        window.setScreenerBillingCycle = function(cycle) {
            billingCycle = cycle;
            renderOverlayContent();
        };

        renderOverlayContent();
    });
}


// ── Shared: Chart Tooltip ───────────────────────────────────────
const tooltip      = document.getElementById('chart-tooltip');
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
        const sym = `BSE:${symbol}`;
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
            <td><span class="${ratingClass}">${ratingContent}</span></td>
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
        .then(res => {
            if (res.status === 401) {
                showPremiumLockOverlay(true);
                throw new Error('Login required');
            }
            if (res.status === 402 || res.status === 403) {
                res.json().then(data => {
                    const isUpgrade = data.reason === 'upgrade';
                    showPremiumLockOverlay(false, isUpgrade);
                }).catch(() => {
                    showPremiumLockOverlay(false, false);
                });
                throw new Error('Subscription active required');
            }
            if (!res.ok) throw new Error();
            return res.json();
        })
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
        tr.style.cursor = 'pointer';
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
        tr.addEventListener('click', () => { window.location.href = `/fundamentals?symbol=${tickerName}`; });
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
        .then(res => {
            if (res.status === 401) {
                showPremiumLockOverlay(true);
                throw new Error('Login required');
            }
            if (res.status === 402 || res.status === 403) {
                res.json().then(data => {
                    const isUpgrade = data.reason === 'upgrade';
                    showPremiumLockOverlay(false, isUpgrade);
                }).catch(() => {
                    showPremiumLockOverlay(false, false);
                });
                throw new Error('Subscription active required');
            }
            if (!res.ok) throw new Error();
            return res.json();
        })
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
