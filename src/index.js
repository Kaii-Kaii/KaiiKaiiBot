import 'dotenv/config';
import {
    Client,
    Events,
    GatewayIntentBits
} from 'discord.js';

import {
    connectToVoice,
    checkAndReturnToVoice,
    scheduleReconnect
} from './voice/voiceManager.js';

// =====================================================
// ENV & CONFIG
// =====================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

if (!DISCORD_TOKEN) {
    throw new Error('Thiếu DISCORD_TOKEN trong .env');
}

if (!GUILD_ID) {
    throw new Error('Thiếu GUILD_ID trong .env');
}

if (!VOICE_CHANNEL_ID) {
    throw new Error('Thiếu VOICE_CHANNEL_ID trong .env');
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
// EVENT: CLIENT READY
// =====================================================

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Bot online: ${readyClient.user.tag}`);

    // Dọn dẹp các slash command nhạc cũ nếu có trên Guild
    try {
        const guild = await readyClient.guilds.fetch(GUILD_ID);
        if (guild) {
            await guild.commands.set([]);
            console.log('🧹 Đã dọn dẹp các slash command nhạc cũ trên server.');
        }
    } catch (error) {
        console.warn('⚠️ Không thể xóa slash command cũ:', error.message);
    }

    // Tự động tham gia Voice Channel
    try {
        await connectToVoice(readyClient);
    } catch (error) {
        console.error('❌ Lỗi khi tự động vào voice:', error.message);
        scheduleReconnect(readyClient, 5000);
    }
});

// =====================================================
// EVENT: VOICE STATE UPDATE (KICK / MOVE / DISCONNECT)
// =====================================================

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // Chỉ xử lý voice state của chính bot KaiiKaii
    if (!client.user || newState.id !== client.user.id) {
        return;
    }

    if (newState.guild.id !== GUILD_ID) {
        return;
    }

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    // Không có sự thay đổi phòng
    if (oldChannel === newChannel) {
        return;
    }

    console.log(
        `🔊 Voice state thay đổi: ${oldChannel || 'none'} → ${newChannel || 'none'}`
    );

    // Bot đang ở đúng room chính
    if (newChannel === VOICE_CHANNEL_ID) {
        console.log('✅ KaiiKaii đang ở đúng phòng voice chính.');
        return;
    }

    // Nếu bị kick hoặc kéo sang phòng khác, tự động quay lại
    const reason = newChannel ? 'bị chuyển phòng' : 'bị kick khỏi voice';
    console.log(`⚠️ Bot ${reason}, chuẩn bị quay lại phòng chính...`);
    scheduleReconnect(client, 2000);
});

// =====================================================
// WATCHDOG: KIỂM TRA ĐỊNH KỲ MỖI 30 GIÂY
// =====================================================

setInterval(async () => {
    if (!client.isReady()) {
        return;
    }
    await checkAndReturnToVoice(client, 'watchdog');
}, 30_000);

// =====================================================
// GLOBAL ERROR HANDLING
// =====================================================

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

// =====================================================
// LOGIN
// =====================================================

client.login(DISCORD_TOKEN);