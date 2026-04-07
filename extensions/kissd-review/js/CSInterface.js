/**
 * CSInterface.js — Minimal shim for Adobe CEP panels.
 * Based on Adobe CEP SDK CSInterface v11.
 * Only implements the methods needed by Kissd Review panel.
 *
 * In a real CEP environment, the native __adobe_cep__ bridge is available.
 * This file provides the JS wrapper around it.
 */

function CSInterface() {}

/**
 * Evaluate an ExtendScript expression in the host application.
 * @param {string} script - ExtendScript code to evaluate
 * @param {function} [callback] - Optional callback with result string
 */
CSInterface.prototype.evalScript = function(script, callback) {
  if (window.__adobe_cep__) {
    var result = window.__adobe_cep__.evalScript(script);
    if (callback) callback(result);
  } else {
    console.log('[CSInterface] evalScript (no host):', script);
    if (callback) callback('{"success":false,"error":"Not running inside Adobe host"}');
  }
};

/**
 * Get the host environment info.
 * @returns {object} Environment info
 */
CSInterface.prototype.getHostEnvironment = function() {
  if (window.__adobe_cep__) {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); }
    catch(e) { return {}; }
  }
  return { appName: 'unknown', appVersion: '0.0' };
};

/**
 * Get the system path of a specific type.
 * @param {string} pathType
 * @returns {string}
 */
CSInterface.prototype.getSystemPath = function(pathType) {
  if (window.__adobe_cep__) return window.__adobe_cep__.getSystemPath(pathType);
  return '';
};

/**
 * Open a URL in the default browser.
 * @param {string} url
 */
CSInterface.prototype.openURLInDefaultBrowser = function(url) {
  if (window.__adobe_cep__) window.__adobe_cep__.openURLInDefaultBrowser(url);
  else window.open(url, '_blank');
};

var SystemPath = {
  USER_DATA: 'userData',
  COMMON_FILES: 'commonFiles',
  MY_DOCUMENTS: 'myDocuments',
  APPLICATION: 'application',
  EXTENSION: 'extension',
  HOST_APPLICATION: 'hostApplication',
};
