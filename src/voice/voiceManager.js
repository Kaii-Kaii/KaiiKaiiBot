import {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState
} from '@discordjs/voice';

let reconnectTimer = null;
let isReconnecting = false;
const monitoredConnections = new WeakSet();

/**
 * Lấy Voice Channel ID hiện tại của Bot trong Guild
 */
export function getBotVoiceChannelId(client) {
    if (!client?.user) {
        return null;
    }

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
        return null;
    }

    const voiceState = guild.voiceStates.cache.get(client.user.id);
    return voiceState?.channelId || null;
}

/**
 * Kết nối vào phòng Voice đã cấu hình trong .env
 */
export async function connectToVoice(client) {
    const guildId = process.env.GUILD_ID;
    const targetChannelId = process.env.VOICE_CHANNEL_ID;

    if (!guildId || !targetChannelId) {
        throw new Error('Thiếu GUILD_ID hoặc VOICE_CHANNEL_ID trong .env');
    }

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(targetChannelId);

    if (!channel || !channel.isVoiceBased()) {
        throw new Error(
            `VOICE_CHANNEL_ID (${targetChannelId}) không hợp lệ hoặc không phải phòng voice.`
        );
    }

    let connection = getVoiceConnection(guild.id);

    // Nếu đã có connection nhưng ở trạng thái khác
    if (
        connection &&
        connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
        connection.rejoin({
            channelId: channel.id,
            selfDeaf: true,
            selfMute: false
        });

        setupConnectionEvents(connection, client);
        console.log(`🔄 Đang kết nối lại voice: ${channel.name}`);
        return connection;
    }

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
    });

    setupConnectionEvents(connection, client);
    console.log(`🎧 Đã yêu cầu vào voice: ${channel.name}`);

    return connection;
}

/**
 * Lắng nghe các sự kiện của Voice Connection để tự phục hồi khi ngắt kết nối
 */
function setupConnectionEvents(connection, client) {
    if (monitoredConnections.has(connection)) {
        return;
    }

    monitoredConnections.add(connection);

    connection.on(VoiceConnectionStatus.Signalling, () => {
        console.log('🟡 Voice: Signalling');
    });

    connection.on(VoiceConnectionStatus.Connecting, () => {
        console.log('🟠 Voice: Connecting');
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('🟢 Voice: Ready — KaiiKaii đã ở trong phòng voice.');
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        console.warn('🔴 Voice: Disconnected. Đang thử reconnect...');
        try {
            // Thử chờ kết nối lại trong 5 giây nếu chỉ bị ngắt tạm thời
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
            ]);
        } catch {
            // Nếu không reconnect được, hủy connection và kết nối mới
            try {
                connection.destroy();
            } catch {
                // Ignore destroy error
            }
            scheduleReconnect(client, 3000);
        }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log('⚫ Voice: Destroyed');
        scheduleReconnect(client, 3000);
    });

    connection.on('error', (error) => {
        console.error('❌ Voice networking error:', error.message);
    });
}

/**
 * Kiểm tra và ép bot quay về đúng phòng voice chính nếu bị kéo đi hoặc kick
 */
export async function checkAndReturnToVoice(client, reason = 'unknown') {
    if (isReconnecting || !client?.user) {
        return;
    }

    const targetChannelId = process.env.VOICE_CHANNEL_ID;
    const currentVoice = getBotVoiceChannelId(client);

    if (currentVoice === targetChannelId) {
        return;
    }

    isReconnecting = true;
    console.log(
        `🔁 KaiiKaii không ở room chính (${reason}). Đang quay lại phòng voice...`
    );

    try {
        await connectToVoice(client);
    } catch (error) {
        console.error('❌ Lỗi khi quay lại voice:', error.message);
    } finally {
        isReconnecting = false;
    }
}

/**
 * Lên lịch reconnect (tránh spam nhiều lệnh liên tiếp)
 */
export function scheduleReconnect(client, delayMs = 3000) {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        await checkAndReturnToVoice(client, 'scheduled reconnect');
    }, delayMs);
}