import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey =
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY;

/**
 * Bot sẽ thử lần lượt từ trên xuống dưới.
 */
const MODELS = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
];

const SYSTEM_INSTRUCTION = `
Bạn là KaiiKaii, một chatbot AI hoạt động trong Discord.

Cách trả lời:
- Trả lời tự nhiên, rõ ràng và đi thẳng vào câu hỏi.
- Dùng cùng ngôn ngữ với người dùng.
- Mặc định xưng hô "mình" và "bạn".
- Nếu người dùng nói chuyện thân mật, có thể trả lời thân mật vừa phải.
- Không dùng giọng quá dễ thương hoặc quá máy móc.
- Không mở đầu mọi câu bằng "Dạ".
- Không liên tục gọi tên người dùng hoặc tự nhắc tên KaiiKaii.
- Không lạm dụng emoji.
- Ưu tiên ngắn gọn nhưng vẫn giải thích đầy đủ khi cần.
- Hỗ trợ Markdown của Discord.
- Nếu không biết hoặc không chắc, hãy nói rõ thay vì tự bịa.
`;

let genAI = null;

if (apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);

        console.log(
            `Gemini AI đã sẵn sàng. Model ưu tiên: ${MODELS[0]}`
        );
    } catch (error) {
        console.error(
            'Không thể khởi tạo Gemini AI:',
            error.message || error
        );
    }
} else {
    console.warn('Chưa cấu hình GEMINI_KEY trong file .env');
}

/**
 * Khởi tạo một model Gemini
 * @param {string} modelName
 */
function getModel(modelName) {
    if (!genAI) return null;

    return genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500
        }
    });
}

/**
 * Tạo câu trả lời từ Gemini
 * @param {string} prompt Nội dung tin nhắn
 * @param {string} userName Tên người dùng
 * @returns {Promise<string>}
 */
export async function generateAIResponse(
    prompt,
    userName = 'Người dùng'
) {
    if (!apiKey || !genAI) {
        return 'Bot chưa được cấu hình GEMINI_KEY.';
    }

    const cleanPrompt = prompt?.trim();

    if (!cleanPrompt) {
        return 'Bạn muốn hỏi gì?';
    }

    const safeUserName = String(userName).slice(0, 64);

    const fullPrompt = [
        `Tên người gửi: ${safeUserName}`,
        'Nội dung tin nhắn:',
        cleanPrompt
    ].join('\n');

    let lastError = null;
    let rateLimitedCount = 0;

    for (const modelName of MODELS) {
        try {
            console.log(`Đang thử model: ${modelName}`);

            const currentModel = getModel(modelName);

            if (!currentModel) {
                throw new Error(
                    'Gemini client chưa được khởi tạo'
                );
            }

            const result =
                await currentModel.generateContent(fullPrompt);

            const response = await result.response;
            const text = response.text()?.trim();

            if (text) {
                console.log(
                    `Đã trả lời bằng model: ${modelName}`
                );

                return text;
            }

            console.warn(
                `${modelName} trả về nội dung trống`
            );
        } catch (error) {
            lastError = error;

            const status = Number(
                error?.status ||
                error?.statusCode ||
                error?.code ||
                0
            );

            const errorMessage = String(
                error?.message || error
            ).toLowerCase();

            console.error(
                `Lỗi model ${modelName}:`,
                error.message || error
            );

            const isInvalidKey =
                status === 401 ||
                status === 403 ||
                errorMessage.includes('api_key_invalid') ||
                errorMessage.includes('api key not valid');

            if (isInvalidKey) {
                return 'GEMINI_KEY không hợp lệ. Hãy kiểm tra lại API key.';
            }

            const isRateLimited =
                status === 429 ||
                errorMessage.includes('429') ||
                errorMessage.includes('resource_exhausted') ||
                errorMessage.includes('quota exceeded') ||
                errorMessage.includes('rate limit');

            if (isRateLimited) {
                rateLimitedCount++;

                console.log(
                    `${modelName} đã hết quota hoặc đang bị giới hạn.`
                );
                console.log(
                    'Đang chuyển sang model tiếp theo...'
                );

                continue;
            }

            const isRetryable =
                [404, 500, 502, 503, 504].includes(status) ||
                errorMessage.includes('not found') ||
                errorMessage.includes('no longer available') ||
                errorMessage.includes('high demand') ||
                errorMessage.includes('service unavailable') ||
                errorMessage.includes('temporarily unavailable');

            if (isRetryable) {
                console.log(
                    'Đang chuyển sang model tiếp theo...'
                );

                continue;
            }

            break;
        }
    }

    if (rateLimitedCount > 0) {
        console.error(
            'Các model Gemini khả dụng đều đã hết quota.'
        );

        return 'Các model AI hiện đều đã hết giới hạn sử dụng trong ngày. Hãy thử lại sau.';
    }

    console.error(
        'Tất cả model Gemini đều thất bại:',
        lastError?.message || lastError
    );

    return 'Đã xảy ra lỗi khi xử lý câu trả lời. Hãy thử lại sau.';
}