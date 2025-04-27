// peerStatus.js
// Tracks this node's current operational status within the PAN network.

const status = {
  isClusterhead: false,
  isGateway: false,
  clusterheadAgentId: null,
  gatewayAgentId: null,
};

/**
 * Set this node's assigned node_id.
 * @param {string} nodeId
 */
const NODE_ID_SYMBOL = Symbol('nodeId');
let _nodeSetterGiven = false;

function getNodeId() {
    return status[NODE_ID_SYMBOL];
}

function getNodeIdSetter() {
    if (_nodeSetterGiven) throw new Error('Access Denied to NodeID Setter');
    _nodeSetterGiven = true;

    return function setNodeId(value) {
        status[NODE_ID_SYMBOL] = value;
    };
}


/**
 * Set whether this node is acting as a clusterhead.
 * @param {boolean} value
 */
function setClusterhead(value) {
  status.isClusterhead = value;
}

/**
 * Set whether this node is acting as a gateway between clusters.
 * @param {boolean} value
 */
function setGateway(value) {
  status.isGateway = value;
}

/**
 * Set the agent ID handling clusterhead duties.
 * @param {string} agentId
 */
function setClusterheadAgent(agentId) {
  status.clusterheadAgentId = agentId;
}

/**
 * Get the entire current status object (shallow copy).
 */
function getStatus() {
  return { ...status };
}

module.exports = {
  setClusterhead,
  setGateway,
  setClusterheadAgent,
  getStatus,
  getNodeId,
  getNodeIdSetter

};

