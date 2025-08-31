const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('내전기록')
        .setDescription('내전 기록 확인')
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('모든 내전 목록을 표시합니다'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('정보')
                .setDescription('내전 정보를 확인합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('내전 ID')
                        .setRequired(true))),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '목록':
                await listMatches(interaction, prisma);
                break;
            case '정보':
                await matchInfo(interaction, prisma);
                break;
        }
    },
};

async function listMatches(interaction, prisma) {
    const matches = await prisma.match.findMany({
        include: { 
            participants: true,
            _count: { select: { participants: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (matches.length === 0) {
        await interaction.reply({ content: '내전을 찾을 수 없습니다!' });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('내전 목록')
        .setTimestamp();

    const matchList = matches.slice(0, 10).map(match => {
        const statusText = match.status === 'pending' ? '대기중' : match.status === 'completed' ? '완료' : '취소됨';
        return `**${match.id}**: ${match.name} (${statusText}) - ${match._count.participants}명 참가`;
    });

    embed.setDescription(matchList.join('\n'));

    if (matches.length > 10) {
        embed.setFooter({ text: `${matches.length}개 내전 중 10개 표시` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function matchInfo(interaction, prisma) {
    const matchId = interaction.options.getInteger('아이디');

    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { 
            participants: true,
            stamps: { include: { user: true } },
            notes: { include: { user: true } }
        }
    });

    if (!match) {
        await interaction.reply({ content: '내전을 찾을 수 없습니다!', ephemeral: true });
        return;
    }

    const statusText = match.status === 'pending' ? '대기중' : match.status === 'completed' ? '완료' : '취소됨';
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`내전 정보 - ${match.name}`)
        .addFields(
            { name: '내전 ID', value: match.id.toString(), inline: true },
            { name: '상태', value: statusText, inline: true },
            { name: '참가자', value: match.participants.length.toString(), inline: true }
        );

    if (match.description) {
        embed.addFields({ name: '설명', value: match.description });
    }

    if (match.result) {
        embed.addFields({ name: '결과', value: match.result });
    }

    if (match.participants.length > 0) {
        const participantNames = await Promise.all(
            match.participants.map(async (p) => {
                try {
                    const member = await interaction.guild.members.fetch(p.id);
                    return member.displayName;
                } catch (error) {
                    return p.displayName || p.username;
                }
            })
        );
        embed.addFields({ name: '참가자 목록', value: participantNames.join(', ') });
    }

    if (match.stamps.length > 0) {
        embed.addFields({ name: '스탬프', value: `${match.stamps.length}개 수집됨` });
    }

    if (match.notes.length > 0) {
        embed.addFields({ name: '메모', value: `${match.notes.length}개 작성됨` });
    }

    embed.setTimestamp(match.createdAt);

    await interaction.reply({ embeds: [embed] });
}