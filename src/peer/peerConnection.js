class peerConnection {
    constructor(ws, node_id) {
        this.ws = ws;
        this.node_id = node_id;

        ws.on('message', this._onMessage.bind(this));
        ws.on('close', () => {
            console.log(`[peer] Peer disconnected: ${node_id}`);
            // deregister if needed
        });
    }

    _onMessage(data) {
        // route peer_control, direct, broadcast
    }

    sendMessage(msg) {
        this.ws.send(JSON.stringify(msg));
    }
}

module.exports = { peerConnection };
