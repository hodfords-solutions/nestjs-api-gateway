#! /bin/bash

npm view @hodfords/api-gateway@"$(node -p "require('./package.json').version")" version && echo "Package is already published" && exit 0 || true
npm install
npm run build
cd dist/lib
npm publish --access public
