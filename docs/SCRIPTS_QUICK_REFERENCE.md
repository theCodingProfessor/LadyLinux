# LadyLinux Scripts Quick Reference

## Installation (First Time)

### Fresh Ubuntu System
```bash
cd ~/LadyLinux
sudo ./scripts/current_ladylinuxinstall.sh
```

**What it does:**
1. Updates all system packages
2. Configures DNS for reliability
3. Installs git, python3.12, curl, systemd
4. Clones repository from `Capstone_Dev_01` branch
5. Installs and starts Ollama
6. Downloads Mistral LLM model (~4GB)
7. Creates `ladylinux` service user
8. Sets up Python venv with all dependencies
9. Displays next steps

**Time:** ~10-15 minutes (first run) / ~2-3 minutes (already installed)

### With Custom Branch
```bash
LADYLINUX_BRANCH=main sudo ./scripts/current_ladylinuxinstall.sh
```

---

## Updates (Existing System)

### Quick Refresh
```bash
sudo ./scripts/refresh_vm.sh
```

**What it does:**
1. Stops the LadyLinux API service
2. Fetches latest code from `Capstone_Dev_01`
3. Checks if dependencies changed
4. Rebuilds venv only if needed
5. Restarts service
6. Shows status

**Time:** ~30 seconds (no changes) / ~2 minutes (if venv rebuilt)

### Refresh from Different Branch
```bash
sudo ./scripts/refresh_vm.sh main
```

### Force Complete Rebuild
```bash
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
```

---

## Service Management

### Check Status
```bash
systemctl status ladylinux-api.service
journalctl -u ladylinux-api.service -f
```

### Manual Start/Stop
```bash
sudo systemctl stop ladylinux-api.service
sudo systemctl start ladylinux-api.service
sudo systemctl restart ladylinux-api.service
```

### Enable/Disable at Boot
```bash
sudo systemctl enable ladylinux-api.service
sudo systemctl disable ladylinux-api.service
```

---

## Repository Information

### Current State
```bash
cd /opt/ladylinux
git branch -v          # Show current branch
git log --oneline -5   # Show recent commits
git status             # Show local changes
```

### Switch Branches
```bash
sudo ./scripts/refresh_vm.sh Capstone_Dev_01
sudo ./scripts/refresh_vm.sh main
```

---

## Python Environment

### Check Installed Packages
```bash
/opt/ladylinux/venv/bin/pip list
```

### Test API Import
```bash
sudo -u ladylinux /opt/ladylinux/venv/bin/python -c "from api_layer import app; print('✓ API OK')"
```

### Test RAG Layer
```bash
sudo -u ladylinux /opt/ladylinux/venv/bin/python -c "from rag_layer import retrieve; print('✓ RAG OK')"
```

### Activate Venv Manually
```bash
source /opt/ladylinux/venv/bin/activate
pip list
```

---

## Ollama/Mistral

### Check Ollama Status
```bash
systemctl status ollama
ollama list              # Show downloaded models
```

### Pull/Update Models
```bash
ollama pull mistral      # Download/update Mistral
ollama pull neural-chat  # Download alternative model
```

### Test Ollama
```bash
curl http://localhost:11434/api/tags
ollama run mistral       # Interactive chat
```

---

## Logs and Troubleshooting

### API Service Logs
```bash
# Last 50 lines
journalctl -u ladylinux-api.service -n 50

# Follow in real-time
journalctl -u ladylinux-api.service -f

# With timestamps and details
journalctl -u ladylinux-api.service --no-pager -o short-precise
```

### System Package Logs
```bash
tail -20 /var/log/apt/apt.log
```

### Repository Status
```bash
cd /opt/ladylinux && git status
cd /opt/ladylinux && git log --oneline -10
```

---

## Common Tasks

### Verify Installation
```bash
# Check all components
echo "=== Git ===" && git --version
echo "=== Python ===" && python3.12 --version
echo "=== Ollama ===" && ollama --version
echo "=== Service ===" && systemctl is-active ladylinux-api.service
echo "=== API ===" && sudo -u ladylinux /opt/ladylinux/venv/bin/python -c "from api_layer import app; print('✓')"
```

### Update Just Dependencies
```bash
sudo -u ladylinux /opt/ladylinux/venv/bin/pip install -r /opt/ladylinux/requirements.txt --upgrade
```

### Rebuild Virtual Environment Only
```bash
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
```

### Clean Git State
```bash
cd /opt/ladylinux
sudo git fetch origin
sudo git reset --hard origin/Capstone_Dev_01
sudo git clean -fd
```

---

## Directory Structure

```
/opt/ladylinux/
├── app                      # Application code
│   ├── api_layer/          # FastAPI application
│   ├── rag_layer/          # Vector search & retrieval
│   ├── templates/          # HTML templates
│   ├── static/             # CSS, JS files
│   ├── requirements.txt     # Python dependencies
│   └── .git/               # Git repository
├── venv/                   # Python virtual environment
└── scripts/
    ├── current_ladylinuxinstall.sh
    ├── refresh_vm.sh
    └── ...other scripts...

/var/lib/ladylinux/
├── data/                   # Persistent application data
├── cache/                  # Temporary cache files
└── logs/                   # Application logs

/etc/ladylinux/
└── ladylinux.env          # Environment variables
```

---

## Environment Variables

### For Installation Script
```bash
LADYLINUX_BRANCH=main sudo ./scripts/current_ladylinuxinstall.sh
```

### For Refresh Script
```bash
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
```

### In System Configuration
```bash
# /etc/ladylinux/ladylinux.env
LADYLINUX_HOST=0.0.0.0
LADYLINUX_PORT=8000
```

---

## Web Interface

### Access URL
- **Local:** `http://localhost:8000`
- **Network:** `http://<server-ip>:8000`
- **Domain:** `https://ladylinux.example.com` (if configured)

### API Endpoints
- `GET /` - Main interface
- `GET /firewall` - Firewall management
- `GET /os` - OS information
- `GET /users` - User management
- `POST /ask_rag` - RAG-augmented LLM queries

---

## Emergency Procedures

### If Service Won't Start
```bash
# Check logs
journalctl -u ladylinux-api.service -n 20

# Try manual start
cd /opt/ladylinux
./venv/bin/python -m api_layer.app

# If import fails
./venv/bin/python -c "from api_layer import app" 2>&1
```

### If Python Environment Corrupted
```bash
# Rebuild everything
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
```

### If Repository in Bad State
```bash
cd /opt/ladylinux
sudo git fetch origin
sudo git reset --hard origin/Capstone_Dev_01
sudo git clean -fd
sudo ./scripts/refresh_vm.sh
```

### If Ollama/Mistral Issues
```bash
# Restart Ollama
sudo systemctl restart ollama

# Check it's responsive
curl http://localhost:11434/api/tags

# Pull Mistral again
ollama pull mistral
```

---

## Performance Tips

### Faster Updates
```bash
# Skip venv rebuild if you know deps didn't change
sudo ./scripts/refresh_vm.sh
```

### Faster Initial Install
- Start installation at off-peak times (downloads are large)
- First Mistral pull is ~4GB and takes 10+ minutes

### Monitoring
```bash
# Watch service in real-time
watch -n 1 'systemctl status ladylinux-api.service'

# Monitor logs while testing
journalctl -u ladylinux-api.service -f &
```

---

## Support Resources

### Documentation
- Installation details: `docs/SCRIPTS_INSTALLATION_AND_REFRESH.md`
- Deployment info: `docs/deployment.md`
- Architecture: `ARCHITECTURE.md`

### Debugging
- Check `docs/SCRIPTS_INSTALLATION_AND_REFRESH.md` troubleshooting section
- Review service logs: `journalctl -u ladylinux-api.service`
- Test imports manually in venv Python REPL

### Issues?
1. Check logs: `journalctl -u ladylinux-api.service`
2. Verify branch: `cd /opt/ladylinux && git branch -v`
3. Test imports: `/opt/ladylinux/venv/bin/python -c "from api_layer import app"`
4. Try refresh: `sudo ./scripts/refresh_vm.sh`


