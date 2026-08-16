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
    attachPlayerToVoice,
    playTestTone
} from './music/playerManager.js';

// ============================
// DISCORD CLIENT
// ============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================
// READY
// ============================

client.once(
    Events.ClientReady,
    async (readyClient) => {
        console.log(
            `✅ Bot đã online: ${readyClient.user.tag}`
        );

        try {
            // Kết nối voice
            await connectToVoice(readyClient);

            // Gắn AudioPlayer vào VoiceConnection
            attachPlayerToVoice(
                process.env.GUILD_ID
            );

            // ============================
            // REGISTER TEST COMMAND
            // ============================

            const guild =
                await readyClient.guilds.fetch(
                    process.env.GUILD_ID
                );

            await guild.commands.set([
                {
                    name: 'testmusic',
                    description:
                        'Test hệ thống phát âm thanh của KaiiKaii'
                }
            ]);

            console.log(
                '🎵 Music system đã sẵn sàng'
            );

            console.log(
                '🧪 Slash command /testmusic đã sẵn sàng'
            );
        } catch (error) {
            console.error(
                '❌ Khởi động bot thất bại:',
                error
            );
        }
    }
);

// ============================
// VOICE STATE
// ============================

client.on(
    Events.VoiceStateUpdate,
    (oldState, newState) => {
        // Không phải chính bot
        if (
            !client.user ||
            newState.id !== client.user.id
        ) {
            return;
        }

        // Không phải server cần theo dõi
        if (
            newState.guild.id !==
            process.env.GUILD_ID
        ) {
            return;
        }

        const targetChannelId =
            process.env.VOICE_CHANNEL_ID;

        // Đang đúng phòng
        if (
            newState.channelId ===
            targetChannelId
        ) {
            return;
        }

        // Bị disconnect
        if (!newState.channelId) {
            console.log(
                '😵 KaiiKaii bị ngắt khỏi voice'
            );
        } else {
            console.log(
                '👀 KaiiKaii bị kéo sang room khác'
            );
        }

        scheduleReconnect(client);
    }
);

// ============================
// SLASH COMMANDS
// ============================

client.on(
    Events.InteractionCreate,
    async (interaction) => {
        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        // ============================
        // /testmusic
        // ============================

        if (
            interaction.commandName ===
            'testmusic'
        ) {
            try {
                playTestTone();

                await interaction.reply({
                    content:
                        '🎵 Đang test audio 440Hz trong 3 giây!'
                });
            } catch (error) {
                console.error(
                    '❌ Test music lỗi:',
                    error
                );

                await interaction.reply({
                    content:
                        '❌ Không thể phát test audio.'
                });
            }
        }
    }
);

// ============================
// PROCESS ERROR LOGGING
// ============================

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

// ============================
// LOGIN
// ============================

client.login(
    process.env.DISCORD_TOKEN
);