const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('내전참가')
        .setDescription('내전 참가 관리')
        .addSubcommand(subcommand =>
            subcommand
                .setName('생성')
                .setDescription('새로운 내전을 생성합니다')
                .addStringOption(option =>
                    option.setName('이름')
                        .setDescription('내전 이름')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('설명')
                        .setDescription('내전 설명')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('참가')
                .setDescription('내전에 참가합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('내전 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('탈퇴')
                .setDescription('내전에서 탈퇴합니다')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('내전 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('완료')
                .setDescription('내전을 완료하고 결과를 설정합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('내전 ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('결과')
                        .setDescription('내전 결과')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('삭제')
                .setDescription('내전을 삭제합니다 (관리자 전용)')
                .addIntegerOption(option =>
                    option.setName('아이디')
                        .setDescription('내전 ID')
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
        .setTitle('내전가 생성되었습니다')
        .addFields(
            { name: '내전 ID', value: match.id.toString(), inline: true },
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
        await interaction.reply({ content: '내전 ID를 입력해주세요!', ephemeral: true });
        return;
    }

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { participants: true }
        });

        if (!match) {
            await interaction.reply({ content: '내전를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status !== 'pending') {
            await interaction.reply({ content: '대기중인 내전에만 참가할 수 있습니다!', ephemeral: true });
            return;
        }

        if (match.participants.some(p => p.id === userId)) {
            await interaction.reply({ content: '이미 이 내전에 참가중입니다!', ephemeral: true });
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

        await interaction.reply({ content: `내전 참가 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '내전 참가 중 오류가 발생했습니다!', ephemeral: true });
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
            await interaction.reply({ content: '내전를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status !== 'pending') {
            await interaction.reply({ content: '대기중인 내전에서만 탈퇴할 수 있습니다!', ephemeral: true });
            return;
        }

        if (!match.participants.some(p => p.id === userId)) {
            await interaction.reply({ content: '이 내전에 참가하고 있지 않습니다!', ephemeral: true });
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

        await interaction.reply({ content: `내전 탈퇴 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '내전 탈퇴 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function completeMatch(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '내전 완료를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
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
            await interaction.reply({ content: '내전를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (match.status === 'completed') {
            await interaction.reply({ content: '이미 완료된 내전입니다!', ephemeral: true });
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
            .setTitle('내전가 완료되었습니다')
            .addFields(
                { name: '내전', value: match.name, inline: true },
                { name: '결과', value: result, inline: true },
                { name: '참가자', value: match.participants.length.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '내전 완료 중 오류가 발생했습니다!', ephemeral: true });
    }
}


async function deleteMatch(interaction, prisma) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '내전 삭제를 위해서는 관리자 권한이 필요합니다!', ephemeral: true });
        return;
    }

    const matchId = interaction.options.getInteger('아이디');

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId }
        });

        if (!match) {
            await interaction.reply({ content: '내전를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        await prisma.match.delete({
            where: { id: matchId }
        });

        await interaction.reply({ content: `내전 삭제 성공: ${match.name}` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '내전 삭제 중 오류가 발생했습니다!', ephemeral: true });
    }
}