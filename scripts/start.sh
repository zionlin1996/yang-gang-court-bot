#!/bin/sh

echo "Starting Yang Gang Court Bot..."

# Run database setup first
echo "Setting up database..."
yarn prod:db:setup

# Start the server
echo "Starting server..."
yarn start
