/**
 * Lightweight logging abstraction.
 * In production, suppresses info/warn to keep the console clean.
 * All methods preserve the original call-site in DevTools (no wrapper stack frames).
 */

const isDev = import.meta.env.DEV;

/* eslint-disable no-console */
export const logger = {
  info: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // always log errors
};
