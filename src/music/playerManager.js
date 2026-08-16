import {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    getVoiceConnection,
    entersState,
    VoiceConnectionStatus
} from '@discordjs/voice';

import { spawn } from 'node:child_process';

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
    }
});

const queue = [];

let currentTrack = null;
let currentResource = null;
let ffmpegProcess = null;
let activeGuildId = null;

let volume = 1;

// =============================
// PLAYER EVENTS
// =============================

player.on(AudioPlayerStatus.Playing, () => {
    console.log(
        `🎵 Đang phát: ${currentTrack?.title ?? 'Unknown'}`
    );
});

player.on(AudioPlayerStatus.Paused, () => {
    console.log('⏸️ Music paused');
});

player.on(AudioPlayerStatus.Idle, () => {
    console.log('⏹️ Track kết thúc');

    cleanupFFmpeg();

    currentTrack = null;
    currentResource = null;

    void playNext();
});

player.on('error', (error) => {
    console.error(
        '❌ Audio Player Error:',
        error.message
    );

    cleanupFFmpeg();

    currentTrack = null;
    currentResource = null;

    void playNext();
});

// =============================
// ADD TRACK
// =============================

export async function addTrack(
    guildId,
    track
) {
    activeGuildId = guildId;

    queue.push(track);

    console.log(
        `➕ Queue: ${track.title}`
    );

    // Nếu đang không phát bài nào
    if (
        player.state.status ===
        AudioPlayerStatus.Idle &&
        !currentTrack
    ) {
        await playNext();
    }

    return {
        position:
            currentTrack?.url === track.url
                ? 0
                : queue.length,
        track
    };
}

// =============================
// PLAY NEXT
// =============================

async function playNext() {
    if (!activeGuildId) {
        return;
    }

    if (queue.length === 0) {
        console.log('📭 Queue trống');
        return;
    }

    const connection =
        getVoiceConnection(activeGuildId);

    if (!connection) {
        console.error(
            '❌ Không có VoiceConnection'
        );
        return;
    }

    try {
        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            10_000
        );
    } catch {
        console.error(
            '❌ Voice chưa Ready'
        );
        return;
    }

    const track = queue.shift();

    currentTrack = track;

    cleanupFFmpeg();

    console.log(
        `🎛️ FFmpeg đang mở: ${track.title}`
    );

    ffmpegProcess = spawn(
        'ffmpeg',
        [
            '-nostdin',
            '-hide_banner',
            '-loglevel',
            'error',

            // reconnect khi stream HTTP bị ngắt
            '-reconnect',
            '1',

            '-reconnect_streamed',
            '1',

            '-reconnect_delay_max',
            '5',

            '-i',
            track.url,

            // bỏ video nếu URL có cả video
            '-vn',

            // PCM 48kHz stereo
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

    ffmpegProcess.on(
        'error',
        (error) => {
            console.error(
                '❌ FFmpeg process:',
                error.message
            );
        }
    );

    ffmpegProcess.stderr.on(
        'data',
        (data) => {
            const message =
                data.toString().trim();

            if (message) {
                console.error(
                    '❌ FFmpeg:',
                    message
                );
            }
        }
    );

    ffmpegProcess.on(
        'close',
        (code) => {
            console.log(
                `🎛️ FFmpeg exit: ${code}`
            );
        }
    );

    currentResource =
        createAudioResource(
            ffmpegProcess.stdout,
            {
                inputType:
                    StreamType.Raw,

                inlineVolume: true,

                metadata: track
            }
        );

    currentResource.volume.setVolume(
        volume
    );

    connection.subscribe(player);

    player.play(currentResource);
}

// =============================
// PAUSE
// =============================

export function pauseMusic() {
    return player.pause();
}

// =============================
// RESUME
// =============================

export function resumeMusic() {
    return player.unpause();
}

// =============================
// SKIP
// =============================

export function skipMusic() {
    if (!currentTrack) {
        return false;
    }

    player.stop(true);

    return true;
}

// =============================
// STOP
// =============================

export function stopMusic() {
    queue.length = 0;

    currentTrack = null;

    cleanupFFmpeg();

    player.stop(true);
}

// =============================
// VOLUME
// =============================

export function setVolume(percent) {
    volume = percent / 100;

    if (currentResource?.volume) {
        currentResource.volume.setVolume(
            volume
        );
    }

    return percent;
}

// =============================
// QUEUE INFO
// =============================

export function getMusicStatus() {
    return {
        current: currentTrack,

        queue: [...queue],

        volume:
            Math.round(volume * 100),

        status:
            player.state.status
    };
}

// =============================
// CLEANUP
// =============================

function cleanupFFmpeg() {
    if (!ffmpegProcess) {
        return;
    }

    try {
        ffmpegProcess.kill(
            'SIGKILL'
        );
    } catch {
        // ignore
    }

    ffmpegProcess = null;
}