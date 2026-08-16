import {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    getVoiceConnection
} from '@discordjs/voice';

let reconnectTimer = null;
let isConnecting = false;

export async function connectToVoice(client) {
    if (isConnecting) return;

    isConnecting = true;

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channel = await guild.channels.fetch(
            process.env.VOICE_CHANNEL_ID
        );

        if (!channel || !channel.isVoiceBased()) {
            throw new Error(
                'VOICE_CHANNEL_ID không hợp lệ hoặc không phải phòng voice.'
            );
        }

        // Nếu bot đang có connection và đã ở đúng phòng
        // thì không cần tạo lại.
        const existingConnection = getVoiceConnection(guild.id);

        if (
            existingConnection &&
            existingConnection.state.status !==
            VoiceConnectionStatus.Destroyed
        ) {
            existingConnection.rejoin({
                channelId: channel.id,
                selfDeaf: true,
                selfMute: false
            });

            await entersState(
                existingConnection,
                VoiceConnectionStatus.Ready,
                20_000
            );

            console.log(`🎧 Đã kết nối lại voice: ${channel.name}`);
            return existingConnection;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            20_000
        );

        console.log(`🎧 Đã kết nối voice: ${channel.name}`);

        return connection;
    } catch (error) {
        console.error(
            '❌ Kết nối voice thất bại:',
            error.message
        );

        scheduleReconnect(client);
    } finally {
        isConnecting = false;
    }
}

export function scheduleReconnect(client) {
    if (reconnectTimer) {
        return;
    }

    console.log('⏳ Thử vào lại voice sau 5 giây...');

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        await connectToVoice(client);
    }, 5000);
}