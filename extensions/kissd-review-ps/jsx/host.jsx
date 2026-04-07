/**
 * ExtendScript host for Kissd Review Photoshop panel.
 * Provides document info for matching files.
 */

function getActiveDocInfo() {
  try {
    if (typeof app !== 'undefined' && app.activeDocument) {
      var doc = app.activeDocument;
      return JSON.stringify({
        success: true,
        name: doc.name,
        width: doc.width.as('px'),
        height: doc.height.as('px'),
        path: doc.path ? doc.path.fsName : '',
      });
    }
    return JSON.stringify({ success: false, error: 'No active document' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
}
