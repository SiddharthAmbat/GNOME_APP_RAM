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

// Refresh interval in seconds
const REFRESH_INTERVAL_SECONDS = 2;

// RAM threshold in MB above which text turns red
const HIGH_RAM_THRESHOLD_MB = 2048;

/**
 * Returns the process name (comm) for a given PID by running:
 *   ps -p PID -o comm=
 * Returns null on failure or if the process is not found.
 *
 * @param {number} pid - The process ID to inspect.
 * @returns {string|null} Process name, or null if unavailable.
 */
function getProcessNameForPid(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return null;

  try {
    const [ok, stdout] = GLib.spawn_sync(
      null,
      ["ps", "-p", String(pid), "-o", "comm="],
      null,
      GLib.SpawnFlags.SEARCH_PATH,
      null
    );
    if (!ok || !stdout) return null;

    const name = new TextDecoder().decode(stdout).trim();
    // Only accept names composed of safe characters (alphanumeric, hyphen, dot)
    if (!/^[\w.-]+$/.test(name)) return null;
    return name.length > 0 ? name : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Returns the total RSS (in kilobytes) across all processes with the given
 * process name by running:
 *   ps -C NAME -o rss=
 * and summing all values.
 *
 * @param {string} processName - The process name to look up.
 * @returns {number|null} Total RSS in kilobytes, or null if unavailable.
 */
function getTotalRssKbForProcessName(processName) {
  if (!processName) return null;

  try {
    const [ok, stdout] = GLib.spawn_sync(
      null,
      ["ps", "-C", processName, "-o", "rss="],
      null,
      GLib.SpawnFlags.SEARCH_PATH,
      null
    );
    if (!ok || !stdout) return null;

    const text = new TextDecoder().decode(stdout).trim();
    if (text.length === 0) return null;

    let total = 0;
    let parsed = 0;
    for (const line of text.split("\n")) {
      const val = parseInt(line.trim(), 10);
      if (!isNaN(val)) {
        total += val;
        parsed++;
      }
    }
    return parsed > 0 ? total : null;
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
   * REFRESH_INTERVAL_SECONDS seconds.
   */
  _startTimer() {
    this._timeoutId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      REFRESH_INTERVAL_SECONDS,
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
   * Reads the focused application name and total RSS across all its processes,
   * then updates the panel label.
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
    const processName = getProcessNameForPid(pid);

    if (!processName) {
      // Could not resolve process name; show app name without memory
      this._label.set_text(`${truncateName(appName, MAX_APP_NAME_LENGTH)}`);
      this._label.set_style(null);
      return;
    }

    const rssKb = getTotalRssKbForProcessName(processName);

    if (rssKb === null) {
      // Process list query failed or returned no data
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
