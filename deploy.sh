#!/bin/bash -l
set -e # Exit immediately if a command exits with a non-zero status

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# optional: verify
echo "Using node: $(which node) $(node -v) npm: $(which npm) $(npm -v)"

git pull

npm ci
npm run build
pm2 startOrRestart node-transport/ecosystem.config.cjs --update-env
pm2 save
# Nginx takes care of the rest