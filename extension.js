/**
 * Active App RAM - GNOME Shell Extension
 *
 * Displays the RAM usage of the currently focused application
 * in the GNOME top bar panel (right side).
 *
 * Compatible with GNOME Shell 45 and 46.
 */

import St from "gi://St";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Maximum characters for the application name before truncation
const MAX_APP_NAME_LENGTH = 20;

// Refresh interval in milliseconds (2 seconds)
const REFRESH_INTERVAL_MS = 2000;

// RAM threshold in MB above which text turns red
const HIGH_RAM_THRESHOLD_MB = 2048;

/**
 * Reads the RSS (Resident Set Size) memory for a given PID by parsing
 * /proc/<pid>/status. Returns the value in kilobytes, or null on failure.
 *
 * @param {number} pid - The process ID to inspect.
 * @returns {number|null} RSS in kilobytes, or null if unavailable.
 */
function getRssKbForPid(pid) {
  if (!pid || pid <= 0) return null;

  try {
    const [ok, contents] = GLib.file_get_contents(`/proc/${pid}/status`);
    if (!ok) return null;

    const text = new TextDecoder().decode(contents);
    const match = text.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (!match) return null;

    return parseInt(match[1], 10);
  } catch (_e) {
    return null;
  }
}

/**
 * Formats a kilobyte value into a human-readable string.
 *   < 1024 MB  → "NNN MB"
 *   >= 1024 MB → "N.N GB"
 *
 * @param {number} kb - Memory size in kilobytes.
 * @returns {string} Human-readable memory string.
 */
function formatMemory(kb) {
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${Math.round(mb)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/**
 * Truncates a string to at most maxLen characters, appending "…" if needed.
 *
 * @param {string} name - The string to truncate.
 * @param {number} maxLen - Maximum allowed length.
 * @returns {string} Possibly-truncated string.
 */
function truncateName(name, maxLen) {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

/**
 * Returns the title of the currently focused window's application (WM_CLASS),
 * and its PID. Returns null when there is no focused window.
 *
 * @returns {{appName: string, pid: number}|null}
 */
function getFocusedAppInfo() {
  const focusedWindow = global.display.get_focus_window();
  if (!focusedWindow) return null;

  // get_pid() returns 0 when the PID is unknown
  const pid = focusedWindow.get_pid();
  if (!pid || pid <= 0) return null;

  // Prefer the app name from the window title's WM_CLASS; fall back to title
  let appName =
    focusedWindow.get_wm_class_instance() ||
    focusedWindow.get_wm_class() ||
    focusedWindow.get_title() ||
    "Unknown";

  // Capitalize the first letter for nicer display
  appName = appName.charAt(0).toUpperCase() + appName.slice(1);

  return { appName, pid };
}

export default class ActiveAppRamExtension {
  constructor() {
    this._label = null;
    this._timeoutId = null;
    this._focusSignalId = null;
  }

  /**
   * Called by GNOME Shell when the extension is enabled.
   * Creates the panel widget, connects signals, and starts the refresh loop.
   */
  enable() {
    // Create the label widget
    this._label = new St.Label({
      text: "No App",
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "active-app-ram-label",
    });

    // Insert into the right section of the top bar
    Main.panel._rightBox.insert_child_at_index(this._label, 0);

    // Update immediately when the focused window changes
    this._focusSignalId = global.display.connect(
      "notify::focus-window",
      () => {
        this._update();
      }
    );

    // Start the periodic refresh timer
    this._startTimer();

    // Populate the label right away
    this._update();
  }

  /**
   * Called by GNOME Shell when the extension is disabled.
   * Cleans up the timer, signals, and panel widget.
   */
  disable() {
    this._stopTimer();

    if (this._focusSignalId !== null) {
      global.display.disconnect(this._focusSignalId);
      this._focusSignalId = null;
    }

    if (this._label !== null) {
      Main.panel._rightBox.remove_child(this._label);
      this._label.destroy();
      this._label = null;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Starts the GLib periodic timeout that refreshes the label every
   * REFRESH_INTERVAL_MS milliseconds.
   */
  _startTimer() {
    this._timeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      REFRESH_INTERVAL_MS,
      () => {
        this._update();
        return GLib.SOURCE_CONTINUE;
      }
    );
  }

  /**
   * Cancels the periodic refresh timer, if one is active.
   */
  _stopTimer() {
    if (this._timeoutId !== null) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = null;
    }
  }

  /**
   * Reads the focused application name and RSS, then updates the panel label.
   * Applies a red color when RAM usage exceeds HIGH_RAM_THRESHOLD_MB.
   */
  _update() {
    if (!this._label) return;

    const info = getFocusedAppInfo();

    if (!info) {
      this._label.set_text("No App");
      this._label.set_style(null);
      return;
    }

    const { appName, pid } = info;
    const rssKb = getRssKbForPid(pid);

    if (rssKb === null) {
      // PID found but /proc entry is unavailable (process may have just exited)
      this._label.set_text(`${truncateName(appName, MAX_APP_NAME_LENGTH)}`);
      this._label.set_style(null);
      return;
    }

    const memStr = formatMemory(rssKb);
    const displayName = truncateName(appName, MAX_APP_NAME_LENGTH);
    this._label.set_text(`${displayName}  ${memStr}`);

    // Highlight in red if RAM exceeds threshold
    const mb = rssKb / 1024;
    if (mb > HIGH_RAM_THRESHOLD_MB) {
      this._label.set_style("color: #ff4444;");
    } else {
      this._label.set_style(null);
    }
  }
}
