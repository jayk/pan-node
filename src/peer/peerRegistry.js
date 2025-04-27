function initialize(config = {}) {
    const peers = new Map();
    const nodeSecrets = new Map();   // node_id → shared secret

    function registerPeer(nodeId, peerConnection) {
        peers.set(nodeId, peerConnection);
    }

    function getSecretForNode(nodeId) {
        return this.nodeSecrets.get(node_id);
    }

    function getPeerCount() {
        return peers.size;
    }

    async function shutdown() {
        peers.clear();
    }

    return {
        registerPeer,
        getSecretForNode,
        getPeerCount,
        shutdown
    };
}

module.exports = {
    initialize
};
