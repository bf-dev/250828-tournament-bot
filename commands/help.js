const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('봇 명령어와 정보를 표시합니다')
        .addStringOption(option =>
            option.setName('명령어')
                .setDescription('특정 명령어의 자세한 도움말을 확인합니다')
                .setRequired(false)
                .addChoices(
                    { name: '경기', value: '경기' },
                    { name: '스탬프', value: '스탬프' },
                    { name: '메모', value: '메모' },
                    { name: '주사위', value: '주사위' },
                    { name: '경고', value: '경고' },
                    { name: '관리', value: '관리' }
                )),

    async execute(interaction, prisma) {
        const command = interaction.options.getString('명령어');

        if (command) {
            await showSpecificHelp(interaction, command);
        } else {
            await showGeneralHelp(interaction);
        }
    },
};

async function showGeneralHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🤖 토너먼트 봇 도움말')
        .setDescription('리그 오브 레전드 토너먼트 경기와 활동을 관리하는 종합 봇입니다.')
        .addFields(
            {
                name: '🎮 경기 명령어',
                value: '`/경기` - 토너먼트 경기를 생성, 참가 및 관리',
                inline: false
            },
            {
                name: '⭐ 스탬프 명령어',
                value: '`/스탬프` - 참가 스탬프를 수집하고 순위를 확인',
                inline: false
            },
            {
                name: '📝 메모 명령어',
                value: '`/메모` - 경기 메모와 노트를 추가, 수정, 조회',
                inline: false
            },
            {
                name: '🎲 주사위 명령어',
                value: '`/주사위` - 주사위 굴리기, 동전 던지기, 랜덤 결과 생성',
                inline: false
            },
            {
                name: '⚠️ 경고 명령어',
                value: '`/경고` - 사용자 경고 관리 (관리자 명령어 포함)',
                inline: false
            },
            {
                name: '⚙️ 관리 명령어',
                value: '`/관리` - 관리자 도구 및 통계 (관리자 전용)',
                inline: false
            },
            {
                name: '❓ 더 자세한 도움말',
                value: '특정 명령어에 대한 자세한 정보는 `/도움말 <명령어>`를 사용하세요.',
                inline: false
            }
        )
        .setFooter({ 
            text: 'Tournament Bot',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function showSpecificHelp(interaction, command) {
    const helpData = {
        경기: {
            title: '🎮 경기 명령어',
            description: '토너먼트 경기 및 참가 관리',
            commands: [
                '`/경기 생성 <이름> [설명]` - 새로운 경기를 생성합니다',
                '`/경기 참가 <아이디>` - 대기 중인 경기에 참가합니다',
                '`/경기 탈퇴 <아이디>` - 대기 중인 경기에서 탈퇴합니다',
                '`/경기 목록` - 모든 경기를 나열합니다',
                '`/경기 정보 <아이디>` - 자세한 경기 정보를 확인합니다',
                '`/경기 완료 <아이디> <결과>` - 경기를 완료합니다 (관리자 전용)',
                '`/경기 삭제 <아이디>` - 경기를 삭제합니다 (관리자 전용)'
            ],
            notes: [
                '대기 중인 경기에만 참가하거나 탈퇴할 수 있습니다',
                '경기 완료 시 참가자의 경고가 자동으로 감소됩니다',
                '경기 참가자는 완료된 경기에서 스탬프를 수집할 수 있습니다'
            ]
        },
        스탬프: {
            title: '⭐ 스탬프 명령어',
            description: '참가 스탬프를 수집하고 성취를 추적',
            commands: [
                '`/스탬프 수집 <경기아이디>` - 완료된 경기에서 스탬프를 수집합니다',
                '`/스탬프 목록 [사용자]` - 자신의 스탬프 또는 다른 사용자의 스탬프를 확인합니다',
                '`/스탬프 순위` - 스탬프 순위를 확인합니다'
            ],
            notes: [
                '참가한 완료된 경기에서만 스탬프를 수집할 수 있습니다',
                '각 경기에서는 하나의 스탬프만 얻을 수 있습니다',
                '스탬프는 참가도와 활동성을 나타내는 지표입니다'
            ]
        },
        메모: {
            title: '📝 메모 명령어',
            description: '경기에 메모와 노트 추가',
            commands: [
                '`/메모 추가 <경기아이디> <내용>` - 경기에 메모를 추가합니다',
                '`/메모 목록 <경기아이디>` - 경기의 모든 메모를 나열합니다',
                '`/메모 수정 <메모아이디> <내용>` - 자신의 메모를 수정합니다',
                '`/메모 삭제 <메모아이디>` - 메모를 삭제합니다 (자신의 메모 또는 관리자)'
            ],
            notes: [
                '참가한 경기에만 메모를 추가할 수 있습니다',
                '메모는 최대 1000자까지 가능합니다',
                '자신의 메모만 수정/삭제할 수 있습니다 (관리자 제외)'
            ]
        },
        주사위: {
            title: '🎲 주사위 명령어',
            description: '랜덤 숫자 생성 및 주사위 굴리기',
            commands: [
                '`/주사위 굴리기 [면수] [개수]` - 주사위를 굴립니다 (기본: 1d6)',
                '`/주사위 d20` - 20면 주사위를 굴립니다',
                '`/주사위 동전` - 동전을 던집니다',
                '`/주사위 커스텀 <식>` - 커스텀 주사위를 굴립니다 (예: 2d6+3)'
            ],
            notes: [
                '최대 10개의 주사위까지, 주사위당 최대 100면까지 가능합니다',
                '커스텀 식은 덧셈과 뺄셈을 지원합니다',
                'D20 굴리기는 대성공(20)과 대실패(1) 메시지를 표시합니다'
            ]
        },
        경고: {
            title: '⚠️ 경고 명령어',
            description: '경고 관리 시스템',
            commands: [
                '`/경고 목록 [사용자] [활성만]` - 경고를 확인합니다',
                '`/경고 발급 <사용자> <사유>` - 경고를 발급합니다 (관리자 전용)',
                '`/경고 제거 <경고아이디>` - 경고를 제거합니다 (관리자 전용)',
                '`/경고 전체삭제 <사용자>` - 모든 경고를 삭제합니다 (관리자 전용)',
                '`/경고 통계` - 경고 통계를 확인합니다'
            ],
            notes: [
                '완료된 경기에 참가하면 경고가 자동으로 감소됩니다',
                '경고 발급 시 사용자에게 DM 알림이 전송됩니다',
                '관리자가 아닌 경우 자신의 경고만 볼 수 있습니다'
            ]
        },
        관리: {
            title: '⚙️ 관리 명령어',
            description: '관리자 도구 및 관리 (관리자 전용)',
            commands: [
                '`/관리 통계` - 종합적인 봇 통계를 확인합니다',
                '`/관리 사용자정보 <대상>` - 자세한 사용자 정보를 확인합니다',
                '`/관리 정리 [일수]` - 오래된 데이터를 정리합니다 (기본: 30일)',
                '`/관리 백업` - 데이터베이스 백업을 생성합니다',
                '`/관리 초기화 <사용자> <유형>` - 사용자 데이터를 초기화합니다'
            ],
            notes: [
                '대부분의 관리 명령어는 관리자 권한이 필요합니다',
                '정리는 오래된 완료/취소된 경기와 관련 데이터를 제거합니다',
                '백업은 봇 디렉터리에 JSON 파일로 저장됩니다'
            ]
        }
    };

    const data = helpData[command];
    if (!data) {
        await interaction.reply({ content: '명령어를 찾을 수 없습니다!', ephemeral: true });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(data.title)
        .setDescription(data.description)
        .addFields(
            { name: '명령어', value: data.commands.join('\n'), inline: false },
            { name: '참고사항', value: '• ' + data.notes.join('\n• '), inline: false }
        )
        .setFooter({ 
            text: '모든 명령어를 보려면 /도움말을 사용하세요',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}