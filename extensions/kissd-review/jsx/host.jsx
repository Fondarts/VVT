/**
 * ExtendScript host for Kissd Review CEP panel.
 * Provides playhead seeking in Premiere Pro and After Effects.
 */

/**
 * Seek the active sequence/comp to a given time in seconds.
 * Works in both Premiere Pro and After Effects.
 * @param {number} seconds - Time to seek to
 * @returns {string} JSON result with success/error
 */
function seekToTime(seconds) {
  try {
    // Premiere Pro
    if (typeof app !== 'undefined' && app.project && app.project.activeSequence) {
      var seq = app.project.activeSequence;
      var ticks = seconds * 254016000000; // Premiere ticks per second
      var time = new Time();
      time.ticks = String(Math.round(ticks));
      seq.setPlayerPosition(time.ticks);
      return JSON.stringify({ success: true, app: 'premiere', time: seconds });
    }

    // After Effects
    if (typeof app !== 'undefined' && app.project && app.project.activeItem) {
      var comp = app.project.activeItem;
      if (comp instanceof CompItem) {
        comp.time = seconds;
        return JSON.stringify({ success: true, app: 'aftereffects', time: seconds });
      }
      return JSON.stringify({ success: false, error: 'Active item is not a composition' });
    }

    return JSON.stringify({ success: false, error: 'No active sequence or composition' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
}

/**
 * Get info about the current active sequence/comp.
 * @returns {string} JSON with name, duration, frameRate
 */
function getActiveInfo() {
  try {
    // Premiere Pro
    if (typeof app !== 'undefined' && app.project && app.project.activeSequence) {
      var seq = app.project.activeSequence;
      return JSON.stringify({
        success: true,
        app: 'premiere',
        name: seq.name,
        duration: seq.end - seq.zeroPoint,
        frameRate: seq.getSettings().videoFrameRate,
      });
    }

    // After Effects
    if (typeof app !== 'undefined' && app.project && app.project.activeItem) {
      var comp = app.project.activeItem;
      if (comp instanceof CompItem) {
        return JSON.stringify({
          success: true,
          app: 'aftereffects',
          name: comp.name,
          duration: comp.duration,
          frameRate: comp.frameRate,
        });
      }
    }

    return JSON.stringify({ success: false, error: 'No active sequence or composition' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
}
