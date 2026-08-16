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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Bot đã online: ${readyClient.user.tag}`);

    try {
        await connectToVoice(readyClient);
    } catch (error) {
        console.error('❌ Không thể vào voice:', error.message);
    }
});

client.on(
    Events.VoiceStateUpdate,
    (oldState, newState) => {
        if (newState.id !== client.user.id) return;

        if (newState.guild.id !== process.env.GUILD_ID) return;

        const targetChannelId =
            process.env.VOICE_CHANNEL_ID;

        // Đang ở đúng phòng -> kệ nó
        if (newState.channelId === targetChannelId) {
            return;
        }

        // Bị disconnect hoặc bị kéo sang room khác
        if (!newState.channelId) {
            console.log('😵 Bot bị đá khỏi voice.');
        } else {
            console.log('👀 Bot bị kéo sang room khác.');
        }

        scheduleReconnect(client);
    }
);

client.login(process.env.DISCORD_TOKEN);