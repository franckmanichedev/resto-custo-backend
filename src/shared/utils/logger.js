const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

const messageFormat = printf(({ level, message, timestamp: logTimestamp, stack, ...meta }) => {
    let output = `${logTimestamp} [${level}] ${message}`;
    if (stack) {
        output += `\n${stack}`;
    }

    if (Object.keys(meta).length) {
        output += ` ${JSON.stringify(meta)}`;
    }

    return output;
});

module.exports = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp(), errors({ stack: true }), messageFormat),
    transports: [
        new transports.Console({
            format: combine(colorize(), messageFormat)
        })
    ],
    exitOnError: false
});
