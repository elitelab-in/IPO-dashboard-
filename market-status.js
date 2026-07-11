function updateMarketStatus() {
    // Get current time in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    
    // Get UTC time by adding local timezone offset
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    // Create Date object for IST
    const istTime = new Date(utcTime + istOffset);
    
    const day = istTime.getDay(); // 0 is Sunday, 1 is Monday...
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    
    // Format time for display (e.g. 10:45:03 in 12-hour format without AM/PM)
    const hour12 = hours % 12 || 12;
    const displayHours = hour12 < 10 ? '0' + hour12 : hour12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    const seconds = istTime.getSeconds();
    const displaySeconds = seconds < 10 ? '0' + seconds : seconds;
    const timeString = `${displayHours}:${displayMinutes}:${displaySeconds}`;
    
    // Determine if market is open
    // NSE is open Mon-Fri (1 to 5), 9:15 AM to 3:30 PM (15:30)
    let isOpen = false;
    if (day >= 1 && day <= 5) {
        const timeInMinutes = (hours * 60) + minutes;
        const openTime = (9 * 60) + 15; // 9:15 AM
        const closeTime = (15 * 60) + 30; // 3:30 PM
        
        if (timeInMinutes >= openTime && timeInMinutes < closeTime) {
            isOpen = true;
        }
    }
    
    // Build HTML string
    let html = '';
    if (isOpen) {
        html = `
            <div class="market-status-box open">
                <span class="status-time" style="margin-right: 16px;">${timeString}</span>
                <span class="status-dot blink-green"></span>
                <span class="status-text neon-green-text">Live</span>
            </div>
        `;
    } else {
        html = `
            <div class="market-status-box closed">
                <span class="status-time" style="margin-right: 16px;">${timeString}</span>
                <span class="status-dot solid-red"></span>
                <span class="status-text neon-red-text">Closed</span>
            </div>
        `;
    }
    
    // Inject into all standard widgets on the page
    const widgets = document.querySelectorAll('.market-status-widget');
    widgets.forEach(widget => {
        widget.innerHTML = html;
    });

    // Also inject into the mobile menu top status block
    const mobileMenuWidgets = document.querySelectorAll('.mobile-menu-market-status');
    mobileMenuWidgets.forEach(widget => {
        widget.innerHTML = html;
    });
}

function updateAuthNavbar() {
    fetch('/api/auth/status')
        .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(data => {
            const navLinksContainers = document.querySelectorAll('.nav-links');
            navLinksContainers.forEach(nav => {
                // Clean up any existing auth links to prevent duplicates
                const existing = nav.querySelectorAll('.auth-nav-link');
                existing.forEach(el => el.remove());
                
                if (data.logged_in) {
                    // Render Dashboard Link
                    const dashLink = document.createElement('a');
                    dashLink.href = '/dashboard';
                    dashLink.className = 'nav-link auth-nav-link';
                    dashLink.innerText = 'Dashboard';
                    if (window.location.pathname === '/dashboard') {
                        dashLink.classList.add('active');
                    }
                    nav.appendChild(dashLink);
                    
                    // Render Admin Link if is_admin is true
                    if (data.user && data.user.is_admin) {
                        const adminLink = document.createElement('a');
                        adminLink.href = '/admin';
                        adminLink.className = 'nav-link auth-nav-link';
                        adminLink.innerText = 'Admin';
                        if (window.location.pathname === '/admin') {
                            adminLink.classList.add('active');
                        }
                        nav.appendChild(adminLink);
                    }
                } else {
                    // Render Login Link
                    const loginLink = document.createElement('a');
                    loginLink.href = '/login';
                    loginLink.className = 'btn btn-primary auth-nav-link';
                    loginLink.style.marginLeft = '0.5rem';
                    loginLink.style.padding = '0.4rem 1.2rem';
                    loginLink.style.fontSize = '0.9rem';
                    loginLink.style.borderRadius = '6px';
                    loginLink.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login / Sign up';
                    nav.appendChild(loginLink);
                }
            });
        })
        .catch(err => console.error('Navbar auth status fetch failed:', err));
}

// Run immediately and then every second
document.addEventListener('DOMContentLoaded', () => {
    updateMarketStatus();
    setInterval(updateMarketStatus, 1000);
    updateAuthNavbar();
});
