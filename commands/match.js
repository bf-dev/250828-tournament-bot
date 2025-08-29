const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('경기')
        .setDescription('경기 관리')
        .addSubcommand(subcommand =>
            subcommand
                .setName('생성')
                .setDescription('새로운 경기를 생성합니다')
                .addStringOption(option =>
                    option.setName('이름')
                        .setDescription('경기 이름')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('설명')
                        .setDescription('경기 설명')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('참가')
                .setDescription('경기에 참가합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('경기 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('탈퇴')
                .setDescription('경기에서 탈퇴합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('경기 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('완료')
                .setDescription('경기를 완료하고 결과를 설정합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('경기 ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('결과')
                        .setDescription('경기 결과')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('모든 경기 목록을 표시합니다'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('정보')
                .setDescription('경기 정보를 확인합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('경기 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('삭제')
                .setDescription('경기를 삭제합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('경기 ID')
                        .setRequired(true))),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '생성':
                await createMatch(interaction, prisma);
                break;
            case '참가':
                await joinMatch(interaction, prisma);
                break;
            case '탈퇴':
                await leaveMatch(interaction, prisma);
                break;
            case '완료':
                await completeMatch(interaction, prisma);
                break;
            case '목록':
                await listMatches(interaction, prisma);
                break;
            case '정보':
                await matchInfo(interaction, prisma);
                break;
            case '삭제':
                await deleteMatch(interaction, prisma);
                break;
        }
    },
};

async function createMatch(interaction, prisma) {
    const name = interaction.options.getString('이름');
    const description = interaction.options.getString('설명');

    const match = await prisma.match.create({
        data: {
            name,
            description,
        },
    });

    const statusText = match.status === 'pending' ? '대기중' : match.status === 'completed' ? '완료' : '취소됨';

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('경기가 생성되었습니다')
        .addFields(
            { name: '경기 ID', value: match.id.toString(), inline: true },
            { name: '이름', value: match.name, inline: true },
            { name: '상태', value: statusText, inline: true }
        )
        .setTimestamp();

    if (description) {
        embed.addFields({ name: '설명', value: description });
    }

    await interaction.reply({ embeds: [embed] });
}

async function joinMatch(interaction, prisma) {
    const matchId = interaction.options.getInteger('아이디');
    const userId = interaction.user.id;

    if (!matchId) {
        await interaction.reply({ content: '경기 ID를 입력해주세요!', ephemeral: true });
        return;
    }

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { participants: true }
        });

        if (!match) {
            await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status !== 'pending') {
            await interaction.reply({ content: '대기중인 경기에만 참가할 수 있습니다!', ephemeral: true });
            return;
        }

        if (match.participants.some(p => p.id === userId)) {
            await interaction.reply({ content: '이미 이 경기에 참가중입니다!', ephemeral: true });
            return;
        }

        await prisma.match.update({
            where: { id: matchId },
            data: {
                participants: {
                    connect: { id: userId }
                }
            }
        });

        await interaction.reply({ content: `경기 참가 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경기 참가 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function leaveMatch(interaction, prisma) {
    const matchId = interaction.options.getInteger('아이디');
    const userId = interaction.user.id;

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { participants: true }
        });

        if (!match) {
            await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status !== 'pending') {
            await interaction.reply({ content: '대기중인 경기에서만 탈퇴할 수 있습니다!', ephemeral: true });
            return;
        }

        if (!match.participants.some(p => p.id === userId)) {
            await interaction.reply({ content: '이 경기에 참가하고 있지 않습니다!', ephemeral: true });
            return;
        }

        await prisma.match.update({
            where: { id: matchId },
            data: {
                participants: {
                    disconnect: { id: userId }
                }
            }
        });

        await interaction.reply({ content: `경기 탈퇴 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경기 탈퇴 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function completeMatch(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '경기 완료를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const matchId = interaction.options.getInteger('아이디');
    const result = interaction.options.getString('결과');

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { participants: true }
        });

        if (!match) {
            await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status === 'completed') {
            await interaction.reply({ content: '이미 완료된 경기입니다!', ephemeral: true });
            return;
        }

        const updatedMatch = await prisma.match.update({
            where: { id: matchId },
            data: {
                status: 'completed',
                result: result
            },
            include: { participants: true }
        });

        for (const participant of match.participants) {
            const warnings = await prisma.warning.findMany({
                where: { userId: participant.id, isActive: true }
            });

            if (warnings.length > 0) {
                await prisma.warning.update({
                    where: { id: warnings[0].id },
                    data: { isActive: false }
                });
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('경기가 완료되었습니다')
            .addFields(
                { name: '경기', value: match.name, inline: true },
                { name: '결과', value: result, inline: true },
                { name: '참가자', value: match.participants.length.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경기 완료 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function listMatches(interaction, prisma) {
    const matches = await prisma.match.findMany({
        include: { 
            participants: true,
            _count: { select: { participants: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (matches.length === 0) {
        await interaction.reply({ content: '경기를 찾을 수 없습니다!' });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('경기 목록')
        .setTimestamp();

    const matchList = matches.slice(0, 10).map(match => {
        const statusText = match.status === 'pending' ? '대기중' : match.status === 'completed' ? '완료' : '취소됨';
        return `**${match.id}**: ${match.name} (${statusText}) - ${match._count.participants}명 참가`;
    });

    embed.setDescription(matchList.join('\n'));

    if (matches.length > 10) {
        embed.setFooter({ text: `${matches.length}개 경기 중 10개 표시` });
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
        await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
        return;
    }

    const statusText = match.status === 'pending' ? '대기중' : match.status === 'completed' ? '완료' : '취소됨';
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`경기 정보 - ${match.name}`)
        .addFields(
            { name: '경기 ID', value: match.id.toString(), inline: true },
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
        const participantList = match.participants.map(p => p.displayName || p.username).join(', ');
        embed.addFields({ name: '참가자 목록', value: participantList });
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

async function deleteMatch(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '경기 삭제를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const matchId = interaction.options.getInteger('아이디');

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId }
        });

        if (!match) {
            await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        await prisma.match.delete({
            where: { id: matchId }
        });

        await interaction.reply({ content: `경기 삭제 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경기 삭제 중 오류가 발생했습니다!', ephemeral: true });
    }
}