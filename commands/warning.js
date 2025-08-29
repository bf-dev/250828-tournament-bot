const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('경고')
        .setDescription('사용자 경고 관리')
        .addSubcommand(subcommand =>
            subcommand
                .setName('발급')
                .setDescription('사용자에게 경고를 발급합니다 (관리자 전용)')
                .addUserOption(option =>
                    option.setName('사용자')
                        .setDescription('경고할 사용자')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('사유')
                        .setDescription('경고 사유')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('제거')
                .setDescription('경고를 제거합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('경고아이디')
                        .setDescription('제거할 경고 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('사용자의 경고 목록을 표시합니다')
                .addUserOption(option =>
                    option.setName('사용자')
                        .setDescription('경고를 확인할 사용자 (선택사항)')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('활성만')
                        .setDescription('활성 경고만 표시 (기본: true)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('전체삭제')
                .setDescription('사용자의 모든 경고를 삭제합니다 (관리자 전용)')
                .addUserOption(option =>
                    option.setName('사용자')
                        .setDescription('경고를 삭제할 사용자')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('통계')
                .setDescription('경고 통계를 표시합니다')),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '발급':
                await issueWarning(interaction, prisma);
                break;
            case '제거':
                await removeWarning(interaction, prisma);
                break;
            case '목록':
                await listWarnings(interaction, prisma);
                break;
            case '전체삭제':
                await clearWarnings(interaction, prisma);
                break;
            case '통계':
                await warningStats(interaction, prisma);
                break;
        }
    },
};

async function issueWarning(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '경고 발급을 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const targetUser = interaction.options.getUser('사용자');
    const reason = interaction.options.getString('사유');
    const issuedBy = interaction.user.id;

    if (targetUser.bot) {
        await interaction.reply({ content: '봇에게는 경고를 발급할 수 없습니다!', ephemeral: true });
        return;
    }

    if (reason.length > 500) {
        await interaction.reply({ content: '경고 사유는 500자를 초과할 수 없습니다!', ephemeral: true });
        return;
    }

    try {
        await prisma.user.upsert({
            where: { id: targetUser.id },
            update: {
                username: targetUser.username,
                displayName: targetUser.displayName || targetUser.globalName,
            },
            create: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName || targetUser.globalName,
            },
        });

        const warning = await prisma.warning.create({
            data: {
                userId: targetUser.id,
                reason: reason,
                issuedBy: issuedBy,
                isActive: true
            }
        });

        const activeWarnings = await prisma.warning.count({
            where: { userId: targetUser.id, isActive: true }
        });

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⚠️ 경고 발급')
            .addFields(
                { name: '사용자', value: `${targetUser.displayName || targetUser.username}`, inline: true },
                { name: '경고 ID', value: warning.id.toString(), inline: true },
                { name: '활성 경고', value: activeWarnings.toString(), inline: true },
                { name: '사유', value: reason },
                { name: '발급자', value: `<@${issuedBy}>`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ 경고를 받았습니다')
                .addFields(
                    { name: '사유', value: reason },
                    { name: '활성 경고', value: activeWarnings.toString() },
                    { name: '참고', value: '완료된 경기에 참가하면 경고가 감소됩니다.' }
                )
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('사용자에게 경고 DM을 보낼 수 없음');
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경고 발급 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function removeWarning(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '경고 제거를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const warningId = interaction.options.getInteger('경고아이디');

    try {
        const warning = await prisma.warning.findUnique({
            where: { id: warningId },
            include: { user: true }
        });

        if (!warning) {
            await interaction.reply({ content: '경고를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        await prisma.warning.update({
            where: { id: warningId },
            data: { isActive: false }
        });

        const activeWarnings = await prisma.warning.count({
            where: { userId: warning.userId, isActive: true }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 경고 제거')
            .addFields(
                { name: '사용자', value: warning.user.displayName || warning.user.username, inline: true },
                { name: '경고 ID', value: warningId.toString(), inline: true },
                { name: '남은 활성 경고', value: activeWarnings.toString(), inline: true },
                { name: '원래 사유', value: warning.reason },
                { name: '제거자', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경고 제거 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function listWarnings(interaction, prisma) {
    const targetUser = interaction.options.getUser('사용자') || interaction.user;
    const activeOnly = interaction.options.getBoolean('활성만') ?? true;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (targetUser.id !== interaction.user.id && !isAdmin) {
        await interaction.reply({ content: '관리자가 아닌 경우 자신의 경고만 볼 수 있습니다!', ephemeral: true });
        return;
    }

    const whereClause = { userId: targetUser.id };
    if (activeOnly) {
        whereClause.isActive = true;
    }

    const warnings = await prisma.warning.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
    });

    const embed = new EmbedBuilder()
        .setColor(activeOnly ? 0xFF0000 : 0x0099FF)
        .setTitle(`${targetUser.displayName || targetUser.username}님의 ${activeOnly ? '활성 ' : ''}경고`)
        .setTimestamp();

    if (warnings.length === 0) {
        embed.setDescription(`${activeOnly ? '활성 ' : ''}경고가 없습니다.`);
    } else {
        const warningList = warnings.slice(0, 10).map(warning => {
            const date = warning.createdAt.toLocaleDateString();
            const status = warning.isActive ? '🔴 활성' : '🟢 해결됨';
            const reason = warning.reason.length > 50 ? warning.reason.substring(0, 50) + '...' : warning.reason;
            return `**ID ${warning.id}** (${date}) ${status}\n${reason}`;
        });

        embed.setDescription(warningList.join('\n\n'));
        embed.addFields({ name: '총 경고', value: warnings.length.toString(), inline: true });

        if (warnings.length > 10) {
            embed.setFooter({ text: `${warnings.length}개 경고 중 10개 표시` });
        }
    }

    await interaction.reply({ embeds: [embed], ephemeral: targetUser.id !== interaction.user.id });
}

async function clearWarnings(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '경고 삭제를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const targetUser = interaction.options.getUser('사용자');

    try {
        const activeWarnings = await prisma.warning.findMany({
            where: { userId: targetUser.id, isActive: true }
        });

        if (activeWarnings.length === 0) {
            await interaction.reply({ content: '사용자에게 삭제할 활성 경고가 없습니다!', ephemeral: true });
            return;
        }

        await prisma.warning.updateMany({
            where: { userId: targetUser.id, isActive: true },
            data: { isActive: false }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 모든 경고 삭제')
            .addFields(
                { name: '사용자', value: targetUser.displayName || targetUser.username, inline: true },
                { name: '삭제된 경고', value: activeWarnings.length.toString(), inline: true },
                { name: '삭제자', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경고 삭제 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function warningStats(interaction, prisma) {
    try {
        const totalWarnings = await prisma.warning.count();
        const activeWarnings = await prisma.warning.count({
            where: { isActive: true }
        });
        const resolvedWarnings = totalWarnings - activeWarnings;

        const usersWithActiveWarnings = await prisma.warning.groupBy({
            by: ['userId'],
            where: { isActive: true },
            _count: { id: true }
        });

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 경고 통계')
            .addFields(
                { name: '총 발급된 경고', value: totalWarnings.toString(), inline: true },
                { name: '활성 경고', value: activeWarnings.toString(), inline: true },
                { name: '해결된 경고', value: resolvedWarnings.toString(), inline: true },
                { name: '경고 받은 사용자', value: usersWithActiveWarnings.length.toString(), inline: true }
            )
            .setTimestamp();

        if (usersWithActiveWarnings.length > 0) {
            const topWarned = usersWithActiveWarnings
                .sort((a, b) => b._count.id - a._count.id)
                .slice(0, 5)
                .map(async (entry, index) => {
                    try {
                        const user = await interaction.client.users.fetch(entry.userId);
                        return `${index + 1}. ${user.displayName || user.username} - ${entry._count.id}개 경고`;
                    } catch (error) {
                        return `${index + 1}. 알 수 없는 사용자 - ${entry._count.id}개 경고`;
                    }
                });

            const topWarnedList = await Promise.all(topWarned);
            embed.addFields({ name: '경고 상위 사용자', value: topWarnedList.join('\n') });
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '경고 통계 조회 중 오류가 발생했습니다!', ephemeral: true });
    }
}