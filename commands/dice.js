const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('주사위')
        .setDescription('주사위 굴리기')
        .addSubcommand(subcommand =>
            subcommand
                .setName('굴리기')
                .setDescription('지정된 면 수의 주사위를 굴립니다')
                .addIntegerOption(option =>
                    option.setName('면수')
                        .setDescription('주사위의 면 수 (기본: 6)')
                        .setRequired(false)
                        .setMinValue(2)
                        .setMaxValue(100))
                .addIntegerOption(option =>
                    option.setName('개수')
                        .setDescription('굴릴 주사위 개수 (기본: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('d20')
                .setDescription('20면 주사위를 굴립니다'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('동전')
                .setDescription('동전을 던집니다'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('커스텀')
                .setDescription('커스텀 주사위 식 (2d6+3 등)')
                .addStringOption(option =>
                    option.setName('식')
                        .setDescription('주사위 식 (2d6+3, 1d20-2 등)')
                        .setRequired(true))),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '굴리기':
                await rollDice(interaction);
                break;
            case 'd20':
                await rollD20(interaction);
                break;
            case '동전':
                await coinFlip(interaction);
                break;
            case '커스텀':
                await customRoll(interaction);
                break;
        }
    },
};

function rollSingleDice(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

async function rollDice(interaction) {
    const sides = interaction.options.getInteger('면수') || 6;
    const count = interaction.options.getInteger('개수') || 1;

    const rolls = [];
    let total = 0;

    for (let i = 0; i < count; i++) {
        const roll = rollSingleDice(sides);
        rolls.push(roll);
        total += roll;
    }

    const embed = new EmbedBuilder()
        .setColor(0x9932CC)
        .setTitle(`🎲 주사위 결과`)
        .addFields(
            { name: '주사위', value: `${count}d${sides}`, inline: true },
            { name: '합계', value: total.toString(), inline: true }
        );

    if (count > 1) {
        const rollsDisplay = rolls.join(', ');
        embed.addFields({ name: '개별 결과', value: `[${rollsDisplay}]` });
    }

    embed.setFooter({ 
        text: `${interaction.user.displayName || interaction.user.username}님이 굴림`,
        iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function rollD20(interaction) {
    const roll = rollSingleDice(20);
    let color = 0x9932CC;
    let special = '';

    if (roll === 20) {
        color = 0x00FF00;
        special = ' 🎉 **대성공!**';
    } else if (roll === 1) {
        color = 0xFF0000;
        special = ' 💥 **대실패!**';
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎲 D20 결과`)
        .setDescription(`**${roll}**${special}`)
        .setFooter({ 
            text: `${interaction.user.displayName || interaction.user.username}님이 굴림`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function coinFlip(interaction) {
    const flip = Math.random() < 0.5 ? '앞면' : '뒷면';
    const emoji = flip === '앞면' ? '🪙' : '⚫';

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`${emoji} 동전 던지기`)
        .setDescription(`**${flip}**`)
        .setFooter({ 
            text: `${interaction.user.displayName || interaction.user.username}님이 던짐`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function customRoll(interaction) {
    const expression = interaction.options.getString('식').toLowerCase().replace(/\s/g, '');
    
    try {
        const result = parseDiceExpression(expression);
        
        if (!result) {
            await interaction.reply({ 
                content: '잘못된 주사위 식입니다! 2d6+3, 1d20-2, 3d8 같은 형식을 사용하세요.', 
                ephemeral: true 
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x9932CC)
            .setTitle(`🎲 커스텀 주사위`)
            .addFields(
                { name: '식', value: expression.toUpperCase(), inline: true },
                { name: '결과', value: result.total.toString(), inline: true }
            );

        if (result.breakdown) {
            embed.addFields({ name: '상세', value: result.breakdown });
        }

        embed.setFooter({ 
            text: `${interaction.user.displayName || interaction.user.username}님이 굴림`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ 
            content: '주사위 식 분석 오류! 2d6+3, 1d20-2, 3d8 같은 형식을 사용하세요.', 
            ephemeral: true 
        });
    }
}

function parseDiceExpression(expression) {
    const regex = /^(\d+)d(\d+)([+\-]\d+)?$/;
    const match = expression.match(regex);
    
    if (!match) {
        return null;
    }
    
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;
    
    if (count > 20 || sides > 100 || count < 1 || sides < 2) {
        return null;
    }
    
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
        const roll = rollSingleDice(sides);
        rolls.push(roll);
        total += roll;
    }
    
    const finalTotal = total + modifier;
    let breakdown = `굴린 값: [${rolls.join(', ')}] = ${total}`;
    
    if (modifier !== 0) {
        const sign = modifier >= 0 ? '+' : '';
        breakdown += `${sign}${modifier} = ${finalTotal}`;
    }
    
    return {
        total: finalTotal,
        breakdown: breakdown
    };
}