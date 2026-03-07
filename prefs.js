/**
 * Active App RAM – Preferences UI
 *
 * Opens when users click "Preferences" from the GNOME Extensions app.
 * Allows configuring position, display, formatting, update interval,
 * and appearance settings.
 *
 * Compatible with GNOME Shell 45 and 46.
 */

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import {
  ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class ActiveAppRamPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // ── Position page ──────────────────────────────────────────────────────
    const positionPage = new Adw.PreferencesPage({
      title: "Position",
      icon_name: "view-grid-symbolic",
    });
    window.add(positionPage);

    const positionGroup = new Adw.PreferencesGroup({
      title: "Panel Position",
      description: "Choose where the indicator appears in the top bar.",
    });
    positionPage.add(positionGroup);

    const positionRow = new Adw.ComboRow({
      title: "Position",
      subtitle: "Location of the indicator in the panel",
      model: new Gtk.StringList({ strings: ["Left", "Center", "Right"] }),
    });
    positionRow.set_selected(settings.get_enum("panel-position"));
    positionRow.connect("notify::selected", () => {
      settings.set_enum("panel-position", positionRow.get_selected());
    });
    positionGroup.add(positionRow);

    const offsetRow = new Adw.SpinRow({
      title: "Position Offset",
      subtitle: "Shift position within the panel box (+1 right, -1 left)",
      adjustment: new Gtk.Adjustment({
        lower: -20,
        upper: 20,
        step_increment: 1,
        page_increment: 1,
        value: settings.get_int("panel-position-offset"),
      }),
    });
    settings.bind("panel-position-offset", offsetRow, "value", Gio.SettingsBindFlags.DEFAULT);
    positionGroup.add(offsetRow);

    // ── Display page ───────────────────────────────────────────────────────
    const displayPage = new Adw.PreferencesPage({
      title: "Display",
      icon_name: "preferences-desktop-display-symbolic",
    });
    window.add(displayPage);

    const displayGroup = new Adw.PreferencesGroup({
      title: "Display Settings",
      description: "Choose what information the indicator shows.",
    });
    displayPage.add(displayGroup);

    this._addSwitchRow(
      displayGroup, settings, "show-app-name",
      "Show Application Name",
      "Display the name of the focused application"
    );

    this._addSwitchRow(
      displayGroup, settings, "show-ram-usage",
      "Show RAM Usage",
      "Display the RAM usage value"
    );

    this._addSwitchRow(
      displayGroup, settings, "show-cpu-usage",
      "Show CPU Usage",
      "Display the CPU usage percentage of the focused application"
    );

    this._addSwitchRow(
      displayGroup, settings, "show-ram-percentage",
      "Show RAM as Percentage",
      "Display RAM usage as a percentage of total system memory"
    );

    // ── Formatting page ────────────────────────────────────────────────────
    const formattingPage = new Adw.PreferencesPage({
      title: "Formatting",
      icon_name: "font-x-generic-symbolic",
    });
    window.add(formattingPage);

    const formattingGroup = new Adw.PreferencesGroup({
      title: "Memory Unit Style",
      description: "Choose how memory values are formatted.",
    });
    formattingPage.add(formattingGroup);

    const unitRow = new Adw.ComboRow({
      title: "Memory Unit",
      subtitle: "Auto will show MB or GB depending on size",
      model: new Gtk.StringList({
        strings: ["Auto (MB / GB)", "Always MB", "Always GB"],
      }),
    });
    unitRow.set_selected(settings.get_enum("memory-unit"));
    unitRow.connect("notify::selected", () => {
      settings.set_enum("memory-unit", unitRow.get_selected());
    });
    formattingGroup.add(unitRow);

    const separatorRow = new Adw.ComboRow({
      title: "Separator Style",
      subtitle: "Character used between display elements",
      model: new Gtk.StringList({
      strings: ["Space (Brave 1.6 GB)", "Bullet (Brave • 1.6 GB)", "Pipe (Brave | 1.6 GB)"],
      }),
    });
    separatorRow.set_selected(settings.get_enum("separator-style"));
    separatorRow.connect("notify::selected", () => {
      settings.set_enum("separator-style", separatorRow.get_selected());
    });
    formattingGroup.add(separatorRow);

    // ── Update page ────────────────────────────────────────────────────────
    const updatePage = new Adw.PreferencesPage({
      title: "Updates",
      icon_name: "emblem-synchronizing-symbolic",
    });
    window.add(updatePage);

    const updateGroup = new Adw.PreferencesGroup({
      title: "Refresh Interval",
      description: "How often the indicator refreshes data.",
    });
    updatePage.add(updateGroup);

    const intervalRow = new Adw.SpinRow({
      title: "Refresh Interval (seconds)",
      subtitle: "Range: 1–10 seconds",
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 10,
        step_increment: 1,
        page_increment: 1,
        value: settings.get_int("refresh-interval"),
      }),
    });
    settings.bind(
      "refresh-interval",
      intervalRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    updateGroup.add(intervalRow);

    // ── Appearance page ────────────────────────────────────────────────────
    const appearancePage = new Adw.PreferencesPage({
      title: "Appearance",
      icon_name: "applications-graphics-symbolic",
    });
    window.add(appearancePage);

    const appearanceGroup = new Adw.PreferencesGroup({
      title: "Appearance Settings",
      description: "Adjust the look and feel of the indicator.",
    });
    appearancePage.add(appearanceGroup);

    this._addSwitchRow(
      appearanceGroup, settings, "compact-mode",
      "Compact Mode",
      "Use a more compact display with less padding"
    );

    this._addSwitchRow(
      appearanceGroup, settings, "colored-warning",
      "Colored Warning",
      "Turn the label red when RAM exceeds threshold"
    );

    const thresholdRow = new Adw.SpinRow({
      title: "RAM Warning Threshold (GB)",
      subtitle: "The RAM usage level that triggers a colored warning",
      digits: 1,
      adjustment: new Gtk.Adjustment({
        lower: 0.5,
        upper: 64.0,
        step_increment: 0.5,
        page_increment: 1.0,
        value: settings.get_double("ram-warning-threshold"),
      }),
    });
    settings.bind(
      "ram-warning-threshold",
      thresholdRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    appearanceGroup.add(thresholdRow);
  }

  /**
   * Helper: creates a switch row bound to a boolean GSettings key.
   */
  _addSwitchRow(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
  }
}
