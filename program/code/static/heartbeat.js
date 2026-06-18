// Heartbeat to keep backend alive in packaged exe mode
(function() {
    function sendHeartbeat() {
        fetch('/api/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }).catch(err => console.debug("Heartbeat failed", err));
    }
    
    // Send heartbeat immediately on load
    sendHeartbeat();
    
    // And then every 3 seconds
    setInterval(sendHeartbeat, 3000);
})();
