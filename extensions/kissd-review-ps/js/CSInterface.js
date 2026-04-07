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
    if (callback) {
      window.__adobe_cep__.evalScript(script, callback);
    } else {
      window.__adobe_cep__.evalScript(script);
    }
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
  // Try native CEP methods (different names across CEP versions)
  if (window.__adobe_cep__) {
    if (typeof window.__adobe_cep__.openURLInDefaultBrowser === 'function') {
      window.__adobe_cep__.openURLInDefaultBrowser(url);
      return;
    }
    // Fallback: use Node.js child_process via cep_node
    if (typeof cep_node !== 'undefined' && cep_node.require) {
      var cp = cep_node.require('child_process');
      var platform = cep_node.process.platform;
      if (platform === 'win32') cp.exec('start "" "' + url + '"');
      else if (platform === 'darwin') cp.exec('open "' + url + '"');
      else cp.exec('xdg-open "' + url + '"');
      return;
    }
  }
  window.open(url, '_blank');
};

var SystemPath = {
  USER_DATA: 'userData',
  COMMON_FILES: 'commonFiles',
  MY_DOCUMENTS: 'myDocuments',
  APPLICATION: 'application',
  EXTENSION: 'extension',
  HOST_APPLICATION: 'hostApplication',
};
