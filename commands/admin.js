const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('관리')
        .setDescription('관리자 명령어')
        .addSubcommand(subcommand =>
            subcommand
                .setName('통계')
                .setDescription('봇 통계를 표시합니다'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('정리')
                .setDescription('오래된 데이터를 정리합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('일수')
                        .setDescription('X일 이전 데이터를 삭제합니다 (기본: 30일)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(365)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('백업')
                .setDescription('데이터베이스 백업을 생성합니다 (관리자 전용)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('사용자정보')
                .setDescription('사용자 정보를 가져옵니다')
                .addUserOption(option =>
                    option.setName('대상')
                        .setDescription('정보를 확인할 사용자')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('초기화')
                .setDescription('사용자 데이터를 초기화합니다 (관리자 전용)')
                .addUserOption(option =>
                    option.setName('대상')
                        .setDescription('데이터를 초기화할 사용자')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('유형')
                        .setDescription('초기화할 데이터')
                        .setRequired(true)
                        .addChoices(
                            { name: '모든 데이터', value: 'all' },
                            { name: '스탬프만', value: 'stamps' },
                            { name: '경고만', value: 'warnings' },
                            { name: '메모만', value: 'notes' }
                        ))),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '통계':
                await botStats(interaction, prisma);
                break;
            case '정리':
                await cleanupData(interaction, prisma);
                break;
            case '백업':
                await createBackup(interaction, prisma);
                break;
            case '사용자정보':
                await userInfo(interaction, prisma);
                break;
            case '초기화':
                await resetUserData(interaction, prisma);
                break;
        }
    },
};

async function botStats(interaction, prisma) {
    try {
        const [
            totalUsers,
            totalMatches,
            pendingMatches,
            completedMatches,
            totalStamps,
            totalWarnings,
            activeWarnings,
            totalNotes
        ] = await Promise.all([
            prisma.user.count(),
            prisma.match.count(),
            prisma.match.count({ where: { status: 'pending' } }),
            prisma.match.count({ where: { status: 'completed' } }),
            prisma.stamp.count(),
            prisma.warning.count(),
            prisma.warning.count({ where: { isActive: true } }),
            prisma.matchNote.count()
        ]);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 봇 통계')
            .addFields(
                { name: '👥 사용자', value: totalUsers.toString(), inline: true },
                { name: '🎮 총 경기', value: totalMatches.toString(), inline: true },
                { name: '⏳ 대기중 경기', value: pendingMatches.toString(), inline: true },
                { name: '✅ 완료된 경기', value: completedMatches.toString(), inline: true },
                { name: '⭐ 총 스탬프', value: totalStamps.toString(), inline: true },
                { name: '⚠️ 활성 경고', value: `${activeWarnings}/${totalWarnings}`, inline: true },
                { name: '📝 메모', value: totalNotes.toString(), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `봇 가동 시간: ${process.uptime().toFixed(0)}초` });

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '통계 조회 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function cleanupData(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '데이터 정리를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const days = interaction.options.getInteger('일수') || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
        await interaction.deferReply();

        const oldMatches = await prisma.match.findMany({
            where: {
                createdAt: {
                    lt: cutoffDate
                },
                status: {
                    in: ['completed', 'cancelled']
                }
            },
            select: { id: true, name: true }
        });

        if (oldMatches.length === 0) {
            await interaction.editReply({ content: `${days}일 이전의 정리할 경기가 없습니다.` });
            return;
        }

        const matchIds = oldMatches.map(m => m.id);

        const [deletedNotes, deletedStamps] = await Promise.all([
            prisma.matchNote.deleteMany({
                where: { matchId: { in: matchIds } }
            }),
            prisma.stamp.deleteMany({
                where: { matchId: { in: matchIds } }
            })
        ]);

        const deletedMatches = await prisma.match.deleteMany({
            where: { id: { in: matchIds } }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🧹 데이터 정리 완료')
            .addFields(
                { name: '기준일', value: cutoffDate.toLocaleDateString(), inline: true },
                { name: '삭제된 경기', value: deletedMatches.count.toString(), inline: true },
                { name: '삭제된 메모', value: deletedNotes.count.toString(), inline: true },
                { name: '삭제된 스탬프', value: deletedStamps.count.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '정리 작업 중 오류가 발생했습니다!' });
    }
}

async function createBackup(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '백업 생성을 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    try {
        await interaction.deferReply();

        const [users, matches, stamps, warnings, notes] = await Promise.all([
            prisma.user.findMany(),
            prisma.match.findMany({ include: { participants: true } }),
            prisma.stamp.findMany(),
            prisma.warning.findMany(),
            prisma.matchNote.findMany()
        ]);

        const backupData = {
            timestamp: new Date().toISOString(),
            version: '1.0',
            data: {
                users,
                matches,
                stamps,
                warnings,
                notes
            }
        };

        const fs = require('fs');
        const backupFileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        
        fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('💾 백업 생성 완료')
            .addFields(
                { name: '파일명', value: backupFileName },
                { name: '사용자', value: users.length.toString(), inline: true },
                { name: '경기', value: matches.length.toString(), inline: true },
                { name: '스탬프', value: stamps.length.toString(), inline: true },
                { name: '경고', value: warnings.length.toString(), inline: true },
                { name: '메모', value: notes.length.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '백업 생성 중 오류가 발생했습니다!' });
    }
}

async function userInfo(interaction, prisma) {
    const targetUser = interaction.options.getUser('대상');
    
    try {
        const user = await prisma.user.findUnique({
            where: { id: targetUser.id },
            include: {
                stamps: { include: { match: true } },
                warnings: { where: { isActive: true } },
                matchNotes: true,
                matches: true
            }
        });

        if (!user) {
            await interaction.reply({ content: '데이터베이스에서 사용자를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        const totalMatches = user.matches.length;
        const totalStamps = user.stamps.length;
        const activeWarnings = user.warnings.length;
        const totalNotes = user.matchNotes.length;

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`사용자 정보: ${targetUser.displayName || targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '사용자 ID', value: targetUser.id, inline: true },
                { name: '사용자명', value: targetUser.username, inline: true },
                { name: '데이터베이스 등록일', value: user.createdAt.toLocaleDateString(), inline: true },
                { name: '총 경기 참가', value: totalMatches.toString(), inline: true },
                { name: '수집한 스탬프', value: totalStamps.toString(), inline: true },
                { name: '활성 경고', value: activeWarnings.toString(), inline: true },
                { name: '작성한 메모', value: totalNotes.toString(), inline: true }
            )
            .setTimestamp();

        if (user.stamps.length > 0) {
            const recentStamps = user.stamps
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 3)
                .map(stamp => stamp.match.name)
                .join(', ');
            embed.addFields({ name: '최근 스탬프 출처', value: recentStamps });
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '사용자 정보 조회 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function resetUserData(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '사용자 데이터 초기화를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const targetUser = interaction.options.getUser('대상');
    const resetType = interaction.options.getString('유형');

    try {
        await interaction.deferReply();

        const user = await prisma.user.findUnique({
            where: { id: targetUser.id }
        });

        if (!user) {
            await interaction.editReply({ content: '데이터베이스에서 사용자를 찾을 수 없습니다!' });
            return;
        }

        let deletedCount = 0;
        let resetDescription = '';

        switch (resetType) {
            case 'all':
                const [stamps, warnings, notes] = await Promise.all([
                    prisma.stamp.deleteMany({ where: { userId: targetUser.id } }),
                    prisma.warning.deleteMany({ where: { userId: targetUser.id } }),
                    prisma.matchNote.deleteMany({ where: { userId: targetUser.id } })
                ]);
                
                await prisma.match.updateMany({
                    where: { participants: { some: { id: targetUser.id } } },
                    data: { participants: { disconnect: { id: targetUser.id } } }
                });

                deletedCount = stamps.count + warnings.count + notes.count;
                resetDescription = '모든 사용자 데이터 (스탬프, 경고, 메모, 경기 참가)';
                break;

            case 'stamps':
                const deletedStamps = await prisma.stamp.deleteMany({
                    where: { userId: targetUser.id }
                });
                deletedCount = deletedStamps.count;
                resetDescription = '모든 스탬프';
                break;

            case 'warnings':
                const deletedWarnings = await prisma.warning.deleteMany({
                    where: { userId: targetUser.id }
                });
                deletedCount = deletedWarnings.count;
                resetDescription = '모든 경고';
                break;

            case 'notes':
                const deletedNotes = await prisma.matchNote.deleteMany({
                    where: { userId: targetUser.id }
                });
                deletedCount = deletedNotes.count;
                resetDescription = '모든 메모';
                break;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔄 사용자 데이터 초기화')
            .addFields(
                { name: '사용자', value: targetUser.displayName || targetUser.username, inline: true },
                { name: '초기화 유형', value: resetDescription, inline: true },
                { name: '제거된 항목', value: deletedCount.toString(), inline: true },
                { name: '초기화 실행자', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '사용자 데이터 초기화 중 오류가 발생했습니다!' });
    }
}