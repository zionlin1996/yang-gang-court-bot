#!/bin/bash

echo "Starting build process for Render.com..."

# Install dependencies
echo "Installing dependencies..."
yarn install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push database schema (creates database if it doesn't exist)
echo "Setting up database..."
npx prisma db push

echo "Build process completed!"
