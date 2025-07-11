/**
 * peerRegistry.js
 *
 * Tracks peer node connections and shared secrets.
 *
 * Provides registration and lookup for active peers (by node ID),
 * as well as a way to store and retrieve shared secrets for secure communication.
 * Exposes a shutdown method to clear state.
 *
 * TODO: Replace shared secret handling with Vouchsafe identity-based auth.
 */

function initialize(config = {}) {
    const peers = new Map();

    /**
     * Registers a peer connection under the given nodeId.
     *
     * @param {string} nodeId - Unique ID of the peer node.
     * @param {object} peerConnection - Connection object associated with the node.
     */
    function registerPeer(nodeId, peerConnection) {
        peers.set(nodeId, peerConnection);
    }

    function getPeer(nodeId) {
        return peers.get(nodeId);
    }

    /**
     * Returns the number of currently registered peer nodes.
     *
     * @returns {number}
     */
    function getPeerCount() {
        return peers.size;
    }

    /**
     * Shuts down the registry by clearing all stored peers.
     *
     * @returns {Promise<void>}
     */
    async function shutdown() {
        peers.clear();
        nodeSecrets.clear();
    }

    return {
        registerPeer,
        getPeer,
        getPeerCount,
        shutdown
    };
}

module.exports = {
    initialize
};
