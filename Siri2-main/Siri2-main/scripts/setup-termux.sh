#!/data/data/com.termux/files/usr/bin/bash
# Siri2 - One-time Termux setup script
# Run this on the Android device after installing Termux

set -e

echo "=== Siri2 Termux Setup ==="

# Update packages
echo "[1/5] Updating packages..."
pkg update -y
pkg upgrade -y

# Install required packages
echo "[2/5] Installing Node.js, Git, and build tools..."
pkg install -y nodejs git python

# Verify installations
echo "[3/5] Verifying installations..."
echo "  Node: $(node --version)"
echo "  NPM: $(npm --version)"
echo "  Git: $(git --version)"

# Grant storage access
echo "[4/5] Setting up storage access..."
termux-setup-storage || echo "  Storage already set up or run manually"

# Clone and build
echo "[5/5] Clone and build Siri2..."
if [ ! -d "$HOME/siri2" ]; then
  cd "$HOME"
  git clone https://github.com/JoshTheMenace/Siri2.git siri2
else
  echo "  siri2 directory already exists, skipping clone"
fi

cd "$HOME/siri2"
npm install
npm run build

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Create .env file: cp .env.example .env"
echo "  2. Edit .env and add your ANTHROPIC_API_KEY"
echo "  3. Run CLI: npm start"
echo "  4. Run HTTP server: npm run start:server"
