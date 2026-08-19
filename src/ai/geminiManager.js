import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

let genAI = null;
let model = null;

if (apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: `Bạn là KaiiKaii - một bot Discord thông minh, dễ thương, thân thiện và hữu ích.
Hãy trả lời người dùng một cách tự nhiên, lịch sự và súc tích.
Hỗ trợ định dạng Markdown của Discord (in đậm, danh sách, khối mã) khi cần.
Nếu người dùng nói tiếng Việt, hãy trả lời bằng tiếng Việt gần gũi.`
        });
        console.log('🤖 Gemini AI đã sẵn sàng (Model: gemini-2.0-flash)');
    } catch (error) {
        console.error('❌ Không thể khởi tạo Gemini AI:', error.message);
    }
} else {
    console.warn('⚠️ Chưa cấu hình GEMINI_KEY trong file .env');
}

/**
 * Tạo câu trả lời từ Gemini AI dựa trên prompt của người dùng
 * @param {string} prompt Nội dung câu hỏi/tin nhắn
 * @param {string} userName Tên người dùng đang trò chuyện
 * @returns {Promise<string>}
 */
export async function generateAIResponse(prompt, userName = 'Bạn') {
    if (!apiKey || !model) {
        return '❌ Bot chưa được cấu hình `GEMINI_KEY` hợp lệ trong .env.';
    }

    const cleanPrompt = prompt?.trim();

    if (!cleanPrompt) {
        return `Dạ KaiiKaii nghe nè ${userName}! Bạn cần mình giúp gì nào? ✨`;
    }

    try {
        const fullPrompt = `Người dùng "${userName}" hỏi: ${cleanPrompt}`;
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        return text || 'Dạ KaiiKaii chưa nghĩ ra câu trả lời cho câu này rồi 🥺';
    } catch (error) {
        console.error('❌ Lỗi Gemini AI:', error);

        // Fallback model gemini-1.5-flash nếu model gemini-2.0-flash gặp lỗi
        if (genAI && (error.status === 404 || error.message?.includes('not found'))) {
            try {
                const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                const fallbackResult = await fallbackModel.generateContent(cleanPrompt);
                return (await fallbackResult.response).text();
            } catch (fallbackError) {
                console.error('❌ Fallback Gemini lỗi:', fallbackError.message);
            }
        }

        if (error.message?.includes('API_KEY_INVALID') || error.status === 400) {
            return '❌ GEMINI_KEY không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.';
        }

        if (error.status === 429) {
            return '⏳ KaiiKaii đang nhận quá nhiều câu hỏi một lúc. Vui lòng thử lại sau vài giây nhé!';
        }

        return '❌ Đã xảy ra lỗi khi xử lý câu trả lời với AI. Vui lòng thử lại sau!';
    }
}
