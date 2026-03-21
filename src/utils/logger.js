const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

// custom log format
const myFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (stack) msg += `\n${stack}`;
    if (Object.keys(meta).length) {
        msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
});

// create logger instance
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp(),
        errors({ stack: true }),
        myFormat
    ),
    transports: [
        new transports.Console({
            format: combine(colorize(), myFormat)
        })
        // additional transports (file, remote) can be added here
    ],
    exitOnError: false
});

module.exports = logger;
