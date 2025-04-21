// node/nodeMessages.js
const handlers = new Map();
const { log } = require('../utils/log');

function on(eventName, fn) {
  if (!handlers.has(eventName)) {
    handlers.set(eventName, []);
  }
  handlers.get(eventName).push(fn);
}

function off(eventName, fn) {
  if (!handlers.has(eventName)) return;
  handlers.set(
    eventName,
    handlers.get(eventName).filter(handler => handler !== fn)
  );
}

function emit(eventName, payload) {
  if (!handlers.has(eventName)) return;

  handlers.get(eventName).forEach(fn => {
    setImmediate(() => {
      try {
        fn(payload);
      } catch (err) {
        log.error(`Error in nodeMessages handler for "${eventName}":`, err);
      }
    });
  });
}

module.exports = { on, off, emit };

