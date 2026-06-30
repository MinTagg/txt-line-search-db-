// Heartbeat to keep backend alive in packaged exe mode
(function() {
    let clientId = sessionStorage.getItem('clientId');
    if (!clientId) {
        clientId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('clientId', clientId);
    }

    function sendHeartbeat(explicitState) {
        let state = explicitState || document.visibilityState || 'visible';
        fetch('/api/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ client_id: clientId, state: state }),
            keepalive: true
        }).catch(err => console.debug("Heartbeat failed", err));
    }
    
    // Send heartbeat immediately on load
    sendHeartbeat();
    
    // And then every 3 seconds
    setInterval(() => sendHeartbeat(), 3000);

    // When tab visibility changes
    document.addEventListener('visibilitychange', () => {
        sendHeartbeat();
    });

    // When tab is closed or navigated away
    window.addEventListener('pagehide', () => {
        sendHeartbeat('closed');
    });
})();
