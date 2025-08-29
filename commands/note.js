const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('메모')
        .setDescription('경기 메모 및 노트 관리')
        .addSubcommand(subcommand =>
            subcommand
                .setName('추가')
                .setDescription('경기에 메모를 추가합니다')
                .addIntegerOption(option =>
                    option.setName('경기아이디')
                        .setDescription('메모를 추가할 경기 ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('내용')
                        .setDescription('메모 내용')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('경기의 메모 목록을 표시합니다')
                .addIntegerOption(option =>
                    option.setName('경기아이디')
                        .setDescription('메모를 확인할 경기 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('삭제')
                .setDescription('메모를 삭제합니다 (자신의 메모 또는 관리자만)')
                .addIntegerOption(option =>
                    option.setName('메모아이디')
                        .setDescription('삭제할 메모 ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('수정')
                .setDescription('자신의 메모를 수정합니다')
                .addIntegerOption(option =>
                    option.setName('메모아이디')
                        .setDescription('수정할 메모 ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('내용')
                        .setDescription('새로운 메모 내용')
                        .setRequired(true))),

    async execute(interaction, prisma) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case '추가':
                await addNote(interaction, prisma);
                break;
            case '목록':
                await listNotes(interaction, prisma);
                break;
            case '삭제':
                await deleteNote(interaction, prisma);
                break;
            case '수정':
                await editNote(interaction, prisma);
                break;
        }
    },
};

async function addNote(interaction, prisma) {
    const matchId = interaction.options.getInteger('경기아이디');
    const content = interaction.options.getString('내용');
    const userId = interaction.user.id;

    if (content.length > 1000) {
        await interaction.reply({ content: '메모 내용은 1000자를 초과할 수 없습니다!', ephemeral: true });
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

        const isParticipant = match.participants.some(p => p.id === userId);
        if (!isParticipant) {
            await interaction.reply({ content: '참가한 경기에만 메모를 추가할 수 있습니다!', ephemeral: true });
            return;
        }

        const note = await prisma.matchNote.create({
            data: {
                matchId: matchId,
                userId: userId,
                content: content
            },
            include: {
                match: true,
                user: true
            }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('메모 추가 완료 📝')
            .addFields(
                { name: '경기', value: match.name, inline: true },
                { name: '메모 ID', value: note.id.toString(), inline: true },
                { name: '내용', value: content.length > 100 ? content.substring(0, 100) + '...' : content }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '메모 추가 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function listNotes(interaction, prisma) {
    const matchId = interaction.options.getInteger('경기아이디');

    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId }
        });

        if (!match) {
            await interaction.reply({ content: '경기를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        const notes = await prisma.matchNote.findMany({
            where: { matchId: matchId },
            include: { user: true },
            orderBy: { createdAt: 'desc' }
        });

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`${match.name} 경기 메모`)
            .setTimestamp();

        if (notes.length === 0) {
            embed.setDescription('이 경기에 대한 메모가 없습니다.');
        } else {
            const noteList = notes.map(note => {
                const author = note.user.displayName || note.user.username;
                const date = note.createdAt.toLocaleDateString();
                const preview = note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content;
                return `**ID ${note.id}** by ${author} (${date})\n${preview}`;
            });

            embed.setDescription(noteList.slice(0, 5).join('\n\n'));

            if (notes.length > 5) {
                embed.setFooter({ text: `${notes.length}개 메모 중 5개 표시. 더 보려면 /메모 목록을 사용하세요.` });
            }
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '메모 목록 조회 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function deleteNote(interaction, prisma) {
    const noteId = interaction.options.getInteger('메모아이디');
    const userId = interaction.user.id;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    try {
        const note = await prisma.matchNote.findUnique({
            where: { id: noteId },
            include: { match: true, user: true }
        });

        if (!note) {
            await interaction.reply({ content: '메모를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (note.userId !== userId && !isAdmin) {
            await interaction.reply({ content: '자신의 메모만 삭제할 수 있습니다!', ephemeral: true });
            return;
        }

        await prisma.matchNote.delete({
            where: { id: noteId }
        });

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('메모 삭제 완료 🗑️')
            .addFields(
                { name: '경기', value: note.match.name, inline: true },
                { name: '작성자', value: note.user.displayName || note.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '메모 삭제 중 오류가 발생했습니다!', ephemeral: true });
    }
}

async function editNote(interaction, prisma) {
    const noteId = interaction.options.getInteger('메모아이디');
    const newContent = interaction.options.getString('내용');
    const userId = interaction.user.id;

    if (newContent.length > 1000) {
        await interaction.reply({ content: '메모 내용은 1000자를 초과할 수 없습니다!', ephemeral: true });
        return;
    }

    try {
        const note = await prisma.matchNote.findUnique({
            where: { id: noteId },
            include: { match: true }
        });

        if (!note) {
            await interaction.reply({ content: '메모를 찾을 수 없습니다!', ephemeral: true });
            return;
        }

        if (note.userId !== userId) {
            await interaction.reply({ content: '자신의 메모만 수정할 수 있습니다!', ephemeral: true });
            return;
        }

        const updatedNote = await prisma.matchNote.update({
            where: { id: noteId },
            data: { content: newContent },
            include: { match: true }
        });

        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('메모 수정 완료 ✏️')
            .addFields(
                { name: '경기', value: note.match.name, inline: true },
                { name: '메모 ID', value: noteId.toString(), inline: true },
                { name: '새 내용', value: newContent.length > 100 ? newContent.substring(0, 100) + '...' : newContent }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '메모 수정 중 오류가 발생했습니다!', ephemeral: true });
    }
}