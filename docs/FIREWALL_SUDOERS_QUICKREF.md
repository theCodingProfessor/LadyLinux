# LadyLinux Firewall Sudoers: Quick Reference

## Install & Deploy (One Command)
```bash
sudo ./scripts/install_ladylinux.sh --clone --branch main
```

This automatically:
- ✅ Creates `/var/log/ladylinux/` directory
- ✅ Installs `/etc/sudoers.d/ladylinux-firewall` (passwordless sudoers)
- ✅ Sets up Python logging to `/var/log/ladylinux/ladylinux.log`
- ✅ Validates sudoers syntax with `visudo -c`

## Start Service
```bash
sudo systemctl start ladylinux-api.service
```

## Monitor Logs
```bash
# Python application logs (vectorization, retrieval, etc.)
tail -f /var/log/ladylinux/ladylinux.log

# Systemd journal
journalctl -u ladylinux-api.service -f

# Sudo audit trail (who ran firewall commands)
sudo grep sudo /var/log/auth.log | grep ladylinux
```

## Test Firewall Query
```bash
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the settings for my firewall?",
    "domain": "firewall"
  }'
```

Expected: LLM response grounded in actual firewall state from vector store.

## Verify Sudoers Rule
```bash
sudo cat /etc/sudoers.d/ladylinux-firewall
# Should show: ladylinux ALL=(ALL) NOPASSWD: /usr/sbin/ufw, ...
```

## Architecture in 30 Seconds

1. **User asks** "What are your firewall settings?" at `/firewall` page
2. **Service queries firewall** as root via `sudo ufw status verbose` (no password prompt)
3. **Snapshot is vectorized** into 3–4 RAG documents and embedded in Qdrant
4. **LLM is queried** with vector evidence + live snapshot as context
5. **Response is grounded** in actual system state, not generic advice

## Key Files

| File | Purpose |
|------|---------|
| `ladylinux-firewall.sudoers` | Sudoers rule (installed to `/etc/sudoers.d/`) |
| `api_layer/firewall_core.py` | Firewall data collection (now with `sudo` prepend) |
| `api_layer/app.py` | Python logging setup (writes to `/var/log/ladylinux/`) |
| `scripts/install_ladylinux.sh` | Installer (sets up sudoers, log dir, validates) |
| `ladylinux-api.service` | Systemd service (ensures log dir on startup) |
| `docs/SUDOERS_IMPLEMENTATION.md` | Full implementation guide |

## Troubleshooting

**Firewall commands return "permission denied"?**
```bash
sudo visudo -c -f /etc/sudoers.d/ladylinux-firewall
# Must return: parsed OK
```

**No log output?**
```bash
ls -la /var/log/ladylinux/ladylinux.log
# If missing, systemd will create on next service start
```

**Want to test sudoers directly?**
```bash
sudo -u ladylinux sudo ufw status verbose
# Should work without password prompt
```

## Why Passwordless Sudo is Safe Here

✅ **Narrowly scoped**: Only firewall commands (ufw, iptables, nftables)  
✅ **Read-only**: Status queries don't modify system state  
✅ **Audited**: All sudo calls logged to `/var/log/auth.log`  
✅ **Limited user**: `ladylinux` has no shell (`/usr/sbin/nologin`)  
✅ **Non-interactive**: Can't be abused via SSH or TTY  

## Next Steps

1. Deploy: `sudo ./scripts/install_ladylinux.sh --clone --branch main`
2. Start: `sudo systemctl start ladylinux-api.service`
3. Test: Visit `http://localhost:8000/firewall` and ask about settings
4. Monitor: `tail -f /var/log/ladylinux/ladylinux.log`

---

**More info**: See `docs/SUDOERS_IMPLEMENTATION.md` or `SUDOERS_CHECKLIST.md`

