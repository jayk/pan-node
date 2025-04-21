// utils/log.js
const winston = require('winston');

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4,
    silly: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    verbose: 'magenta',
    silly: 'gray'
  }
};

winston.addColors(customLevels.colors);

let loggerInstance = null;

const log = {};

// Initialize with console fallback
for (const level of Object.keys(customLevels.levels)) {
  log[level] = (...args) => {
    const fallback = console[level] || console.log;
    fallback(`[fallback:${level}]`, ...args);
  };
}

function initializeLogger(config = {}) {
  const logLevel = config.log_level || 'info';

  const autoFormat = winston.format((info) => {
    const { level, message, timestamp, ...meta } = info;
    let msg = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    if (Object.keys(meta).length > 0) {
      msg += ' ' + JSON.stringify(meta, null, 2);
    }
    info.message = msg;
    return info;
  });

  loggerInstance = winston.createLogger({
    levels: customLevels.levels,
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      autoFormat(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level}: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()]
  });

  // Swap out the fallback handlers with winston-backed ones
  for (const level of Object.keys(customLevels.levels)) {
    log[level] = (...args) => loggerInstance[level](...args);
  }
}

function getLogger() {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call initializeLogger(config) before use.');
  }
  return loggerInstance;
}

module.exports = {
  initializeLogger,
  getLogger,
  log
};

