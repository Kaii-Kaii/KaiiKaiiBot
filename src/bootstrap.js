import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const PORT = 2333;

let lavalinkProcess = null;
let shuttingDown = false;

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

    lavalinkProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();

        if (message) {
            console.log(`[Lavalink] ${message}`);
        }
    });

    lavalinkProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();

        if (message) {
            console.error(`[Lavalink] ${message}`);
        }
    });

    lavalinkProcess.on('error', (error) => {
        console.error(
            '❌ Không chạy được Lavalink:',
            error
        );
    });

    lavalinkProcess.on('exit', (code) => {
        console.log(
            `⚠️ Lavalink đã thoát với code ${code}`
        );

        if (!shuttingDown) {
            process.exit(1);
        }
    });

    await waitForLavalink();

    console.log(
        '🌋 Lavalink đã mở port 2333!'
    );

    /*
     * Chưa import bot ở phase test này.
     * Khi Lavalink chạy ổn mình nối index.js sau.
     */
}

function shutdown() {
    shuttingDown = true;

    if (lavalinkProcess) {
        lavalinkProcess.kill('SIGTERM');
    }

    setTimeout(() => {
        process.exit(0);
    }, 1500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((error) => {
    console.error(
        '❌ Bootstrap lỗi:',
        error
    );

    process.exit(1);
});