class PeerRegistry {
    constructor() {
        this.peers = new Map();         // node_id → PeerConnection
        this.nodeSecrets = new Map();   // node_id → shared secret
    }

    getSecretForNode(node_id) {
        return this.nodeSecrets.get(node_id);
    }

    registerPeer(node_id, peer) {
        this.peers.set(node_id, peer);
    }

    getPeer(node_id) {
        return this.peers.get(node_id);
    }

    getPeerCount() {
        return this.peers.size;
    }

    sendToNode(node_id, msg, fromPan) {
        const peer = this.getPeer(node_id);
        if (!peer) {
            return fromPan?.sendError?.(`Node ${node_id} not reachable`, msg);
        }
        peer.sendMessage(msg);
    }
}

const peerRegistry = new PeerRegistry();
module.exports = { peerRegistry };
