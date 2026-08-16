import 'dotenv/config';

import {
    Client,
    Events,
    GatewayIntentBits
} from 'discord.js';

import {
    connectToVoice,
    scheduleReconnect
} from './voice/voiceManager.js';

import {
    addTrack,
    pauseMusic,
    resumeMusic,
    skipMusic,
    stopMusic,
    setVolume,
    getMusicStatus
} from './music/playerManager.js';

// =============================
// CLIENT
// =============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// =============================
// READY
// =============================

client.once(
    Events.ClientReady,
    async (readyClient) => {
        console.log(
            `✅ Bot đã online: ${readyClient.user.tag}`
        );

        try {
            await connectToVoice(
                readyClient
            );

            const guild =
                await readyClient.guilds.fetch(
                    process.env.GUILD_ID
                );

            // Slash commands riêng server
            await guild.commands.set([
                {
                    name: 'play',
                    description:
                        'Phát hoặc thêm nhạc vào hàng đợi',

                    options: [
                        {
                            name: 'url',
                            description:
                                'Direct URL tới file/stream audio',
                            type: 3,
                            required: true
                        },

                        {
                            name: 'name',
                            description:
                                'Tên bài hát',
                            type: 3,
                            required: false
                        }
                    ]
                },

                {
                    name: 'pause',
                    description:
                        'Tạm dừng nhạc'
                },

                {
                    name: 'resume',
                    description:
                        'Tiếp tục phát nhạc'
                },

                {
                    name: 'skip',
                    description:
                        'Bỏ qua bài hiện tại'
                },

                {
                    name: 'stop',
                    description:
                        'Dừng nhạc và xoá queue'
                },

                {
                    name: 'queue',
                    description:
                        'Xem hàng đợi nhạc'
                },

                {
                    name: 'volume',
                    description:
                        'Chỉnh âm lượng',

                    options: [
                        {
                            name: 'percent',
                            description:
                                'Âm lượng từ 0 đến 150',
                            type: 4,
                            required: true,

                            min_value: 0,
                            max_value: 150
                        }
                    ]
                }
            ]);

            console.log(
                '🎵 Music commands đã sẵn sàng'
            );
        } catch (error) {
            console.error(
                '❌ Khởi động bot thất bại:',
                error
            );
        }
    }
);

// =============================
// VOICE RECONNECT
// =============================

client.on(
    Events.VoiceStateUpdate,
    (oldState, newState) => {
        if (
            !client.user ||
            newState.id !==
                client.user.id
        ) {
            return;
        }

        if (
            newState.guild.id !==
            process.env.GUILD_ID
        ) {
            return;
        }

        const target =
            process.env.VOICE_CHANNEL_ID;

        // đang ở đúng phòng
        if (
            newState.channelId ===
            target
        ) {
            return;
        }

        if (!newState.channelId) {
            console.log(
                '😵 Bot bị disconnect khỏi voice'
            );
        } else {
            console.log(
                '👀 Bot bị kéo sang room khác'
            );
        }

        scheduleReconnect(client);
    }
);

// =============================
// COMMANDS
// =============================

client.on(
    Events.InteractionCreate,
    async (interaction) => {
        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        try {
            // =====================
            // /play
            // =====================

            if (
                interaction.commandName ===
                'play'
            ) {
                const url =
                    interaction.options.getString(
                        'url',
                        true
                    );

                const customName =
                    interaction.options.getString(
                        'name'
                    );

                // URL validation
                let parsed;

                try {
                    parsed =
                        new URL(url);
                } catch {
                    await interaction.reply({
                        content:
                            '❌ URL không hợp lệ.'
                    });

                    return;
                }

                if (
                    ![
                        'http:',
                        'https:'
                    ].includes(
                        parsed.protocol
                    )
                ) {
                    await interaction.reply({
                        content:
                            '❌ Chỉ hỗ trợ HTTP/HTTPS.'
                    });

                    return;
                }

                const title =
                    customName ||
                    decodeURIComponent(
                        parsed.pathname
                            .split('/')
                            .pop()
                    ) ||
                    'Unknown Track';

                const result =
                    await addTrack(
                        interaction.guildId,
                        {
                            title,
                            url,

                            requestedBy:
                                interaction.user
                                    .username
                        }
                    );

                if (
                    result.position === 0
                ) {
                    await interaction.reply({
                        content:
                            `▶️ Đang phát **${title}**`
                    });
                } else {
                    await interaction.reply({
                        content:
                            `➕ Đã thêm **${title}** vào queue`
                    });
                }

                return;
            }

            // =====================
            // /pause
            // =====================

            if (
                interaction.commandName ===
                'pause'
            ) {
                const ok =
                    pauseMusic();

                await interaction.reply({
                    content: ok
                        ? '⏸️ Đã pause.'
                        : '❌ Không có nhạc đang phát.'
                });

                return;
            }

            // =====================
            // /resume
            // =====================

            if (
                interaction.commandName ===
                'resume'
            ) {
                const ok =
                    resumeMusic();

                await interaction.reply({
                    content: ok
                        ? '▶️ Tiếp tục phát.'
                        : '❌ Không có nhạc đang pause.'
                });

                return;
            }

            // =====================
            // /skip
            // =====================

            if (
                interaction.commandName ===
                'skip'
            ) {
                const ok =
                    skipMusic();

                await interaction.reply({
                    content: ok
                        ? '⏭️ Đã skip.'
                        : '❌ Không có bài để skip.'
                });

                return;
            }

            // =====================
            // /stop
            // =====================

            if (
                interaction.commandName ===
                'stop'
            ) {
                stopMusic();

                await interaction.reply({
                    content:
                        '⏹️ Đã dừng nhạc và xoá queue.'
                });

                return;
            }

            // =====================
            // /volume
            // =====================

            if (
                interaction.commandName ===
                'volume'
            ) {
                const value =
                    interaction.options.getInteger(
                        'percent',
                        true
                    );

                setVolume(value);

                await interaction.reply({
                    content:
                        `🔊 Volume: **${value}%**`
                });

                return;
            }

            // =====================
            // /queue
            // =====================

            if (
                interaction.commandName ===
                'queue'
            ) {
                const status =
                    getMusicStatus();

                if (
                    !status.current &&
                    status.queue.length === 0
                ) {
                    await interaction.reply({
                        content:
                            '📭 Queue đang trống.'
                    });

                    return;
                }

                let message = '';

                if (status.current) {
                    message +=
                        `🎵 **Đang phát**\n` +
                        `${status.current.title}\n\n`;
                }

                if (
                    status.queue.length >
                    0
                ) {
                    message +=
                        '📃 **Queue**\n';

                    status.queue
                        .slice(0, 10)
                        .forEach(
                            (
                                track,
                                index
                            ) => {
                                message +=
                                    `${index + 1}. ${track.title}\n`;
                            }
                        );

                    if (
                        status.queue.length >
                        10
                    ) {
                        message +=
                            `\n... và ${
                                status.queue
                                    .length -
                                10
                            } bài nữa`;
                    }
                }

                message +=
                    `\n\n🔊 Volume: ${status.volume}%`;

                await interaction.reply({
                    content: message
                });
            }
        } catch (error) {
            console.error(
                '❌ Command Error:',
                error
            );

            const message =
                `❌ Có lỗi: ${error.message}`;

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp({
                    content: message
                });
            } else {
                await interaction.reply({
                    content: message
                });
            }
        }
    }
);

// =============================
// ERROR LOGGING
// =============================

process.on(
    'unhandledRejection',
    (error) => {
        console.error(
            '❌ Unhandled Rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    (error) => {
        console.error(
            '❌ Uncaught Exception:',
            error
        );
    }
);

// =============================
// LOGIN
// =============================

client.login(
    process.env.DISCORD_TOKEN
);