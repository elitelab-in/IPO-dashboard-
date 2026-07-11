const vapidPublicKey = 'BMXlkvg-RkCxBJijymntUqB4dhabvxO6OVCltfvQWsT-U_bv4juuV6BqXFNvf11macvjZmikD_AP7UtpW3Er7Uc'; 

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function saveNotificationPreferences() {
    const btn = document.getElementById('save-notifications-btn');
    const msg = document.getElementById('notif-status-msg');
    const auto_email = document.getElementById('toggle-email').checked;
    const auto_push = document.getElementById('toggle-push').checked;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    msg.innerText = "";
    msg.style.color = "var(--text-secondary)";

    try {
        const res = await fetch('/api/user/notifications/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_email, auto_push })
        });
        
        if (auto_push) {
            await subscribeToPush();
        }
        
        btn.innerHTML = 'Save Preferences';
        btn.disabled = false;
        msg.innerText = "Preferences saved successfully.";
        msg.style.color = "var(--success)";
        
    } catch (err) {
        console.error(err);
        btn.innerHTML = 'Save Preferences';
        btn.disabled = false;
        msg.innerText = "Error saving preferences.";
        msg.style.color = "var(--danger)";
    }
}

async function loadNotificationPreferences() {
    try {
        const res = await fetch('/api/user/notifications/preferences');
        if (res.ok) {
            const data = await res.json();
            document.getElementById('toggle-email').checked = data.auto_email;
            document.getElementById('toggle-push').checked = data.auto_push;
        }
    } catch(e) { console.error(e); }
}

async function subscribeToPush() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const register = await navigator.serviceWorker.register('/sw.js');
            const subscription = await register.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
            
            await fetch('/api/user/notifications/subscribe-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
        } catch(e) {
            console.error("Push registration failed", e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadNotificationPreferences();
});
