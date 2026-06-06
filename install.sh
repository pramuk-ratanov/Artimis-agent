#!/usr/bin/env bash
# Artimis Agent — One-command installer
# curl -fsSL https://your-domain.com/install.sh | bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

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
REPO_URL="https://github.com/your-org/artimis-agent.git"

# Check Python
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Python 3.11+ is required. Install it first:${NC}"
    echo "  Ubuntu: sudo apt install python3 python3-pip python3-venv"
    echo "  macOS:  brew install python@3.11"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo -e "${GREEN}Python $PYTHON_VERSION found.${NC}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Clone or update
if [ -d "$INSTALL_DIR/agent" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR/agent"
    git pull --quiet 2>/dev/null || echo "  (running from local copy, skipping git pull)"
else
    echo "Downloading Artimis..."
    if [ -f "./artimis/api/server.py" ]; then
        # Running from local directory
        cp -r . "$INSTALL_DIR/agent"
        echo "  (installed from local copy)"
    else
        git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/agent" 2>/dev/null || {
            echo -e "${RED}Could not download Artimis.${NC}"
            echo "  If running from a local copy, run:"
            echo "  cd /path/to/artimis-agent && bash install.sh"
            exit 1
        }
    fi
fi

cd "$INSTALL_DIR/agent"

# Set up virtual environment
if [ ! -d "venv" ]; then
    echo "Setting up Python environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q fastapi uvicorn pydantic openai 2>/dev/null

# Create data directories
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/skills"
mkdir -p "$INSTALL_DIR/models"
mkdir -p "$INSTALL_DIR/gallery"

# Create .env template if not exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cat > "$INSTALL_DIR/.env" << 'EOF'
# Artimis Agent — API Keys
# Uncomment and add your keys.

# DeepSeek (recommended for starters — cheap, fast, capable)
# DEEPSEEK_API_KEY=sk-...

# OpenAI
# OPENAI_API_KEY=sk-...

# Anthropic (via OpenRouter)
# ANTHROPIC_API_KEY=sk-...

# Override default model
# ARTIMIS_MODEL=deepseek-v4-pro
EOF
    echo -e "${GREEN}.env template created at $INSTALL_DIR/.env${NC}"
fi

# Create launch script
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/usr/bin/env bash
cd "$HOME/.artimis/agent"
source venv/bin/activate
python run.py
EOF
chmod +x "$INSTALL_DIR/start.sh"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Artimis installed!${NC}"
echo ""
echo "  To start:"
echo -e "    ${BLUE}$INSTALL_DIR/start.sh${NC}"
echo ""
echo "  Then open:"
echo -e "    ${BLUE}http://localhost:7001${NC}"
echo ""
echo "  Before first use, add your API key:"
echo -e "    ${BLUE}$INSTALL_DIR/.env${NC}"
echo ""
echo "  Or run with a local model (no API key needed):"
echo "    curl -fsSL https://ollama.com/install.sh | sh"
echo "    ollama pull llama3.2:3b"
echo -e "${GREEN}========================================${NC}"
