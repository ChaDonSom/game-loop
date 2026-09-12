#!/bin/bash

# Deploy to prod from local. SSH into the server and run the deployment script.

# Read from .env file to find server
export $(grep -v '^#' .env | xargs)

# bash -l: ensures that the login shell is used, which loads nvm
ssh gameloop@"${PROD_URL#https://}" -t "bash -l -c 'cd /home/gameloop/game-loop && ./deploy.sh'"
