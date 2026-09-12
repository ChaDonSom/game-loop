#!/bin/bash

git pull

cd ./node-transport
npm install
pm2 restart transport

cd ../vue-client
npm install
npm run build

cd ../
# Nginx takes care of the rest