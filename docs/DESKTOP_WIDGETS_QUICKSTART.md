# Quick Start: Desktop Widgets for LadyLinux

## What Was Created

✅ **LadyLinux-Start.desktop** - Click to start the system
✅ **LadyLinux-Stop.desktop** - Click to stop the system
✅ **install_desktop_widgets.sh** - Automated installer script
✅ **DESKTOP_WIDGETS_SETUP.md** - Complete setup guide

---

## Quick Installation

### Option 1: Automated (Recommended)

Run the installer script on your Linux Mint machine:

```bash
bash /opt/ladylinux/scripts/install_desktop_widgets.sh
```

That's it! The script will:
- Verify all files exist
- Make scripts executable
- Copy desktop files to ~/Desktop
- Refresh your desktop

### Option 2: Manual

```bash
# 1. Make scripts executable
chmod +x /opt/ladylinux/scripts/run_ll.sh
chmod +x /opt/ladylinux/scripts/system_stop.sh

# 2. Copy desktop files to desktop
cp /opt/ladylinux/scripts/LadyLinux-*.desktop ~/Desktop/

# 3. Make them executable
chmod +x ~/Desktop/LadyLinux-*.desktop

# 4. Refresh desktop
# Press F5 on your desktop, or right-click → Refresh
```

---

## Usage

### Start LadyLinux
- **Double-click** the **LadyLinux Start** icon on your desktop
- Terminal opens showing progress
- Browser automatically opens to `http://localhost:8000`

### Stop LadyLinux
- **Double-click** the **LadyLinux Stop** icon on your desktop
- Terminal shows shutdown progress
- System gracefully shuts down

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Icons don't appear | Press F5 to refresh desktop |
| "Cannot Execute" error | Right-click icon → Properties → Permissions → Allow execution |
| Terminal shows permission error | Run: `chmod +x /opt/ladylinux/scripts/*.sh` |
| Port 8000 in use | Click Stop icon, wait 5 seconds, try Start again |

---

## What's Inside

### LadyLinux-Start.desktop
```ini
[Desktop Entry]
Name=LadyLinux Start
Exec=bash /opt/ladylinux/scripts/run_ll.sh
Icon=system-run
Terminal=true
```

**Does:**
- Activates Python virtual environment
- Starts Uvicorn server on port 8000
- Opens browser to http://localhost:8000
- Runs in background

### LadyLinux-Stop.desktop
```ini
[Desktop Entry]
Name=LadyLinux Stop
Exec=bash /opt/ladylinux/scripts/stop_ll.sh
Icon=system-shutdown
Terminal=true
```

**Does:**
- Finds Uvicorn processes
- Graceful shutdown (SIGTERM)
- Force kill if needed (SIGKILL)
- Confirms completion

---

## File Locations

```
LadyBranch/
├── scripts/
│   ├── run_ll.sh (existing)
│   ├── stop_ll.sh (existing)
│   ├── LadyLinux-Start.desktop (NEW)
│   ├── LadyLinux-Stop.desktop (NEW)
│   └── install_desktop_widgets.sh (NEW)
│
└── docs/
    └── DESKTOP_WIDGETS_SETUP.md (NEW - full guide)
```

On your desktop:
```
~/Desktop/
├── LadyLinux-Start.desktop
└── LadyLinux-Stop.desktop
```

---

## Next Steps

1. **On Linux Mint machine**: Run `bash /opt/ladylinux/scripts/install_desktop_widgets.sh`
2. **Check desktop**: You should see two new icons
3. **Test Start**: Double-click LadyLinux Start
4. **Verify**: Browser opens to http://localhost:8000
5. **Test Stop**: Double-click LadyLinux Stop

---

## Advanced Features

### Auto-Start on Boot
```bash
mkdir -p ~/.config/autostart
cp /opt/ladylinux/scripts/LadyLinux-Start.desktop ~/.config/autostart/
```

### Custom Icons
Right-click desktop icon → Open With Text Editor → Change `Icon=` line → Save

### Create Restart Widget
See `DESKTOP_WIDGETS_SETUP.md` → Advanced section

---

## For More Details

📖 Full documentation: `docs/DESKTOP_WIDGETS_SETUP.md`

---

**Created**: March 31, 2026
**Status**: Ready to use
