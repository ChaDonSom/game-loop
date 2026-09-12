#!/bin/bash -l
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# optional: verify
echo "Using node: $(which node) $(node -v) npm: $(which npm) $(npm -v)"

git pull

cd ./node-transport
npm install
pm2 restart transport --update-env

cd ../vue-client
npm install
npm run build

cd ../
# Nginx takes care of the rest