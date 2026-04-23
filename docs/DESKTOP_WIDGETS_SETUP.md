# Desktop Widget Setup Guide for LadyLinux

## Overview

Two `.desktop` application files have been created to allow you to start and stop the LadyLinux system directly from your desktop.

**Files created:**
- `LadyLinux-Start.desktop` - Launches the system
- `LadyLinux-Stop.desktop` - Stops the system

---

## Installation Steps

### Step 1: Make Scripts Executable

First, ensure both shell scripts have executable permissions:

```bash
chmod +x /opt/ladylinux/scripts/run_ll.sh
chmod +x /opt/ladylinux/scripts/system_stop.sh
```

### Step 2: Copy Desktop Files to Desktop

Copy the `.desktop` files to your desktop folder:

```bash
cp /opt/ladylinux/scripts/LadyLinux-Start.desktop ~/Desktop/
cp /opt/ladylinux/scripts/LadyLinux-Stop.desktop ~/Desktop/
```

### Step 3: Make Desktop Files Executable

Make the `.desktop` files executable:

```bash
chmod +x ~/Desktop/LadyLinux-Start.desktop
chmod +x ~/Desktop/LadyLinux-Stop.desktop
```

### Step 4: Trust the Applications (Linux Mint)

On Linux Mint, you may need to trust the applications:

```bash
# Allow execution of desktop files
gsettings set org.cinnamon.desktop.default-applications.terminal exec-arg -c
```

Alternatively, you can right-click on the desktop icon and select **"Make Link Executable"** or **"Allow Launching"**.

---

## How to Use

### Launching LadyLinux

1. Double-click the **LadyLinux Start** icon on your desktop
2. A terminal window will open showing the launch output
3. The system will start, and your default browser will open `http://localhost:8000`
4. The terminal will stay open (you can close it after startup is complete)

### Stopping LadyLinux

1. Double-click the **LadyLinux Stop** icon on your desktop
2. A terminal window will open showing the stop process
3. The system will gracefully shut down
4. The terminal will show confirmation when done

---

## What the Scripts Do

### LadyLinux Start (`run_ll.sh`)
- Exports Python path configuration
- Navigates to `/opt/ladylinux`
- Activates Python virtual environment
- Starts Uvicorn server on port 8000
- Opens browser to `http://localhost:8000`

**Key features:**
- Runs in background (`nohup`)
- Non-blocking (you can close the terminal)
- Auto-opens your browser

### LadyLinux Stop (`stop_ll.sh`)
- Finds all Uvicorn processes
- Sends graceful SIGTERM signal
- Waits 2 seconds for graceful shutdown
- Force-kills with SIGKILL if needed
- Confirms completion

**Key features:**
- Safe graceful shutdown first
- Force-kill as fallback
- Works even if multiple instances running

---

## Troubleshooting

### Icons Don't Appear on Desktop

**Problem**: The desktop icons aren't showing after copying

**Solution**:
1. Press `F5` to refresh the desktop
2. Or right-click on desktop → **Refresh**
3. If still not visible, check file permissions:
   ```bash
   ls -la ~/Desktop/LadyLinux-*.desktop
   # Should show: -rwxr-xr-x (or similar with execute bit)
   ```

### "Cannot Execute" Error

**Problem**: Double-clicking shows "Cannot Execute"

**Solution**:
1. Right-click the icon → **Properties**
2. Go to **Permissions** tab
3. Check **Allow this file to run as a program**
4. Click **OK**

### Terminal Opens but Nothing Happens

**Problem**: Terminal appears but script doesn't run

**Solution**:
1. Check if `/opt/ladylinux` exists and contains the project
2. Verify the actual installation path matches the script
3. Edit the `.desktop` file (right-click → **Open With Text Editor**)
4. Update the `Exec=` line with the correct path
5. Save and retry

### "Permission Denied" in Terminal Output

**Problem**: Scripts show permission errors

**Solution**:
```bash
# Make sure scripts are executable
chmod +x /opt/ladylinux/scripts/run_ll.sh
chmod +x /opt/ladylinux/scripts/system_stop.sh

# Make sure desktop files are executable
chmod +x ~/Desktop/LadyLinux-Start.desktop
chmod +x ~/Desktop/LadyLinux-Stop.desktop
```

### Port 8000 Already in Use

**Problem**: Start script runs but can't connect to localhost:8000

**Solution**:
1. Stop any existing instances: Click the **Stop** widget
2. Wait 5 seconds
3. Try Start again
4. If that doesn't work, manually kill the process:
   ```bash
   pkill -f "uvicorn api_layer"
   sleep 2
   # Then try Start widget again
   ```

---

## Customization

### Change the Icons

Edit the `.desktop` files to use different icons:

1. Right-click on the desktop icon → **Open With Text Editor**
2. Find the line: `Icon=system-run` (or `Icon=system-shutdown`)
3. Change to any available icon name:
   - `start` / `media-playback-start` (for Start)
   - `stop` / `media-playback-stop` (for Stop)
   - `system-run`, `system-shutdown`, `dialog-information`, etc.
4. Save the file

Available icons depend on your theme, but you can preview with:
```bash
# List available icons
ls /usr/share/icons/*/48x48/apps/ | head -20
```

### Customize Terminal Behavior

To hide the terminal window after execution, edit the `.desktop` file:

Change from:
```
Terminal=true
```

To:
```
Terminal=false
```

**Note**: If `Terminal=false`, you won't see error messages. Use `Terminal=true` for debugging.

### Add to Auto-start

To automatically start LadyLinux on system boot:

1. Create a symlink in auto-start folder:
   ```bash
   mkdir -p ~/.config/autostart
   cp /opt/ladylinux/scripts/LadyLinux-Start.desktop ~/.config/autostart/
   ```

2. Now LadyLinux will auto-start when you log in

---

## Desktop File Reference

The `.desktop` files follow the freedesktop.org Desktop Entry Specification:

```ini
[Desktop Entry]           # Required section header
Version=1.0               # Desktop file version
Type=Application          # This is an application
Name=LadyLinux Start      # Display name
Comment=...               # Tooltip/description
Exec=bash /opt/...        # Command to execute
Icon=system-run           # Icon to display
Terminal=true             # Show terminal window
Categories=...            # Menu categories
Keywords=...              # Search keywords
```

### Available Properties to Add

```ini
# Display name in other languages
Name[fr]=Démarrage de LadyLinux

# Run with elevated privileges (if needed)
X-Cinnamon-Privileges-Button=true

# Don't show in application menu
NoDisplay=false

# Run in specific working directory
Path=/opt/ladylinux

# Custom environment variables
Environment=DEBUG=0
```

---

## Testing

### Test Start Widget

```bash
# 1. Click the Start widget
# 2. Wait for terminal to appear
# 3. Check for "Launching LadyLinux LLM system..." message
# 4. After 5 seconds, browser should open to http://localhost:8000
# 5. Verify the system is accessible

curl http://localhost:8000
# Should return HTML content
```

### Test Stop Widget

```bash
# 1. Make sure system is running (Start widget first)
# 2. Click the Stop widget
# 3. Check for "Uvicorn: done." message
# 4. Try to access the system:

curl http://localhost:8000
# Should fail with "Connection refused"
```

---

## Integration with File Manager

On Linux Mint, you can also:

1. Open Files → Desktop
2. Right-click in empty space → **Create Link** → choose the `.desktop` file
3. This creates a symbolic link version on the desktop

---

## Advanced: Create Custom Desktop Widgets

### Add a Restart Widget

Create `LadyLinux-Restart.desktop`:

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=LadyLinux Restart
Comment=Stop and then start LadyLinux
Exec=bash -c "bash /opt/ladylinux/scripts/stop_ll.sh; sleep 3; bash /opt/ladylinux/scripts/run_ll.sh"
Icon=view-refresh
Terminal=true
Categories=Utility;System;
```

### Add a Status Check Widget

Create `LadyLinux-Status.desktop`:

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=LadyLinux Status
Comment=Check if system is running
Exec=bash -c "curl -s http://localhost:8000 > /dev/null && echo 'LadyLinux is RUNNING' || echo 'LadyLinux is STOPPED'; sleep 5"
Icon=dialog-information
Terminal=true
Categories=Utility;System;
```

Copy to desktop:
```bash
cp LadyLinux-Status.desktop ~/Desktop/
chmod +x ~/Desktop/LadyLinux-Status.desktop
```

---

## Summary

✅ **Two desktop widgets created:**
- `LadyLinux-Start.desktop` → Start the system
- `LadyLinux-Stop.desktop` → Stop the system

✅ **Installation:**
1. Copy to `~/Desktop/`
2. Make executable: `chmod +x ~/Desktop/LadyLinux-*.desktop`
3. Double-click to use

✅ **Features:**
- Visual desktop icons
- Terminal output for debugging
- Works on Linux Mint
- Easily customizable
- Can be added to auto-start

---

## Next Steps

1. ✅ Run installation steps above
2. ✅ Test Start widget
3. ✅ Test Stop widget
4. ✅ Customize icons if desired
5. ✅ (Optional) Create additional widgets like Restart or Status

For help or issues, check the **Troubleshooting** section above.
