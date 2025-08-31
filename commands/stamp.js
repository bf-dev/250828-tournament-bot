const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('내전스탬프')
        .setDescription('내전 스탬프 관리')
        .addSubcommand(subcommand =>
            subcommand
                .setName('수집')
                .setDescription('내전 참가 스탬프를 수집합니다')
                .addIntegerOption(option =>
                    option.setName('내전아이디')
                        .setDescription('스탬프를 수집할 내전 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('스탬프 목록을 확인합니다')
                .addUserOption(option =>
                    option.setName('사용자')
                        .setDescription('스탬프를 확인할 사용자 (선택사항)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('순위')
                .setDescription('스탬프 순위를 표시합니다')),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '수집':
                await collectStamp(interaction, prisma);
                break;
            case '목록':
                await listStamps(interaction, prisma);
                break;
            case '순위':
                await stampLeaderboard(interaction, prisma);
                break;
        }
    },
};

async function collectStamp(interaction, prisma) {
    const matchId = interaction.options.getInteger('내전아이디');
    const userId = interaction.user.id;

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { participants: true }
        });

        if (!match) {
            await interaction.reply({ content: '내전를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status !== 'completed') {
            await interaction.reply({ content: '완료된 내전에서만 스탬프를 수집할 수 있습니다!', ephemeral: true });
            return;
        }

        const isParticipant = match.participants.some(p => p.id === userId);
        if (!isParticipant) {
            await interaction.reply({ content: '이 내전에 참가하지 않았습니다!', ephemeral: true });
            return;
        }

        const existingStamp = await prisma.stamp.findUnique({
            where: {
                userId_matchId: {
                    userId: userId,
                    matchId: matchId
                }
            }
        });

        if (existingStamp) {
            await interaction.reply({ content: '이미 이 내전에서 스탬프를 수집하셨습니다!', ephemeral: true });
            return;
        }

        const stamp = await prisma.stamp.create({
            data: {
                userId: userId,
                matchId: matchId
            },
            include: {
                match: true,
                user: true
            }
        });

        const totalStamps = await prisma.stamp.count({
            where: { userId: userId }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('스탬프 수집 완료! ⭐')
            .addFields(
                { name: '내전', value: match.name, inline: true },
                { name: '총 스탬프', value: totalStamps.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '스탬프 수집 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function listStamps(interaction, prisma) {
    const targetUser = interaction.options.getUser('사용자') || interaction.user;
    const userId = targetUser.id;

    const stamps = await prisma.stamp.findMany({
        where: { userId: userId },
        include: { match: true },
        orderBy: { createdAt: 'desc' }
    });

    const totalStamps = stamps.length;

    let displayName;
    try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        displayName = member.displayName;
    } catch (error) {
        displayName = targetUser.displayName || targetUser.username;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`${displayName}님의 스탬프`)
        .addFields(
            { name: '총 스탬프', value: totalStamps.toString(), inline: true }
        )
        .setTimestamp();

    if (stamps.length === 0) {
        embed.setDescription('아직 수집된 스탬프가 없습니다!');
    } else {
        const stampList = stamps.slice(0, 10).map(stamp => {
            const date = stamp.createdAt.toLocaleDateString();
            return `⭐ **${stamp.match.name}** - ${date}`;
        });

        embed.setDescription(stampList.join('\n'));

        if (stamps.length > 10) {
            embed.setFooter({ text: `${stamps.length}개 스탬프 중 10개 표시` });
        }
    }

    await interaction.reply({ embeds: [embed] });
}

async function stampLeaderboard(interaction, prisma) {
    const stampCounts = await prisma.stamp.groupBy({
        by: ['userId'],
        _count: {
            id: true
        },
        orderBy: {
            _count: {
                id: 'desc'
            }
        },
        take: 10
    });

    if (stampCounts.length === 0) {
        await interaction.reply({ content: '아직 수집된 스탬프가 없습니다!' });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('스탬프 순위 🏆')
        .setTimestamp();

    const leaderboardPromises = stampCounts.map(async (entry, index) => {
        try {
            let displayName;
            try {
                const member = await interaction.guild.members.fetch(entry.userId);
                displayName = member.displayName;
            } catch (error) {
                const user = await interaction.client.users.fetch(entry.userId);
                displayName = user.displayName || user.username;
            }
            
            const position = index + 1;
            let medal = '';
            
            if (position === 1) medal = '🥇';
            else if (position === 2) medal = '🥈';
            else if (position === 3) medal = '🥉';
            else medal = `${position}.`;

            return `${medal} **${displayName}** - ${entry._count.id}개 스탬프`;
        } catch (error) {
            return `${index + 1}. 알 수 없는 사용자 - ${entry._count.id}개 스탬프`;
        }
    });

    const leaderboardEntries = await Promise.all(leaderboardPromises);
    embed.setDescription(leaderboardEntries.join('\n'));

    await interaction.reply({ embeds: [embed] });
}