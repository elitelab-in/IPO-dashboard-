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
            loadTVWidget(`BSE:${baseSymbol}`);
            
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

    // Frontend paywall lock removed (Fundamentals is now free)

    let fundSelectedPlanId = null;
    let fundActiveOrderId = null;
    let fundPlanName = "";

    window.fundInitiateSubscription = function(planId, isFree, loggedIn, planName) {
        if (!loggedIn) {
            if (isFree) {
                window.location.href = `/register`;
            } else {
                window.location.href = `/login?next=/fundamentals`;
            }
            return;
        }
        
        if (isFree) {
            window.location.reload();
            return;
        }
        
        fundSelectedPlanId = planId;
        fundPlanName = planName;
        
        // Create payment order
        fetch('/api/payments/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId })
        })
        .then(res => res.json())
        .then(orderData => {
            if (orderData.status === 'success') {
                fundActiveOrderId = orderData.order_id;
                
                // Fill modal details
                document.getElementById('fun-modal-plan-name').innerText = orderData.plan_name;
                document.getElementById('fun-modal-order-id').innerText = orderData.order_id;
                document.getElementById('fun-modal-amount').innerText = `₹${parseFloat(orderData.amount / 100).toFixed(2)}`;
                
                // Display modal
                document.getElementById('fun-payment-status-message').style.display = 'none';
                document.getElementById('fundamentals-payment-modal').classList.add('active');
            } else {
                alert(orderData.message || 'Error creating payment order.');
            }
        })
        .catch(err => {
            console.error(err);
            alert('Payment system error. Please try again.');
        });
    };

    window.closeFundPaymentModal = function() {
        document.getElementById('fundamentals-payment-modal').classList.remove('active');
    };

    window.executeFundMockPayment = function(isSuccess) {
        const statusBox = document.getElementById('fun-payment-status-message');
        statusBox.style.display = 'none';
        
        if (!isSuccess) {
            statusBox.innerText = 'Checkout Simulation: Payment was declined or cancelled by the user.';
            statusBox.style.display = 'block';
            return;
        }

        // Simulate sending Razorpay transaction ID, Order ID and mock signature
        const paymentPayload = {
            plan_id: fundSelectedPlanId,
            razorpay_order_id: fundActiveOrderId,
            razorpay_payment_id: `pay_mock_${Math.floor(Math.random() * 900000) + 100000}`,
            razorpay_signature: `sig_mock_${Math.floor(Math.random() * 90000000) + 10000000}`
        };

        const successBtn = document.getElementById('fun-btn-pay-success');
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
                    window.closeFundPaymentModal();
                    window.location.reload(); // Reload page to unlock fundamental data in-place!
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
        const container = document.querySelector('.dashboard-container');
        if (!container) return;
        
        const searchHero = document.getElementById('search-hero');
        if (searchHero) searchHero.style.display = 'none';
        
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
                let headingText = "Unlock Fundamental Analysis";
                let descText = 'Fundamental Analysis is a premium feature reserved for active subscribers. Choose a plan to unlock corporate balance sheets, institutional ratings, and professional growth charts.';
                
                if (isNotLoggedIn) {
                    descText = 'Please <a href="/login?next=/fundamentals" class="highlight-text" style="font-weight: 700; text-decoration: underline;">log in</a> or <a href="/register" class="highlight-text" style="font-weight: 700; text-decoration: underline;">create an account</a> to access professional analysis tools.';
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
                                    onclick="fundInitiateSubscription(${plan.id}, ${isFree}, ${loggedIn}, '${plan.plan_name}')"
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
                            <button class="toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}" onclick="window.setFundBillingCycle('monthly')">Monthly</button>
                            <button class="toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}" onclick="window.setFundBillingCycle('yearly')">Yearly</button>
                        </div>
                        
                        <div class="plans-grid" style="display: flex; gap: 1.25rem; flex-wrap: wrap; justify-content: center; margin-bottom: 0.5rem;">
                            ${cardsHtml}
                        </div>
                    </div>

                    <!-- Dyn Payment Simulator Modal -->
                    <div id="fundamentals-payment-modal" class="payment-modal" style="text-align: left;">
                        <div class="payment-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.75rem;">
                                <h3 style="color: #fff; font-weight: 800; margin: 0; font-size: 1.2rem;">
                                    <i class="fa-solid fa-credit-card" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> Razorpay Sandbox
                                </h3>
                                <button onclick="closeFundPaymentModal()" style="background: none; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; padding: 0.2rem;"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                            
                            <div style="margin-bottom: 1.5rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; padding: 1rem;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                    <span style="color: var(--text-secondary);">Plan selected:</span>
                                    <strong id="fun-modal-plan-name" style="color: #fff;">-</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                    <span style="color: var(--text-secondary);">Order ID:</span>
                                    <code id="fun-modal-order-id" style="color: var(--accent-primary);">-</code>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 1.05rem; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 0.5rem; margin-top: 0.5rem;">
                                    <span style="color: #fff; font-weight: 600;">Total Amount:</span>
                                    <strong id="fun-modal-amount" style="color: var(--success); font-weight: 800;">-</strong>
                                </div>
                            </div>
                            
                            <div id="fun-payment-status-message" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #f87171; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; line-height: 1.4;"></div>
                            
                            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                <button id="fun-btn-pay-success" onclick="executeFundMockPayment(true)" class="btn btn-primary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                    <i class="fa-solid fa-circle-check"></i> Simulate Payment Success
                                </button>
                                <button onclick="executeFundMockPayment(false)" class="btn btn-secondary" style="width: 100%; height: 46px; border-radius: 8px; font-weight: 700; color: var(--text-secondary); border-color: rgba(255,255,255,0.08);">
                                    Decline / Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            window.setFundBillingCycle = function(cycle) {
                billingCycle = cycle;
                renderOverlayContent();
            };

            renderOverlayContent();
        });
    }
});

// TradingView Widget Integration
function loadTVWidget(symbol) {
    const chartContainer = document.getElementById('fundamentals-chart-container');
    if (!chartContainer) return;
    chartContainer.innerHTML = '';
    
    // Check if TradingView is loaded
    if (typeof TradingView === 'undefined') {
        console.error("TradingView widget script not loaded");
        return;
    }
    
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
        container_id: "fundamentals-chart-container",
        autosize: true,
        studies: [
            { id: "MAExp@tv-basicstudies", inputs: { length: 9 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 20 } }
        ]
    });
}
