import 'dotenv/config';

import {
    Client,
    Events,
    GatewayIntentBits,
    ApplicationCommandOptionType
} from 'discord.js';

import {
    Connectors
} from 'shoukaku';

import {
    Kazagumo
} from 'kazagumo';

// =====================================
// ENV
// =====================================

const DISCORD_TOKEN =
    process.env.DISCORD_TOKEN;

const GUILD_ID =
    process.env.GUILD_ID;

const VOICE_CHANNEL_ID =
    process.env.VOICE_CHANNEL_ID;

const MUSIC_TEXT_CHANNEL_ID =
    process.env.MUSIC_TEXT_CHANNEL_ID ||
    VOICE_CHANNEL_ID;

const LAVALINK_PASSWORD =
    process.env.LAVALINK_PASSWORD ||
    'kaiikaii-local';

// =====================================
// KIỂM TRA ENV
// =====================================

if (!DISCORD_TOKEN) {
    throw new Error(
        'Thiếu DISCORD_TOKEN.'
    );
}

if (!GUILD_ID) {
    throw new Error(
        'Thiếu GUILD_ID.'
    );
}

if (!VOICE_CHANNEL_ID) {
    throw new Error(
        'Thiếu VOICE_CHANNEL_ID.'
    );
}

// =====================================
// DISCORD CLIENT
// =====================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// =====================================
// LAVALINK NODES
// =====================================

const nodes = [
    {
        name: 'KaiiKaii-Local',

        url: '127.0.0.1:2333',

        auth: LAVALINK_PASSWORD,

        secure: false
    }
];

// Shoukaku node config dùng `url`, `auth`, `secure` theo API hiện tại.

// =====================================
// KAZAGUMO
// =====================================

const kazagumo = new Kazagumo(
    {
        /*
         * Khi user nhập text bình thường:
         *
         * /play faded alan walker
         *
         * Kazagumo sẽ dùng YouTube search.
         */
        defaultSearchEngine: 'youtube',

        /*
         * Cực kỳ quan trọng:
         * gửi voice payload từ Lavalink connector
         * về Discord gateway.
         */
        send: (
            guildId,
            payload
        ) => {
            const guild =
                client.guilds.cache.get(
                    guildId
                );

            if (guild) {
                guild.shard.send(
                    payload
                );
            }
        }
    },

    new Connectors.DiscordJS(
        client
    ),

    nodes
);

// =====================================
// STATE
// =====================================

let discordReady = false;
let lavalinkReady = false;

// =====================================
// TẠO / GIỮ PLAYER 24/7
// =====================================

async function ensurePlayer(
    textChannelId = MUSIC_TEXT_CHANNEL_ID
) {
    if (
        !discordReady ||
        !lavalinkReady
    ) {
        return null;
    }

    let player =
        kazagumo.players.get(
            GUILD_ID
        );

    // Nếu đã tồn tại thì dùng lại
    if (player) {
        return player;
    }

    console.log(
        '🎧 Đang tạo music player...'
    );

    player =
        await kazagumo.createPlayer({
            guildId: GUILD_ID,

            textId:
                textChannelId,

            voiceId:
                VOICE_CHANNEL_ID,

            volume: 80
        });

    console.log(
        '🌊 KaiiKaii đã vào voice'
    );

    return player;
}

// =====================================
// LAVALINK EVENTS
// =====================================

kazagumo.shoukaku.on(
    'ready',
    async (name) => {
        console.log(
            `🌋 Lavalink Ready: ${name}`
        );

        lavalinkReady = true;

        try {
            await ensurePlayer();
        } catch (error) {
            console.error(
                '❌ Không tạo được player:',
                error
            );
        }
    }
);

kazagumo.shoukaku.on(
    'error',
    (
        name,
        error
    ) => {
        console.error(
            `❌ Lavalink ${name}:`,
            error
        );
    }
);

kazagumo.shoukaku.on(
    'close',
    (
        name,
        code,
        reason
    ) => {
        console.warn(
            `⚠️ Lavalink ${name} đóng:`,
            code,
            reason || ''
        );
    }
);

kazagumo.shoukaku.on(
    'disconnect',
    (
        name,
        count
    ) => {
        console.warn(
            `🔌 Lavalink ${name} disconnect. Players: ${count}`
        );

        lavalinkReady = false;
    }
);

// =====================================
// KAZAGUMO MUSIC EVENTS
// =====================================

kazagumo.on(
    'playerStart',
    (
        player,
        track
    ) => {
        player.data.set(
            'currentTrack',
            track
        );

        console.log(
            `🎵 Đang phát: ${track.title} — ${track.author}`
        );
    }
);

kazagumo.on(
    'playerEnd',
    (
        player,
        track
    ) => {
        console.log(
            `✅ Kết thúc: ${track?.title || 'Unknown'}`
        );

        player.data.set(
            'currentTrack',
            null
        );
    }
);

kazagumo.on(
    'playerEmpty',
    (
        player
    ) => {
        /*
         * KHÔNG destroy player.
         *
         * Khác sample Kazagumo mặc định:
         * bot của mình phải ở voice 24/7.
         */

        player.data.set(
            'currentTrack',
            null
        );

        console.log(
            '📭 Queue trống — KaiiKaii vẫn ở voice.'
        );
    }
);

// =====================================
// DISCORD READY
// =====================================

client.once(
    Events.ClientReady,
    async (
        readyClient
    ) => {
        console.log(
            `✅ Bot online: ${readyClient.user.tag}`
        );

        discordReady = true;

        const guild =
            await readyClient.guilds.fetch(
                GUILD_ID
            );

        // =================================
        // REGISTER SLASH COMMANDS
        // =================================

        await guild.commands.set([
            {
                name: 'play',

                description:
                    'Phát nhạc bằng tên bài, YouTube hoặc Spotify',

                options: [
                    {
                        name: 'query',

                        description:
                            'Tên bài hát hoặc link',

                        type:
                            ApplicationCommandOptionType.String,

                        required: true
                    }
                ]
            },

            {
                name: 'pause',

                description:
                    'Tạm dừng bài đang phát'
            },

            {
                name: 'resume',

                description:
                    'Tiếp tục bài đang pause'
            },

            {
                name: 'skip',

                description:
                    'Bỏ qua bài hiện tại'
            },

            {
                name: 'stop',

                description:
                    'Dừng nhạc và xoá toàn bộ queue'
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

                        type:
                            ApplicationCommandOptionType.Integer,

                        required: true,

                        min_value: 0,
                        max_value: 150
                    }
                ]
            }
        ]);

        console.log(
            '🎛️ Slash commands đã sẵn sàng'
        );

        /*
         * Nếu Lavalink Ready trước Discord
         * thì đoạn này sẽ tạo player.
         */
        try {
            await ensurePlayer();
        } catch (error) {
            console.error(
                '❌ Auto join voice lỗi:',
                error
            );
        }
    }
);

// =====================================
// INTERACTION HANDLER
// =====================================

client.on(
    Events.InteractionCreate,
    async (
        interaction
    ) => {
        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        if (
            interaction.guildId !==
            GUILD_ID
        ) {
            return;
        }

        try {

            // =================================
            // /play
            // =================================

            if (
                interaction.commandName ===
                'play'
            ) {
                await interaction.deferReply();

                const query =
                    interaction.options.getString(
                        'query',
                        true
                    );

                const player =
                    await ensurePlayer(
                        interaction.channelId
                    );

                if (!player) {
                    await interaction.editReply(
                        '❌ Lavalink chưa sẵn sàng.'
                    );

                    return;
                }

                console.log(
                    `🔎 Tìm: ${query}`
                );

                /*
                 * Nếu query là:
                 *
                 * "faded alan walker"
                 * -> YouTube search
                 *
                 * youtube.com/... / youtu.be/...
                 * -> YouTube source plugin
                 *
                 * open.spotify.com/...
                 * -> LavaSrc Spotify
                 */
                const result =
                    await kazagumo.search(
                        query,
                        {
                            requester:
                                interaction.user
                        }
                    );

                if (
                    !result.tracks ||
                    result.tracks.length === 0
                ) {
                    await interaction.editReply(
                        '❌ Không tìm thấy bài nào.'
                    );

                    return;
                }

                // =============================
                // PLAYLIST
                // =============================

                if (
                    result.type ===
                    'PLAYLIST'
                ) {
                    player.queue.add(
                        result.tracks
                    );

                    if (
                        !player.playing &&
                        !player.paused
                    ) {
                        player.play();
                    }

                    await interaction.editReply(
                        `📚 Đã thêm **${result.tracks.length} bài** vào queue.`
                    );

                    return;
                }

                // =============================
                // SINGLE TRACK
                // =============================

                const track =
                    result.tracks[0];

                player.queue.add(
                    track
                );

                if (
                    !player.playing &&
                    !player.paused
                ) {
                    player.play();
                }

                await interaction.editReply(
                    `🎵 Đã thêm **${track.title}** — **${track.author}**`
                );

                return;
            }

            // =================================
            // PLAYER
            // =================================

            const player =
                kazagumo.players.get(
                    interaction.guildId
                );

            if (!player) {
                await interaction.reply(
                    '❌ Music player chưa sẵn sàng.'
                );

                return;
            }

            // =================================
            // /pause
            // =================================

            if (
                interaction.commandName ===
                'pause'
            ) {
                if (!player.playing) {
                    await interaction.reply(
                        '❌ Hiện không có bài đang phát.'
                    );

                    return;
                }

                await player.pause(
                    true
                );

                await interaction.reply(
                    '⏸️ Đã pause.'
                );

                return;
            }

            // =================================
            // /resume
            // =================================

            if (
                interaction.commandName ===
                'resume'
            ) {
                if (!player.paused) {
                    await interaction.reply(
                        '❌ Nhạc hiện không bị pause.'
                    );

                    return;
                }

                await player.pause(
                    false
                );

                await interaction.reply(
                    '▶️ Tiếp tục phát.'
                );

                return;
            }

            // =================================
            // /skip
            // =================================

            if (
                interaction.commandName ===
                'skip'
            ) {
                if (
                    !player.playing &&
                    !player.paused
                ) {
                    await interaction.reply(
                        '❌ Không có bài để skip.'
                    );

                    return;
                }

                await player.skip();

                await interaction.reply(
                    '⏭️ Đã skip.'
                );

                return;
            }

            // =================================
            // /stop
            // =================================

            if (
                interaction.commandName ===
                'stop'
            ) {
                /*
                 * Xoá queue
                 */
                while (
                    player.queue.length > 0
                ) {
                    player.queue.shift();
                }

                /*
                 * Stop track hiện tại trực tiếp
                 * ở Shoukaku.
                 *
                 * KHÔNG destroy player
                 * -> bot vẫn ở voice.
                 */
                try {
                    await player.shoukaku.stopTrack();
                } catch {
                    // Không có track cũng không sao
                }

                player.data.set(
                    'currentTrack',
                    null
                );

                await interaction.reply(
                    '⏹️ Đã dừng nhạc và xoá queue. KaiiKaii vẫn ở voice.'
                );

                return;
            }

            // =================================
            // /volume
            // =================================

            if (
                interaction.commandName ===
                'volume'
            ) {
                const percent =
                    interaction.options.getInteger(
                        'percent',
                        true
                    );

                await player.setVolume(
                    percent
                );

                await interaction.reply(
                    `🔊 Volume: **${percent}%**`
                );

                return;
            }

            // =================================
            // /queue
            // =================================

            if (
                interaction.commandName ===
                'queue'
            ) {
                const current =
                    player.data.get(
                        'currentTrack'
                    );

                if (
                    !current &&
                    player.queue.length === 0
                ) {
                    await interaction.reply(
                        '📭 Queue đang trống.'
                    );

                    return;
                }

                let message = '';

                // Current
                if (current) {
                    message +=
                        '🎵 **Đang phát**\n';

                    message +=
                        `**${current.title}** — ${current.author}\n\n`;
                }

                // Queue
                if (
                    player.queue.length > 0
                ) {
                    message +=
                        '📃 **Tiếp theo**\n';

                    player.queue
                        .slice(0, 10)
                        .forEach(
                            (
                                track,
                                index
                            ) => {
                                message +=
                                    `${index + 1}. ${track.title} — ${track.author}\n`;
                            }
                        );

                    if (
                        player.queue.length >
                        10
                    ) {
                        message +=
                            `\n... và **${player.queue.length - 10}** bài nữa`;
                    }
                }

                await interaction.reply(
                    message
                );

                return;
            }

        } catch (error) {
            console.error(
                '❌ Command error:',
                error
            );

            const message =
                `❌ Lỗi: ${error?.message ||
                'Không xác định'
                }`;

            if (
                interaction.deferred
            ) {
                await interaction.editReply(
                    message
                );
            } else if (
                interaction.replied
            ) {
                await interaction.followUp(
                    message
                );
            } else {
                await interaction.reply(
                    message
                );
            }
        }
    }
);

// =====================================
// GLOBAL ERRORS
// =====================================

process.on(
    'unhandledRejection',
    (error) => {
        console.error(
            '❌ Unhandled rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    (error) => {
        console.error(
            '❌ Uncaught exception:',
            error
        );
    }
);

// =====================================
// LOGIN
// =====================================

client.login(
    DISCORD_TOKEN
);