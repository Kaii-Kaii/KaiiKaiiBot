import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const PORT = 2333;

let lavalinkProcess = null;
let shuttingDown = false;

// =====================================
// CHỜ LAVALINK MỞ PORT
// =====================================

function waitForLavalink(timeout = 120000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        function check() {
            const socket = net.createConnection({
                host: '127.0.0.1',
                port: PORT
            });

            socket.once('connect', () => {
                socket.destroy();

                resolve();
            });

            socket.once('error', () => {
                socket.destroy();

                if (Date.now() - started >= timeout) {
                    reject(
                        new Error(
                            'Lavalink khởi động quá 120 giây.'
                        )
                    );

                    return;
                }

                setTimeout(check, 1000);
            });
        }

        check();
    });
}

// =====================================
// KHỞI ĐỘNG
// =====================================

async function start() {
    console.log('☕ Đang khởi động Lavalink...');

    const lavalinkDir = path.join(
        process.cwd(),
        'lavalink'
    );

    lavalinkProcess = spawn(
        'java',
        [
            '-Xms96M',
            '-Xmx450M',
            '-jar',
            'Lavalink.jar'
        ],
        {
            cwd: lavalinkDir,

            env: process.env,

            stdio: [
                'ignore',
                'pipe',
                'pipe'
            ]
        }
    );

    // =====================================
    // LAVALINK LOG
    // =====================================

    lavalinkProcess.stdout.on(
        'data',
        (data) => {
            const message =
                data.toString().trim();

            if (message) {
                console.log(
                    `[Lavalink] ${message}`
                );
            }
        }
    );

    lavalinkProcess.stderr.on(
        'data',
        (data) => {
            const message =
                data.toString().trim();

            if (message) {
                console.error(
                    `[Lavalink] ${message}`
                );
            }
        }
    );

    lavalinkProcess.on(
        'error',
        (error) => {
            console.error(
                '❌ Không chạy được Lavalink:',
                error
            );
        }
    );

    lavalinkProcess.on(
        'exit',
        (code) => {
            console.log(
                `⚠️ Lavalink đã thoát với code ${code}`
            );

            // Lavalink tự chết thì cho cả app restart
            if (!shuttingDown) {
                process.exit(1);
            }
        }
    );

    // =====================================
    // CHỜ LAVALINK READY
    // =====================================

    await waitForLavalink();

    console.log(
        '🌋 Lavalink đã mở port 2333!'
    );

    // =====================================
    // SAU KHI LAVALINK SỐNG
    // MỚI KHỞI ĐỘNG DISCORD BOT
    // =====================================

    console.log(
        '🤖 Đang khởi động KaiiKaii...'
    );

    await import('./index.js');
}

// =====================================
// SHUTDOWN
// =====================================

function shutdown() {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        '🛑 Đang tắt KaiiKaii...'
    );

    if (lavalinkProcess) {
        try {
            lavalinkProcess.kill(
                'SIGTERM'
            );
        } catch (error) {
            console.error(
                '❌ Không tắt được Lavalink:',
                error
            );
        }
    }

    setTimeout(() => {
        process.exit(0);
    }, 1500);
}

process.on(
    'SIGINT',
    shutdown
);

process.on(
    'SIGTERM',
    shutdown
);

// =====================================
// START
// =====================================

start().catch(
    (error) => {
        console.error(
            '❌ Bootstrap lỗi:',
            error
        );

        process.exit(1);
    }
);