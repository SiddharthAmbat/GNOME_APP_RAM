/**
 * Active App RAM – GNOME Shell Extension
 *
 * Displays the RAM usage of the currently focused application
 * in the GNOME top bar panel.
 *
 * Compatible with GNOME Shell 45 and 46.
 */

import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import {
  Extension,
} from "resource:///org/gnome/shell/extensions/extension.js";

// Maximum characters for the application name before truncation
const MAX_APP_NAME_LENGTH = 20;

// Panel box names keyed by the GSettings enum value
const PANEL_BOXES = ["left", "center", "right"];

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
 * Returns the total physical memory (in kilobytes) by reading /proc/meminfo.
 *
 * @returns {number|null} Total memory in kilobytes, or null if unavailable.
 */
function getTotalMemoryKb() {
  try {
    const [ok, contents] = GLib.file_get_contents("/proc/meminfo");
    if (!ok || !contents) return null;

    const text = new TextDecoder().decode(contents);
    const match = text.match(/MemTotal:\s+(\d+)\s+kB/);
    if (match) return parseInt(match[1], 10);
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Formats a kilobyte value according to the selected memory unit style.
 *
 *   unit 0 (auto): < 1024 MB → "NNN MB", ≥ 1024 MB → "N.N GB"
 *   unit 1 (mb):   always "NNN MB"
 *   unit 2 (gb):   always "N.N GB"
 *
 * @param {number} kb - Memory size in kilobytes.
 * @param {number} unit - Memory unit enum value (0=auto, 1=mb, 2=gb).
 * @returns {string} Human-readable memory string.
 */
function formatMemory(kb, unit) {
  const mb = kb / 1024;

  if (unit === 1) {
    return `${Math.round(mb)} MB`;
  }
  if (unit === 2) {
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  }
  // Auto
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

export default class ActiveAppRamExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._indicator = null;
    this._label = null;
    this._timeoutId = null;
    this._focusSignalId = null;
    this._settings = null;
    this._settingsChangedIds = [];
    this._totalMemoryKb = null;
  }

  /**
   * Called by GNOME Shell when the extension is enabled.
   * Creates the panel button, connects signals, and starts the refresh loop.
   */
  enable() {
    this._settings = this.getSettings();
    this._totalMemoryKb = getTotalMemoryKb();

    // Create a PanelMenu.Button indicator
    this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

    // Create the label widget inside the button
    this._label = new St.Label({
      text: "…",
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "active-app-ram-label",
    });
    this._indicator.add_child(this._label);

    // Add a single menu item: "Open Settings"
    const settingsItem = new PopupMenu.PopupMenuItem("Open Settings");
    settingsItem.connect("activate", () => {
      this.openPreferences();
    });
    this._indicator.menu.addMenuItem(settingsItem);

    // Insert the indicator into the configured panel position
    this._addToPanel();

    // Apply compact mode styling
    this._applyCompactMode();

    // Listen for settings changes and react immediately
    const watchedKeys = [
      "panel-position",
      "show-app-name",
      "show-app-icon",
      "show-ram-usage",
      "show-cpu-usage",
      "show-ram-percentage",
      "memory-unit",
      "refresh-interval",
      "compact-mode",
      "colored-warning",
      "ram-warning-threshold",
    ];
    for (const key of watchedKeys) {
      const id = this._settings.connect(`changed::${key}`, () => {
        this._onSettingChanged(key);
      });
      this._settingsChangedIds.push(id);
    }

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

    // Disconnect all settings signals
    if (this._settings) {
      for (const id of this._settingsChangedIds) {
        this._settings.disconnect(id);
      }
      this._settingsChangedIds = [];
      this._settings = null;
    }

    if (this._indicator !== null) {
      this._indicator.destroy();
      this._indicator = null;
      this._label = null;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Adds the indicator to the correct panel box based on settings.
   */
  _addToPanel() {
    const position = this._settings.get_enum("panel-position");
    const box = PANEL_BOXES[position] ?? "right";
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 0, box);
  }

  /**
   * Removes and re-adds the indicator when the panel position changes.
   */
  _repositionIndicator() {
    if (!this._indicator) return;

    // Remove from current parent
    const parent = this._indicator.get_parent();
    if (parent) parent.remove_child(this._indicator);

    // Re-insert at new position
    const position = this._settings.get_enum("panel-position");
    const box = PANEL_BOXES[position] ?? "right";

    // The container corresponding to the box name
    const container = Main.panel.statusArea;
    // Remove from statusArea tracking to allow re-add
    if (container[this.metadata.uuid]) {
      delete container[this.metadata.uuid];
    }

    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 0, box);
  }

  /**
   * Applies or removes compact mode styling on the label.
   */
  _applyCompactMode() {
    if (!this._label) return;
    const compact = this._settings.get_boolean("compact-mode");
    if (compact) {
      this._label.add_style_class_name("active-app-ram-compact");
    } else {
      this._label.remove_style_class_name("active-app-ram-compact");
    }
  }

  /**
   * Handles a settings change: repositions, restarts timers, or updates
   * the label as appropriate.
   */
  _onSettingChanged(key) {
    switch (key) {
      case "panel-position":
        this._repositionIndicator();
        break;
      case "refresh-interval":
        this._stopTimer();
        this._startTimer();
        break;
      case "compact-mode":
        this._applyCompactMode();
        break;
      default:
        break;
    }
    // Always refresh the label text after any settings change
    this._update();
  }

  /**
   * Starts the GLib periodic timeout that refreshes the label.
   */
  _startTimer() {
    const interval = this._settings.get_int("refresh-interval");
    this._timeoutId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      interval,
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
   * then updates the panel label according to the current settings.
   */
  _update() {
    if (!this._label || !this._settings) return;

    const info = getFocusedAppInfo();

    if (!info) {
      this._label.set_text("No App");
      this._label.set_style(null);
      return;
    }

    const showAppName = this._settings.get_boolean("show-app-name");
    const showAppIcon = this._settings.get_boolean("show-app-icon");
    const showRamUsage = this._settings.get_boolean("show-ram-usage");
    const showRamPct = this._settings.get_boolean("show-ram-percentage");
    const memoryUnit = this._settings.get_enum("memory-unit");
    const coloredWarning = this._settings.get_boolean("colored-warning");
    const warningThresholdGb = this._settings.get_double(
      "ram-warning-threshold"
    );

    const { appName, pid } = info;
    const processName = getProcessNameForPid(pid);
    const displayName = truncateName(appName, MAX_APP_NAME_LENGTH);

    // Build the label text
    const parts = [];

    // Icon (simple emoji stand-in; real icon support would need St.Icon)
    if (showAppIcon) {
      parts.push("🖥️");
    }

    // Application name
    if (showAppName) {
      parts.push(displayName);
    }

    // RAM usage
    let rssKb = null;
    if (processName && (showRamUsage || showRamPct)) {
      rssKb = getTotalRssKbForProcessName(processName);
    }

    if (rssKb !== null && showRamUsage) {
      parts.push(formatMemory(rssKb, memoryUnit));
    }

    if (rssKb !== null && showRamPct && this._totalMemoryKb) {
      const pct = ((rssKb / this._totalMemoryKb) * 100).toFixed(1);
      parts.push(`(${pct}%)`);
    }

    // Fall back if nothing is enabled
    const text = parts.length > 0 ? parts.join("  ") : displayName;
    this._label.set_text(text);

    // Colored warning when RAM exceeds threshold
    const mb = rssKb !== null ? rssKb / 1024 : 0;
    const thresholdMb = warningThresholdGb * 1024;
    if (coloredWarning && mb > thresholdMb) {
      this._label.set_style("color: #ff4444;");
    } else {
      this._label.set_style(null);
    }
  }
}
