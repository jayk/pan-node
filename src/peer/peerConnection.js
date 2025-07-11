const { validateIncomingPeerMessage } = require('../utils/validators');
const { log } = require('../utils/log');

class PeerConnection {
    constructor(ws, nodeId, router, details) {
        this.ws = ws;
        this.nodeId = nodeId;
        this.router = router;
        this.details = details;

        ws.on('message', this._onMessage.bind(this));
        ws.on('close', () => {
            log.info(`[peer] Disconnected: ${nodeId}`);
        });
    }

    _onMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            log.warn(`[peer] Invalid JSON from peer ${this.nodeId}`);
            this.ws.close();
            return;
        }

        if (!validateIncomingPeerMessage(msg)) {
            log.warn(`[peer] Protocol violation from peer ${this.nodeId}: ${errors.join('; ')}`);
            this.ws.close();
            return;
        }

        this.router.handleIncomingMessage(this.nodeId, msg);
    }

    sendMessage(msg) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    close() {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.close();
        }
    }
}

module.exports = { PeerConnection };

