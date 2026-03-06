# Active App RAM – GNOME Shell Extension

Displays the **RAM usage of the currently focused application** in the GNOME top bar panel.

```
Firefox  1200 MB      Code  850 MB      Chrome  1.8 GB
```

---

## Features

* Shows **app name + RSS memory** for the focused window in the top bar.
* **Settings panel** – click the indicator and choose "Open Settings" to configure behaviour.
* **Configurable panel position** – left, center, or right.
* **Display toggles** – show/hide app name, app icon, RAM usage, RAM percentage.
* **Memory unit style** – Auto (MB/GB), Always MB, or Always GB.
* **Adjustable refresh interval** – 1–10 seconds (default 2).
* **Compact mode** – smaller font and tighter padding.
* **Colored warning** – label turns red when RAM exceeds a configurable threshold.
* Settings apply **immediately** without restarting GNOME Shell.
* Shows **"No App"** when no window is focused.
* Long application names are **truncated** to keep the bar tidy.

---

## Requirements

| Component | Version |
|-----------|---------|
| GNOME Shell | 45 or 46 |
| GJS | bundled with GNOME Shell |

---

## Installation

### Manual (recommended for development)

```bash
# Clone or download the repository
git clone https://github.com/Dipanshu0919/Active-App-RAM-GNOME.git

# Copy the extension to the GNOME extensions directory
EXT_DIR=~/.local/share/gnome-shell/extensions/active-app-ram@Dipanshu0919
mkdir -p "$EXT_DIR/schemas"
cp metadata.json extension.js prefs.js stylesheet.css "$EXT_DIR/"
cp schemas/*.xml "$EXT_DIR/schemas/"

# Compile the GSettings schema
glib-compile-schemas "$EXT_DIR/schemas/"

# Reload GNOME Shell (X11 only – press Alt+F2, type 'r', press Enter)
# On Wayland, log out and back in.

# Enable the extension
gnome-extensions enable active-app-ram@Dipanshu0919
```

### Via GNOME Extensions app

1. Copy the files as above.
2. Open **GNOME Extensions** and toggle **Active App RAM** on.

---

## Project Structure

```
active-app-ram@Dipanshu0919/
├── metadata.json                                          – Extension metadata
├── extension.js                                           – Main extension logic
├── prefs.js                                               – Preferences / settings UI
├── stylesheet.css                                         – Panel label styling
└── schemas/
    └── org.gnome.shell.extensions.active-app-ram.gschema.xml  – GSettings schema
```

---

## Settings

Open the settings panel by clicking the indicator in the top bar and selecting
**Open Settings**, or from the GNOME Extensions app.

| Category | Setting | Default |
|----------|---------|---------|
| Position | Panel position (left / center / right) | Right |
| Display | Show application name | On |
| Display | Show application icon | Off |
| Display | Show RAM usage | On |
| Display | Show CPU usage *(future)* | Off |
| Display | Show RAM as percentage | Off |
| Formatting | Memory unit (Auto / MB / GB) | Auto |
| Updates | Refresh interval (1–10 s) | 2 s |
| Appearance | Compact mode | Off |
| Appearance | Colored warning | On |
| Appearance | RAM warning threshold | 2.0 GB |

---

## How It Works

1. **Focus detection** – connects to `global.display notify::focus-window` to catch every window switch immediately.
2. **PID lookup** – calls `window.get_pid()` on the focused `MetaWindow`.
3. **Process name resolution** – runs `ps -p PID -o comm=` to get the process name.
4. **Memory reading** – runs `ps -C PROCESSNAME -o rss=` and sums all RSS values.
5. **Periodic refresh** – a `GLib.timeout_add_seconds` callback runs at the configured interval.
6. **Settings** – uses `Gio.Settings` to read preferences; changes are applied immediately via `connect('changed::key')`.
7. **Clean teardown** – `disable()` removes the timeout, disconnects all signals, and destroys the indicator.

---

## License

MIT