#!/usr/bin/env bash
# Artimis Agent — One-command installer
#
# Install:
#   curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash
#
# Install with systemd (VPS):
#   curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash -s -- --service
#
# What it does:
#   - Clones repo into ~/.artimis/agent/
#   - Creates Python venv and installs deps
#   - Pre-built Web UI included (no Node.js needed)
#   - Creates ~/.artimis/.env template
#   - Optional: installs systemd service for persistent running

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_SERVICE=false
for arg in "$@"; do
    case "$arg" in
        --service) INSTALL_SERVICE=true ;;
    esac
done

echo -e "${BLUE}"
echo "    █████╗ ██████╗ ████████╗██╗███╗   ███╗██╗███████╗"
echo "   ██╔══██╗██╔══██╗╚══██╔══╝██║████╗ ████║██║██╔════╝"
echo "   ███████║██████╔╝   ██║   ██║██╔████╔██║██║███████╗"
echo "   ██╔══██║██╔══██╗   ██║   ██║██║╚██╔╝██║██║╚════██║"
echo "   ██║  ██║██║  ██║   ██║   ██║██║ ╚═╝ ██║██║███████║"
echo "   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝╚═╝     ╚═╝╚═╝╚══════╝"
echo -e "${NC}"
echo "  Your private AI workspace. Runs on your machine."
echo ""

INSTALL_DIR="$HOME/.artimis"
REPO_URL="https://github.com/pramuk-ratanov/Artimis-agent.git"

# ─── Check prerequisites ──────────────────────────────────

if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Python 3.11+ is required. Installing...${NC}"
    if command -v apt &>/dev/null; then
        sudo apt update -qq && sudo apt install -y python3 python3-pip python3-venv
    elif command -v yum &>/dev/null; then
        sudo yum install -y python3 python3-pip
    else
        echo -e "${RED}Could not install Python automatically. Install it manually.${NC}"
        exit 1
    fi
fi

# Check venv module
if ! python3 -m venv --help &>/dev/null 2>&1; then
    echo -e "${YELLOW}[warn]${NC} python3-venv not found. Installing..."
    if command -v apt &>/dev/null; then
        sudo apt update -qq && sudo apt install -y "python${PYTHON_VERSION}-venv"
    else
        echo -e "${RED}Please install python3-venv manually and re-run.${NC}"
        exit 1
    fi
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo -e "${GREEN}[ok]${NC} Python $PYTHON_VERSION"

if ! command -v git &>/dev/null; then
    echo -e "${YELLOW}[warn]${NC} git not found. Will download via curl instead."
    USE_GIT=false
else
    USE_GIT=true
    echo -e "${GREEN}[ok]${NC} git"
fi

# ─── Download Artimis ─────────────────────────────────────

mkdir -p "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/agent" ]; then
    echo ""
    echo -e "${YELLOW}Existing installation found at $INSTALL_DIR/agent${NC}"
    echo "  To reinstall, remove it first: rm -rf $INSTALL_DIR/agent"
    echo "  Or run the update command: cd $INSTALL_DIR/agent && git pull"
    echo ""
    echo "  Your data (memories, skills, .env) is preserved."
    exit 0
fi

echo ""
echo "Downloading Artimis..."

if [ "$USE_GIT" = true ]; then
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/agent" 2>/dev/null || {
        echo -e "${RED}Could not clone repository.${NC}"
        echo "  Check your internet connection and try again."
        exit 1
    }
else
    # Fallback: download tarball
    TARBALL_URL="https://github.com/pramuk-ratanov/Artimis-agent/archive/refs/heads/main.tar.gz"
    TMP_DIR=$(mktemp -d)
    curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/artimis.tar.gz" || {
        echo -e "${RED}Could not download Artimis.${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    }
    tar -xzf "$TMP_DIR/artimis.tar.gz" -C "$TMP_DIR"
    mv "$TMP_DIR/Artimis-agent-main" "$INSTALL_DIR/agent"
    rm -rf "$TMP_DIR"
fi

echo -e "${GREEN}[ok]${NC} Downloaded"

# ─── Set up Python environment ────────────────────────────

cd "$INSTALL_DIR/agent"

echo "Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing dependencies..."
pip install -q --upgrade pip 2>/dev/null
pip install -q fastapi uvicorn pydantic openai 2>/dev/null

echo -e "${GREEN}[ok]${NC} Dependencies installed"

# ─── Create data directories ──────────────────────────────

mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/skills"
mkdir -p "$INSTALL_DIR/models"
mkdir -p "$INSTALL_DIR/gallery"

# ─── .env template ────────────────────────────────────────

if [ ! -f "$INSTALL_DIR/.env" ]; then
    cat > "$INSTALL_DIR/.env" << 'ENVEOF'
# Artimis Agent — API Keys
# Uncomment and add your keys. At least one is required.

# DeepSeek (recommended — cheap, fast, capable)
DEEPSEEK_API_KEY=***

# OpenAI
# OPENAI_API_KEY=***

# Anthropic (via OpenRouter)
# ANTHROPIC_API_KEY=***

# Override default model
# ARTIMIS_MODEL=deepseek-v4-pro
ENVEOF
    echo -e "${GREEN}[ok]${NC} Created .env template at $INSTALL_DIR/.env"
    echo -e "  ${YELLOW}IMPORTANT: Edit $INSTALL_DIR/.env and add your API key before starting.${NC}"
fi

# ─── Systemd service (VPS) ────────────────────────────────

if [ "$INSTALL_SERVICE" = true ]; then
    echo ""
    echo "Installing systemd service..."

    SERVICE_FILE="/etc/systemd/system/artimis.service"

    if [ -f "$INSTALL_DIR/agent/artimis.service" ]; then
        sudo cp "$INSTALL_DIR/agent/artimis.service" "$SERVICE_FILE" || {
            echo -e "${RED}Could not install systemd service (need sudo).${NC}"
            echo "  Run manually: sudo cp $INSTALL_DIR/agent/artimis.service $SERVICE_FILE"
        }
        sudo systemctl daemon-reload
        sudo systemctl enable artimis
        echo -e "${GREEN}[ok]${NC} Systemd service installed"
        echo ""
        echo "  Commands:"
        echo "    sudo systemctl start artimis    # Start now"
        echo "    sudo systemctl status artimis   # Check status"
        echo "    sudo systemctl stop artimis     # Stop"
        echo "    journalctl -u artimis -f        # View logs"
    else
        echo -e "${RED}Service file not found.${NC}"
    fi
fi

# ─── Done ─────────────────────────────────────────────────

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Artimis installed!${NC}"
echo ""
echo "  Before starting, add your API key:"
echo -e "    ${BLUE}nano $INSTALL_DIR/.env${NC}"
echo ""
echo "  Start the Web UI:"
echo -e "    ${BLUE}cd $INSTALL_DIR/agent && venv/bin/python run.py${NC}"
echo ""
echo "  Or terminal REPL mode:"
echo -e "    ${BLUE}cd $INSTALL_DIR/agent && venv/bin/python run.py --cli${NC}"
echo ""
echo "  Then open:"
echo -e "    ${BLUE}http://localhost:7001${NC}"
echo ""

if [ "$INSTALL_SERVICE" = true ]; then
    echo "  Or start via systemd (runs in background):"
    echo -e "    ${BLUE}sudo systemctl start artimis${NC}"
    echo ""
fi

echo "  To uninstall:"
echo -e "    ${BLUE}bash $INSTALL_DIR/agent/uninstall.sh${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
