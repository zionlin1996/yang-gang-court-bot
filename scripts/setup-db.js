#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const env = process.env.NODE_ENV || 'development';

console.log(`Setting up database for ${env} environment...`);

try {
  if (env === 'development') {
    console.log('Using SQLite for development...');
    execSync('npm run dev:db:generate', { stdio: 'inherit' });
    execSync('npm run dev:db:push', { stdio: 'inherit' });
    console.log('✅ Development database setup complete!');
  } else {
    console.log('Using PostgreSQL for production...');
    execSync('npm run db:generate', { stdio: 'inherit' });
    
    // In production, we typically use migrations instead of db push
    try {
      execSync('npm run db:migrate:prod', { stdio: 'inherit' });
    } catch (error) {
      console.log('Migration failed, falling back to db push...');
      execSync('npm run db:push', { stdio: 'inherit' });
    }
    console.log('✅ Production database setup complete!');
  }
} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
}
