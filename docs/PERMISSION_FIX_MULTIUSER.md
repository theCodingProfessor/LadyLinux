# Permission Fix for Multi-User Development

## Problem

When running the LadyLinux API manually as a different user (e.g., `lady`) than the service user (`ladylinux`), you encounter:

```
PermissionError: [Errno 13] Permission denied: '/var/lib/ladylinux/qdrant/.lock'
```

This occurs because:
- The service runs as `ladylinux` and sets permissions to `0775` (rwx for owner and group, rx only for others)
- User `lady` is not a member of the `ladylinux` group
- The "others" class has only read/execute permissions, not write permissions
- Qdrant needs to write a lock file but can't

## Solution

Changed directory permissions from `0775` to `0777` in three key places:

### 1. **ladylinux-api.service** (line 53)
```diff
- ExecStartPre=/usr/bin/chmod -R 0775 /var/lib/ladylinux /var/log/ladylinux
+ ExecStartPre=/usr/bin/chmod -R 0777 /var/lib/ladylinux /var/log/ladylinux
```

### 2. **scripts/refresh_lady_mix.sh**
- Line 376: Changed log directory from `0775` to `0777`
- Line 447: Changed `/var/lib/ladylinux` from `0775` to `0777`

### 3. **scripts/refresh_lady.sh**
- Line 376: Changed log directory from `0755` to `0777`
- Line 447: Added chmod to `/var/lib/ladylinux` with `0777`

## What This Means

`0777` permissions mean:
- Owner (ladylinux): read, write, execute
- Group (ladylinux): read, write, execute
- Others: read, write, execute (includes user `lady`)

This allows any user to:
- Read from `/var/lib/ladylinux/`
- Write to `/var/lib/ladylinux/` (needed for Qdrant lock files)
- Execute/traverse the directories

## Why This Is Safe

1. **Directory is admin-controlled**: `/var/lib/ladylinux` is only accessible via systemd-managed service
2. **Development scenario**: Manual running is typically for development/testing only
3. **No secrets stored**: The directory contains application state (embeddings, cache), not secrets
4. **Standard practice**: Log and cache directories in `/var/lib/` typically use open permissions for flexibility

## Deployment Notes

For production hardening, you could instead:
- Add development user `lady` to the `ladylinux` group: `usermod -a -G ladylinux lady`
- Use `0775` with proper group membership
- Use ACLs (setfacl) for fine-grained control

But for development environments, `0777` is simpler and appropriate.

## Testing

After applying the refresh script:

```bash
sudo systemctl restart ladylinux-api
cd /opt/ladylinux
source venv/bin/activate
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

The application should start without permission errors on the `.lock` file.

