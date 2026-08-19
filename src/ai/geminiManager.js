import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.7-flash'];

const SYSTEM_INSTRUCTION = `Bạn là KaiiKaii - một bot Discord thông minh, dễ thương, thân thiện và hữu ích.
Hãy trả lời người dùng một cách tự nhiên, lịch sự và súc tích.
Hỗ trợ định dạng Markdown của Discord (in đậm, danh sách, khối mã) khi cần.
Nếu người dùng nói tiếng Việt, hãy trả lời bằng tiếng Việt gần gũi.`;

let genAI = null;

if (apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        console.log(`🤖 Gemini AI đã sẵn sàng (Model mặc định: ${DEFAULT_MODEL})`);
    } catch (error) {
        console.error('❌ Không thể khởi tạo Gemini AI:', error.message);
    }
} else {
    console.warn('⚠️ Chưa cấu hình GEMINI_KEY trong file .env');
}

/**
 * Lấy GenerativeModel với systemInstruction chuẩn
 * @param {string} modelName
 */
function getModel(modelName) {
    if (!genAI) return null;
    return genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION
    });
}

/**
 * Tạo câu trả lời từ Gemini AI dựa trên prompt của người dùng
 * @param {string} prompt Nội dung câu hỏi/tin nhắn
 * @param {string} userName Tên người dùng đang trò chuyện
 * @returns {Promise<string>}
 */
export async function generateAIResponse(prompt, userName = 'Bạn') {
    if (!apiKey || !genAI) {
        return '❌ Bot chưa được cấu hình `GEMINI_KEY` hợp lệ trong .env.';
    }

    const cleanPrompt = prompt?.trim();

    if (!cleanPrompt) {
        return `Dạ KaiiKaii nghe nè ${userName}! Bạn cần mình giúp gì nào? ✨`;
    }

    const fullPrompt = `Người dùng "${userName}" hỏi: ${cleanPrompt}`;

    // Thử lần lượt các model trong danh sách (Default -> Fallback)
    const modelsToTry = [DEFAULT_MODEL, ...FALLBACK_MODELS.filter(m => m !== DEFAULT_MODEL)];

    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const currentModel = getModel(modelName);
            const result = await currentModel.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            return text || 'Dạ KaiiKaii chưa nghĩ ra câu trả lời cho câu này rồi 🥺';
        } catch (error) {
            lastError = error;
            console.error(`❌ Lỗi Gemini AI với model ${modelName}:`, error.message || error);

            // Thử fallback nếu gặp lỗi model không tồn tại (404), server quá tải / bảo trì (500, 502, 503, 504)
            const isRetryableError = 
                error.status === 404 || 
                error.status === 500 || 
                error.status === 502 || 
                error.status === 503 || 
                error.status === 504 || 
                error.message?.includes('not found') || 
                error.message?.includes('no longer available') ||
                error.message?.includes('high demand') ||
                error.message?.includes('Service Unavailable') ||
                error.message?.includes('temporarily unavailable');

            if (isRetryableError) {
                console.log(`🔄 Đang chuyển sang thử model tiếp theo trong danh sách...`);
                continue;
            }

            // Nếu lỗi do key không hợp lệ thì không cần thử model khác
            if (error.message?.includes('API_KEY_INVALID') || error.status === 400) {
                return '❌ GEMINI_KEY không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.';
            }

            if (error.status === 429) {
                return '⏳ KaiiKaii đang nhận quá nhiều câu hỏi một lúc. Vui lòng thử lại sau vài giây nhé!';
            }
        }
    }

    console.error('❌ Tất cả model Gemini đều thất bại:', lastError?.message);
    return '❌ Đã xảy ra lỗi khi xử lý câu trả lời với AI. Vui lòng thử lại sau!';
}
