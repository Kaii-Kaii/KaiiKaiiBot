import {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    getVoiceConnection
} from '@discordjs/voice';

import { spawn } from 'node:child_process';

// ============================
// AUDIO PLAYER
// ============================

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
    }
});

// ============================
// PLAYER EVENTS
// ============================

player.on(AudioPlayerStatus.Playing, () => {
    console.log('🎵 Audio đang phát');
});

player.on(AudioPlayerStatus.Paused, () => {
    console.log('⏸️ Audio đang pause');
});

player.on(AudioPlayerStatus.Idle, () => {
    console.log('⏹️ Audio đã dừng');
});

player.on('error', (error) => {
    console.error(
        '❌ Audio Player Error:',
        error.message
    );
});

// ============================
// ATTACH PLAYER TO VOICE
// ============================

export function attachPlayerToVoice(guildId) {
    const connection = getVoiceConnection(guildId);

    if (!connection) {
        throw new Error(
            'Không tìm thấy VoiceConnection.'
        );
    }

    connection.subscribe(player);

    console.log('🔊 Audio player đã gắn vào voice');

    return player;
}

// ============================
// TEST AUDIO
// ============================

export function playTestTone() {
    console.log('🧪 Đang tạo test tone bằng FFmpeg...');

    const ffmpeg = spawn(
        'ffmpeg',
        [
            '-hide_banner',
            '-loglevel',
            'error',

            // Tạo tone 440Hz trong 3 giây
            '-f',
            'lavfi',

            '-i',
            'sine=frequency=440:duration=3',

            // Output raw PCM
            '-f',
            's16le',

            '-ar',
            '48000',

            '-ac',
            '2',

            'pipe:1'
        ],
        {
            stdio: [
                'ignore',
                'pipe',
                'pipe'
            ]
        }
    );

    ffmpeg.on('error', (error) => {
        console.error(
            '❌ Không chạy được FFmpeg:',
            error.message
        );
    });

    ffmpeg.stderr.on('data', (data) => {
        const message = data
            .toString()
            .trim();

        if (message) {
            console.error(
                '❌ FFmpeg:',
                message
            );
        }
    });

    const resource = createAudioResource(
        ffmpeg.stdout,
        {
            inputType: StreamType.Raw
        }
    );

    player.play(resource);
}

// ============================
// CONTROLS
// ============================

export function pauseMusic() {
    return player.pause();
}

export function resumeMusic() {
    return player.unpause();
}

export function stopMusic() {
    player.stop(true);
}

export function getPlayer() {
    return player;
}