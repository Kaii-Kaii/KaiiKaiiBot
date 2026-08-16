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
        const startedAt = Date.now();

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

                if (Date.now() - startedAt >= timeout) {
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
// START
// =====================================

async function start() {
    console.log('☕ Đang khởi động Lavalink...');

    const lavalinkDirectory = path.join(
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
            cwd: lavalinkDirectory,
            env: process.env,

            stdio: [
                'ignore',
                'pipe',
                'pipe'
            ]
        }
    );

    // ===============================
    // STDOUT
    // ===============================

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

    // ===============================
    // STDERR
    // ===============================

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

    // ===============================
    // PROCESS ERROR
    // ===============================

    lavalinkProcess.on(
        'error',
        (error) => {
            console.error(
                '❌ Không chạy được Lavalink:',
                error
            );
        }
    );

    // ===============================
    // LAVALINK EXIT
    // ===============================

    lavalinkProcess.on(
        'exit',
        (code) => {
            console.log(
                `⚠️ Lavalink đã thoát với code ${code}`
            );

            /*
             * Nếu Lavalink tự chết thì kill luôn
             * Node process để Discloud restart
             * cả stack.
             */
            if (!shuttingDown) {
                process.exit(1);
            }
        }
    );

    // =====================================
    // CHỜ SERVER READY
    // =====================================

    await waitForLavalink();

    console.log(
        '🌋 Lavalink đã mở port 2333!'
    );

    /*
     * Cho Lavalink ổn định thêm một tí
     * trước khi Shoukaku connect.
     */
    await new Promise(
        resolve => setTimeout(resolve, 1500)
    );

    // =====================================
    // START DISCORD BOT
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

    setTimeout(
        () => process.exit(0),
        1500
    );
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
// BOOT
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