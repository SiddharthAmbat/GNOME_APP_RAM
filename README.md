# Active App RAM – GNOME Shell Extension

Displays the **RAM usage of the currently focused application** in the GNOME top bar panel (right side).

```
Firefox  1200 MB      Code  850 MB      Chrome  1.8 GB
```

---

## Features

* Shows **app name + RSS memory** for the focused window in the top bar.
* Refreshes automatically every **2 seconds**.
* Updates instantly when you **switch windows**.
* Formats memory as **MB** (< 1024 MB) or **GB** (≥ 1024 MB).
* Shows **"No App"** when no window is focused.
* **Turns red** when RAM usage exceeds 2 GB.
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
git clone https://github.com/SiddharthAmbat/GNOME_APP_RAM.git

# Copy the extension to the GNOME extensions directory
mkdir -p ~/.local/share/gnome-shell/extensions/active-app-ram@local
cp metadata.json extension.js stylesheet.css \
   ~/.local/share/gnome-shell/extensions/active-app-ram@local/

# Reload GNOME Shell (X11 only – press Alt+F2, type 'r', press Enter)
# On Wayland, log out and back in.

# Enable the extension
gnome-extensions enable active-app-ram@local
```

### Via GNOME Extensions app

1. Copy the files as above.
2. Open **GNOME Extensions** and toggle **Active App RAM** on.

---

## Project Structure

```
active-app-ram@local/
├── metadata.json    – Extension metadata (UUID, supported shell versions)
├── extension.js     – Main extension logic (ES module)
└── stylesheet.css   – Panel label styling
```

---

## How It Works

1. **Focus detection** – connects to `global.display notify::focus-window` to catch every window switch immediately.
2. **PID lookup** – calls `window.get_pid()` on the focused `MetaWindow`.
3. **Memory reading** – reads `/proc/<pid>/status` and extracts the `VmRSS` field (non-blocking file read via `GLib.file_get_contents`).
4. **Periodic refresh** – a `GLib.timeout_add` callback runs every 2 s to keep the value current even without window switches.
5. **Clean teardown** – `disable()` removes the timeout, disconnects the signal, and destroys the `St.Label`.

---

## License

MIT