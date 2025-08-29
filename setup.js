#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🤖 Tournament Bot Setup Script');
console.log('================================\n');

// Check if .env file has been configured
const envContent = fs.readFileSync('.env', 'utf8');
if (envContent.includes('your_discord_bot_token_here')) {
    console.log('❌ Please configure your Discord bot token in the .env file');
    console.log('   Replace "your_discord_bot_token_here" with your actual bot token\n');
    console.log('📝 Steps to get a Discord bot token:');
    console.log('   1. Go to https://discord.com/developers/applications');
    console.log('   2. Create a new application');
    console.log('   3. Go to the "Bot" section and create a bot');
    console.log('   4. Copy the bot token and paste it in the .env file\n');
    console.log('⚠️  Setup incomplete - configure your token and run this script again');
    process.exit(1);
}

try {
    console.log('✅ Environment configuration found');
    
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    
    console.log('🗄️  Setting up database...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    execSync('npx prisma db push', { stdio: 'inherit' });
    
    console.log('\n🎉 Setup completed successfully!');
    console.log('\n🚀 To start the bot, run:');
    console.log('   npm start');
    console.log('\n📚 For help and commands, use /help in your Discord server');
    console.log('\n🔗 Don\'t forget to invite the bot to your Discord server!');
    console.log('   https://discord.com/developers/applications');
    console.log('   → OAuth2 → URL Generator → bot + applications.commands');
    
} catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
}