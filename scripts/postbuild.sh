#!/bin/sh
cp package.json dist/libs/api-gateway
cp README.md dist/libs/api-gateway
cp .npmrc dist/libs/api-gateway

cp libs/client/package.json dist/libs/client
cp README.md dist/libs/client
cp .npmrc dist/libs/client

cp libs/opentelemetry/package.json dist/libs/opentelemetry
cp README.md dist/libs/opentelemetry
cp .npmrc dist/libs/opentelemetry
