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

    await connectToVoice(readyClient);
});

client.on(
    Events.VoiceStateUpdate,
    (oldState, newState) => {

        // Chỉ theo dõi chính KaiiKaii
        if (newState.id !== client.user.id) {
            return;
        }

        if (newState.guild.id !== process.env.GUILD_ID) {
            return;
        }

        const targetChannelId =
            process.env.VOICE_CHANNEL_ID;

        // Đang ở đúng phòng -> không làm gì hết
        if (newState.channelId === targetChannelId) {
            return;
        }

        // Bị disconnect
        if (newState.channelId === null) {
            console.log('😵 Bot bị ngắt khỏi voice.');
            scheduleReconnect(client);
            return;
        }

        // Bị kéo sang phòng khác
        console.log(
            `👀 Bot bị chuyển sang room khác, đang quay về...`
        );

        scheduleReconnect(client);
    }
);

client.login(process.env.DISCORD_TOKEN);