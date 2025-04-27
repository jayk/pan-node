// panApp.js
const peerStatus = require('./peer/peerStatus');

const pan = {};

function getNodeId() {
    return peerStatus.getNodeId();
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
};
