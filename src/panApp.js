// panApp.js

const pan = {};

const NODE_ID_SYMBOL = Symbol('nodeId');
let _nodeSetterGiven = false;

function getNodeId() {
    return pan[nodeIdSymbol];
}

function getNodeIdSetter() {
    if (_nodeSetterGiven) throw new Error('Access Denied to NodeID Setter');
    _nodeSetterGiven = true;

    return function setNodeId(value) {
        pan[NODE_ID_SYMBOL] = value;
    };
}

function getNodeId() {
  return pan[NODE_ID_SYMBOL]
}

function setSubsystem(name, instance) {
  //console.log('setting ', name, instance);
  pan[name] = instance;
}

function use(name) {
  return pan[name];
}

function getAll() {
  return pan;
}

module.exports = {
  setSubsystem,
  use,
  getAll,
  getNodeId,
  getNodeIdSetter
};
