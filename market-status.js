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
    
    // Inject into all widgets on the page
    const widgets = document.querySelectorAll('.market-status-widget');
    widgets.forEach(widget => {
        widget.innerHTML = html;
    });
}

// Run immediately and then every second
document.addEventListener('DOMContentLoaded', () => {
    updateMarketStatus();
    setInterval(updateMarketStatus, 1000);
});
