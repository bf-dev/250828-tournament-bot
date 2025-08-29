require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const prisma = new PrismaClient();
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[경고] ${filePath}의 명령어에 필수 "data" 또는 "execute" 속성이 누락되었습니다.`);
        }
    }
}

client.once('ready', async () => {
    console.log(`준비 완료! ${client.user.tag}로 로그인되었습니다`);
    
    const commands = [];
    client.commands.forEach(command => {
        commands.push(command.data.toJSON());
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`${commands.length}개의 슬래시 명령어 새로고침을 시작합니다.`);

        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log(`${data.length}개의 슬래시 명령어를 성공적으로 새로고침했습니다.`);
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`${interaction.commandName}과 일치하는 명령어를 찾을 수 없습니다.`);
        return;
    }

    try {
        const user = await prisma.user.upsert({
            where: { id: interaction.user.id },
            update: {
                username: interaction.user.username,
                displayName: interaction.user.displayName || interaction.user.globalName,
            },
            create: {
                id: interaction.user.id,
                username: interaction.user.username,
                displayName: interaction.user.displayName || interaction.user.globalName,
            },
        });

        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(error);
        const errorMessage = '명령어 실행 중 오류가 발생했습니다!';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

process.on('SIGINT', async () => {
    console.log('종료 중...');
    await prisma.$disconnect();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('종료 중...');
    await prisma.$disconnect();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);