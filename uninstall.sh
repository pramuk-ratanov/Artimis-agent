#!/usr/bin/env bash
# Artimis Agent — Uninstaller
# Removes all Artimis files from your machine.
#
# Usage:
#   bash uninstall.sh          # Full removal (asks confirmation)
#   bash uninstall.sh --yes    # Skip confirmation
#   bash uninstall.sh --keep-data  # Remove agent, keep your data (memories, skills, DB)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ARTIMIS_HOME="$HOME/.artimis"
KEEP_DATA=false
SKIP_CONFIRM=false

for arg in "$@"; do
    case "$arg" in
        --keep-data) KEEP_DATA=true ;;
        --yes|-y)    SKIP_CONFIRM=true ;;
    esac
done

echo ""
echo -e "${RED}  Artimis Uninstaller${NC}"
echo ""

# Check if Artimis is installed
if [ ! -d "$ARTIMIS_HOME" ]; then
    echo "  No Artimis installation found at $ARTIMIS_HOME"
    echo "  Nothing to remove."
    exit 0
fi

# Show what will be removed
echo "  The following will be removed:"
echo ""
echo -e "    ${YELLOW}$ARTIMIS_HOME/agent/${NC}       — Agent code & virtual environment"
echo -e "    ${YELLOW}$ARTIMIS_HOME/start.sh${NC}      — Launch script"

if [ "$KEEP_DATA" = false ]; then
    echo -e "    ${YELLOW}$ARTIMIS_HOME/data/${NC}         — Session data"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/skills/${NC}       — Saved skills"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/gallery/${NC}      — Generated images"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/models/${NC}       — Local models (if any)"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/*.db${NC}          — Databases (memories, sessions, tasks)"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/.env${NC}          — Your API key configuration"
else
    echo ""
    echo -e "  ${GREEN}Keeping your data:${NC} memories, skills, gallery, database, and .env"
    echo -e "  Only the agent code will be removed."
fi

echo ""

# Confirmation
if [ "$SKIP_CONFIRM" = false ]; then
    if [ "$KEEP_DATA" = true ]; then
        echo -n "  Remove agent code but keep data? [y/N] "
    else
        echo -n "  Remove everything? [y/N] "
    fi
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "  Cancelled."
        exit 0
    fi
fi

echo ""

# Remove
if [ "$KEEP_DATA" = true ]; then
    echo "  Removing agent code..."
    rm -rf "$ARTIMIS_HOME/agent"
    rm -f "$ARTIMIS_HOME/start.sh"
    echo ""
    echo -e "  ${GREEN}Agent removed.${NC}"
    echo ""
    echo "  Your data is still at:"
    echo -e "    ${YELLOW}$ARTIMIS_HOME/${NC}"
    echo ""
    echo "  To reinstall later:"
    echo "    curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash"
    echo "  Your memories, skills, and settings will be preserved."
else
    echo "  Removing everything..."
    rm -rf "$ARTIMIS_HOME"
    echo ""
    echo -e "  ${GREEN}Artimis has been completely removed.${NC}"
    echo ""
    echo "  To reinstall later:"
    echo "    curl -fsSL https://raw.githubusercontent.com/pramuk-ratanov/Artimis-agent/main/install.sh | bash"
fi

echo ""
