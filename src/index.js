import 'dotenv/config';

import {
    Client,
    Events,
    GatewayIntentBits,
    ApplicationCommandOptionType
} from 'discord.js';

import { Connectors } from 'shoukaku';
import { Kazagumo } from 'kazagumo';

// =====================================================
// ENV
// =====================================================

const DISCORD_TOKEN =
    process.env.DISCORD_TOKEN;

const GUILD_ID =
    process.env.GUILD_ID;

const VOICE_CHANNEL_ID =
    process.env.VOICE_CHANNEL_ID;

// Password Lavalink cố định.
// Phải giống application.yml.
const LAVALINK_PASSWORD =
    'KaiiKaii-Lavalink-2026';

// =====================================================
// KIỂM TRA ENV
// =====================================================

if (!DISCORD_TOKEN) {
    throw new Error(
        'Thiếu DISCORD_TOKEN trong .env'
    );
}

if (!GUILD_ID) {
    throw new Error(
        'Thiếu GUILD_ID trong .env'
    );
}

if (!VOICE_CHANNEL_ID) {
    throw new Error(
        'Thiếu VOICE_CHANNEL_ID trong .env'
    );
}

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// =====================================================
// LAVALINK NODE
// =====================================================

const nodes = [
    {
        name: 'KaiiKaii-Local',

        url: '127.0.0.1:2333',

        auth: LAVALINK_PASSWORD,

        secure: false
    }
];

// =====================================================
// KAZAGUMO
// =====================================================

const kazagumo = new Kazagumo(
    {
        /*
         * QUAN TRỌNG:
         *
         * /play faded alan walker
         *
         * sẽ search SoundCloud thay vì YouTube.
         */
        defaultSearchEngine: 'soundcloud',

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

// =====================================================
// STATE
// =====================================================

let discordReady = false;
let lavalinkReady = false;

let rejoinRunning = false;

let rejoinTimer = null;

// =====================================================
// HELPER
// =====================================================

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );
}

// =====================================================
// LẤY VOICE CHANNEL HIỆN TẠI CỦA BOT
// =====================================================

function getBotVoiceChannelId() {
    if (!client.user) {
        return null;
    }

    const guild =
        client.guilds.cache.get(
            GUILD_ID
        );

    if (!guild) {
        return null;
    }

    const voiceState =
        guild.voiceStates.cache.get(
            client.user.id
        );

    return (
        voiceState?.channelId ||
        null
    );
}

// =====================================================
// TẠO / LẤY PLAYER
// =====================================================

async function ensurePlayer(
    textChannelId = VOICE_CHANNEL_ID
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

    // =================================================
    // PLAYER ĐÃ TỒN TẠI
    // =================================================

    if (player) {

        /*
         * Slash command được gọi ở channel nào
         * thì cập nhật textId channel đó.
         */
        if (textChannelId) {
            try {
                player.setTextChannel(
                    textChannelId
                );
            } catch {
                // Không quan trọng
            }
        }

        /*
         * Player tồn tại nhưng bot có thể
         * đã bị kick / kéo sang room khác.
         */
        const currentVoice =
            getBotVoiceChannelId();

        if (
            currentVoice !==
            VOICE_CHANNEL_ID
        ) {
            console.log(
                '🔄 Player còn nhưng bot sai voice. Đang đưa về room chính...'
            );

            player.setVoiceChannel(
                VOICE_CHANNEL_ID
            );
        }

        return player;
    }

    // =================================================
    // CHƯA CÓ PLAYER
    // =================================================

    console.log(
        '🎧 Đang tạo music player...'
    );

    player =
        await kazagumo.createPlayer({
            guildId:
                GUILD_ID,

            voiceId:
                VOICE_CHANNEL_ID,

            textId:
                textChannelId,

            volume:
                80
        });

    console.log(
        '🌊 KaiiKaii đã vào voice'
    );

    return player;
}

// =====================================================
// ÉP BOT QUAY LẠI ROOM CHÍNH
// =====================================================

async function forceReturnToVoice(
    reason = 'unknown'
) {
    if (
        rejoinRunning ||
        !discordReady ||
        !lavalinkReady ||
        !client.user
    ) {
        return;
    }

    const currentVoice =
        getBotVoiceChannelId();

    /*
     * Đã ở đúng room rồi
     * thì không làm gì.
     */
    if (
        currentVoice ===
        VOICE_CHANNEL_ID
    ) {
        return;
    }

    rejoinRunning = true;

    try {
        console.log(
            `🔁 KaiiKaii không ở room chính (${reason}). Đang quay lại...`
        );

        let player =
            kazagumo.players.get(
                GUILD_ID
            );

        /*
         * Nếu player vẫn còn:
         * ép Discord voice state về channel chính.
         */
        if (player) {
            player.setVoiceChannel(
                VOICE_CHANNEL_ID
            );
        } else {
            /*
             * Nếu player mất luôn:
             * tạo lại từ đầu.
             */
            player =
                await kazagumo.createPlayer({
                    guildId:
                        GUILD_ID,

                    voiceId:
                        VOICE_CHANNEL_ID,

                    textId:
                        VOICE_CHANNEL_ID,

                    volume:
                        80
                });
        }

        /*
         * Chờ Discord cập nhật voice state.
         */
        await sleep(3000);

        const afterVoice =
            getBotVoiceChannelId();

        if (
            afterVoice ===
            VOICE_CHANNEL_ID
        ) {
            console.log(
                '✅ KaiiKaii đã quay lại room chính.'
            );
        } else {
            console.warn(
                '⚠️ Chưa vào lại được voice. Watchdog sẽ thử tiếp.'
            );
        }

    } catch (error) {
        console.error(
            '❌ Rejoin voice lỗi:',
            error
        );
    } finally {
        rejoinRunning = false;
    }
}

// =====================================================
// LÊN LỊCH REJOIN
// =====================================================

function scheduleVoiceReturn(
    reason
) {
    /*
     * Tránh Discord bắn nhiều VoiceStateUpdate
     * cùng lúc làm bot spam join.
     */
    if (rejoinTimer) {
        clearTimeout(
            rejoinTimer
        );
    }

    rejoinTimer =
        setTimeout(
            async () => {
                rejoinTimer = null;

                await forceReturnToVoice(
                    reason
                );
            },
            1500
        );
}

// =====================================================
// SHOUKAKU / LAVALINK EVENTS
// =====================================================

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

        lavalinkReady = false;
    }
);

// =====================================================
// MUSIC EVENTS
// =====================================================

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
            `✅ Kết thúc: ${track?.title ||
            'Unknown'
            }`
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
         * TUYỆT ĐỐI KHÔNG destroy.
         *
         * Queue hết nhưng bot vẫn
         * treo voice 24/7.
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

// =====================================================
// DISCORD READY
// =====================================================

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

        // =============================================
        // SLASH COMMANDS
        // =============================================

        await guild.commands.set([
            {
                name:
                    'play',

                description:
                    'Phát nhạc bằng tên bài hoặc link',

                options: [
                    {
                        name:
                            'query',

                        description:
                            'Tên bài hát hoặc link',

                        type:
                            ApplicationCommandOptionType.String,

                        required:
                            true
                    }
                ]
            },

            {
                name:
                    'pause',

                description:
                    'Tạm dừng nhạc'
            },

            {
                name:
                    'resume',

                description:
                    'Tiếp tục phát nhạc'
            },

            {
                name:
                    'skip',

                description:
                    'Bỏ qua bài hiện tại'
            },

            {
                name:
                    'stop',

                description:
                    'Dừng nhạc và xoá queue'
            },

            {
                name:
                    'queue',

                description:
                    'Xem hàng đợi'
            },

            {
                name:
                    'volume',

                description:
                    'Chỉnh âm lượng',

                options: [
                    {
                        name:
                            'percent',

                        description:
                            'Âm lượng 0 - 150',

                        type:
                            ApplicationCommandOptionType.Integer,

                        required:
                            true,

                        min_value:
                            0,

                        max_value:
                            150
                    }
                ]
            }
        ]);

        console.log(
            '🎛️ Slash commands đã sẵn sàng'
        );

        // =============================================
        // AUTO JOIN KHI BOT START
        // =============================================

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

// =====================================================
// QUAN TRỌNG:
// KICK / MOVE BOT → TỰ QUAY VỀ
// =====================================================

client.on(
    Events.VoiceStateUpdate,
    (
        oldState,
        newState
    ) => {
        /*
         * Chỉ quan tâm voice state
         * của chính KaiiKaii.
         */
        if (
            !client.user ||
            newState.id !==
            client.user.id
        ) {
            return;
        }

        if (
            newState.guild.id !==
            GUILD_ID
        ) {
            return;
        }

        const oldChannel =
            oldState.channelId;

        const newChannel =
            newState.channelId;

        /*
         * Không thay đổi channel.
         */
        if (
            oldChannel ===
            newChannel
        ) {
            return;
        }

        console.log(
            `🔊 Voice thay đổi: ${oldChannel || 'none'} → ${newChannel || 'none'}`
        );

        /*
         * Bot đang đúng room chính
         * thì thôi.
         */
        if (
            newChannel ===
            VOICE_CHANNEL_ID
        ) {
            console.log(
                '✅ KaiiKaii đang ở đúng room chính.'
            );

            return;
        }

        /*
         * Nếu:
         *
         * - kick bot
         * - disconnect bot
         * - kéo bot sang room khác
         *
         * đều quay lại room chính.
         */
        scheduleVoiceReturn(
            newChannel
                ? 'bị chuyển room'
                : 'bị kick khỏi voice'
        );
    }
);

// =====================================================
// WATCHDOG 20 GIÂY
// =====================================================

setInterval(
    async () => {
        if (
            !discordReady ||
            !lavalinkReady
        ) {
            return;
        }

        const currentVoice =
            getBotVoiceChannelId();

        if (
            currentVoice !==
            VOICE_CHANNEL_ID
        ) {
            await forceReturnToVoice(
                'watchdog'
            );
        }
    },
    20000
);

// =====================================================
// INTERACTION
// =====================================================

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

        /*
         * Chỉ server chính.
         */
        if (
            interaction.guildId !==
            GUILD_ID
        ) {
            return;
        }

        try {

            // =================================================
            // /play
            // =================================================

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
                        '❌ Music player chưa sẵn sàng.'
                    );

                    return;
                }

                console.log(
                    `🔎 Tìm: ${query}`
                );

                /*
                 * Tên bài bình thường:
                 *
                 * faded alan walker
                 *
                 * => SoundCloud search
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

                // =================================================
                // PLAYLIST
                // =================================================

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
                        await player.play();
                    }

                    await interaction.editReply(
                        `📚 Đã thêm **${result.tracks.length} bài** vào queue.`
                    );

                    return;
                }

                // =================================================
                // SINGLE TRACK
                // =================================================

                const track =
                    result.tracks[0];

                player.queue.add(
                    track
                );

                if (
                    !player.playing &&
                    !player.paused
                ) {
                    await player.play();
                }

                await interaction.editReply(
                    `🎵 Đã thêm **${track.title}** — **${track.author}**`
                );

                return;
            }

            // =================================================
            // LẤY PLAYER
            // =================================================

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

            // =================================================
            // /pause
            // =================================================

            if (
                interaction.commandName ===
                'pause'
            ) {
                if (
                    !player.playing
                ) {
                    await interaction.reply(
                        '❌ Hiện không có bài đang phát.'
                    );

                    return;
                }

                player.pause(
                    true
                );

                await interaction.reply(
                    '⏸️ Đã pause.'
                );

                return;
            }

            // =================================================
            // /resume
            // =================================================

            if (
                interaction.commandName ===
                'resume'
            ) {
                if (
                    !player.paused
                ) {
                    await interaction.reply(
                        '❌ Nhạc hiện không bị pause.'
                    );

                    return;
                }

                player.pause(
                    false
                );

                await interaction.reply(
                    '▶️ Tiếp tục phát.'
                );

                return;
            }

            // =================================================
            // /skip
            // =================================================

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

                player.skip();

                await interaction.reply(
                    '⏭️ Đã skip.'
                );

                return;
            }

            // =================================================
            // /stop
            // =================================================

            if (
                interaction.commandName ===
                'stop'
            ) {
                /*
                 * Xoá toàn bộ queue.
                 */
                while (
                    player.queue.length > 0
                ) {
                    player.queue.shift();
                }

                /*
                 * Dừng bài hiện tại
                 * NHƯNG KHÔNG destroy player.
                 *
                 * Bot vẫn nằm voice.
                 */
                try {
                    await player.shoukaku.stopTrack();
                } catch {
                    // Không có bài cũng không sao.
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

            // =================================================
            // /volume
            // =================================================

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

            // =================================================
            // /queue
            // =================================================

            if (
                interaction.commandName ===
                'queue'
            ) {
                const current =
                    player.queue.current ||
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

                if (current) {
                    message +=
                        '🎵 **Đang phát**\n';

                    message +=
                        `**${current.title}** — ${current.author}\n\n`;
                }

                if (
                    player.queue.length > 0
                ) {
                    message +=
                        '📃 **Tiếp theo**\n';

                    const nextTracks =
                        Array
                            .from(
                                player.queue
                            )
                            .slice(
                                0,
                                10
                            );

                    nextTracks.forEach(
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

            const errorMessage =
                error?.message ||
                'Không xác định';

            const message =
                `❌ Lỗi: ${errorMessage}`;

            try {
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
            } catch (
            replyError
            ) {
                console.error(
                    '❌ Không gửi được error reply:',
                    replyError
                );
            }
        }
    }
);

// =====================================================
// GLOBAL ERRORS
// =====================================================

process.on(
    'unhandledRejection',
    (
        error
    ) => {
        console.error(
            '❌ Unhandled rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    (
        error
    ) => {
        console.error(
            '❌ Uncaught exception:',
            error
        );
    }
);

// =====================================================
// LOGIN
// =====================================================

client.login(
    DISCORD_TOKEN
);