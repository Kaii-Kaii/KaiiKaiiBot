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

import { generateAIResponse } from './ai/geminiManager.js';

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
// HELPER: CHIA NHỎ TIN NHẮN DISCORD (> 2000 KÝ TỰ)
// =====================================================

function splitMessage(text, maxLength = 1900) {
    if (!text || text.length <= maxLength) {
        return [text];
    }

    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
        if ((currentChunk + '\n' + line).length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }

            if (line.length > maxLength) {
                for (let i = 0; i < line.length; i += maxLength) {
                    chunks.push(line.substring(i, i + maxLength));
                }
            } else {
                currentChunk = line;
            }
        } else {
            currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =====================================================
// EVENT: CLIENT READY
// =====================================================

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Bot online: ${readyClient.user.tag}`);

    // Dọn dẹp các slash command cũ nếu có
    try {
        const guild = await readyClient.guilds.fetch(GUILD_ID);
        if (guild) {
            await guild.commands.set([]);
            console.log('🧹 Đã dọn dẹp các slash command cũ trên server.');
        }
    } catch (error) {
        console.warn('⚠️ Không thể dọn slash command cũ:', error.message);
    }

    // Tự động tham gia Voice Channel 24/7
    try {
        await connectToVoice(readyClient);
    } catch (error) {
        console.error('❌ Lỗi khi tự động vào voice:', error.message);
        scheduleReconnect(readyClient, 5000);
    }
});

// =====================================================
// EVENT: MESSAGE CREATE (GEMINI AI KHI @BOT)
// =====================================================

client.on(Events.MessageCreate, async (message) => {
    // Bỏ qua tin nhắn từ bot hoặc không có client.user
    if (message.author.bot || !client.user) {
        return;
    }

    // Kiểm tra xem tin nhắn có mention (tag) bot hay không
    const botId = client.user.id;
    const isMentioned =
        message.mentions.has(client.user) ||
        message.content.includes(`<@${botId}>`) ||
        message.content.includes(`<@!${botId}>`);

    if (!isMentioned) {
        return;
    }

    // Lọc bỏ phần tag bot để lấy nội dung câu hỏi thực tế
    const mentionRegex = new RegExp(`<@!?${botId}>`, 'g');
    const prompt = message.content.replace(mentionRegex, '').trim();

    try {
        // Gửi trạng thái "đang soạn tin nhắn..."
        await message.channel.sendTyping();

        const senderName =
            message.member?.displayName || message.author.displayName || message.author.username;

        const aiResponse = await generateAIResponse(prompt, senderName);

        // Chia nhỏ câu trả lời nếu dài hơn giới hạn của Discord
        const chunks = splitMessage(aiResponse);

        for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
                await message.reply({
                    content: chunks[i],
                    allowedMentions: { repliedUser: false }
                });
            } else {
                await message.channel.send({
                    content: chunks[i]
                });
            }
        }
    } catch (error) {
        console.error('❌ Lỗi khi xử lý tin nhắn AI:', error);
        try {
            await message.reply({
                content: '❌ Có lỗi xảy ra khi xử lý câu hỏi của bạn. Vui lòng thử lại sau!',
                allowedMentions: { repliedUser: false }
            });
        } catch {
            // Bỏ qua lỗi gửi tin nhắn
        }
    }
});

// =====================================================
// EVENT: VOICE STATE UPDATE (KICK / MOVE / DISCONNECT)
// =====================================================

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (!client.user || newState.id !== client.user.id) {
        return;
    }

    if (newState.guild.id !== GUILD_ID) {
        return;
    }

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    if (oldChannel === newChannel) {
        return;
    }

    console.log(
        `🔊 Voice state thay đổi: ${oldChannel || 'none'} → ${newChannel || 'none'}`
    );

    if (newChannel === VOICE_CHANNEL_ID) {
        console.log('✅ KaiiKaii đang ở đúng phòng voice chính.');
        return;
    }

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