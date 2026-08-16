import {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus
} from '@discordjs/voice';

let reconnectTimer = null;
const monitoredConnections = new WeakSet();

export async function connectToVoice(client) {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    const channel = await guild.channels.fetch(
        process.env.VOICE_CHANNEL_ID
    );

    if (!channel || !channel.isVoiceBased()) {
        throw new Error(
            'VOICE_CHANNEL_ID không hợp lệ hoặc không phải phòng voice.'
        );
    }

    let connection = getVoiceConnection(guild.id);

    // Nếu đã có connection thì chỉ yêu cầu nó vào lại.
    // KHÔNG destroy rồi tạo lại liên tục.
    if (
        connection &&
        connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
        connection.rejoin({
            channelId: channel.id,
            selfDeaf: true,
            selfMute: false
        });

        console.log(`🔄 Đang yêu cầu vào lại: ${channel.name}`);

        setupConnectionEvents(connection);

        return connection;
    }

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
    });

    setupConnectionEvents(connection);

    console.log(`🎧 Đã yêu cầu vào voice: ${channel.name}`);

    return connection;
}

function setupConnectionEvents(connection) {
    // Không gắn listener trùng mỗi lần reconnect
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
        console.log('🟢 Voice: Ready — kết nối hoàn chỉnh');
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('🔴 Voice: Disconnected');
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log('⚫ Voice: Destroyed');
    });

    connection.on('error', (error) => {
        console.error('❌ Voice networking error:', error.message);
    });
}

export function scheduleReconnect(client) {
    if (reconnectTimer) return;

    console.log('⏳ Thử vào lại sau 5 giây...');

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;

        try {
            await connectToVoice(client);
        } catch (error) {
            console.error(
                '❌ Không thể yêu cầu reconnect:',
                error.message
            );
        }
    }, 5000);
}