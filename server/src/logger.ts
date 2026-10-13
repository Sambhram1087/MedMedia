import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});
