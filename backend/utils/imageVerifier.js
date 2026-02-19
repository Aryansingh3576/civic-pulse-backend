const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Analyze an uploaded image to detect civic issues.
 * Uses Groq's vision model for unbiased detection.
 *
 * @param {string} imageBase64 - Base64-encoded image data (without data URI prefix)
 * @param {string} _category - Ignored (kept for API compat)
 * @param {string} _description - Ignored (kept for API compat)
 * @returns {Object} { isRelevant, confidence, detectedIssue, suggestedCategory, explanation }
 */
exports.verifyImage = async (imageBase64, _category = '', _description = '') => {
    try {
        const prompt = `You are an image analysis system for a civic issue reporting platform. Look at this image carefully and independently determine what you see.

Your task:
1. Describe what is visible in the image objectively.
2. Determine if this image shows a real civic or infrastructure issue (e.g. damaged road, overflowing garbage, broken street light, water leak, stray animals, drainage problem, electrical hazard, or public safety concern).
3. If the image does NOT show a civic issue (e.g. it is a selfie, a person, a screenshot, a meme, food, an indoor scene, a random object, etc.), you MUST set isRelevant to false and suggestedCategory to "Not a Civic Issue".

IMPORTANT: Do NOT assume the image shows a civic issue. Many uploads may be irrelevant photos. Be honest about what you actually see.

Respond ONLY in this exact JSON format (no other text):
{
  "isRelevant": true or false,
  "confidence": 0.0 to 1.0,
  "detectedIssue": "objective description of what you actually see in the image",
  "suggestedCategory": "one of: Pothole, Garbage, Street Light, Water Leakage, Stray Animals, Road Damage, Drainage, Public Safety, Electricity, Not a Civic Issue",
  "explanation": "why you chose this category"
}`;

        const chatCompletion = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 500,
            temperature: 0.1,
        });

        const responseText = chatCompletion.choices[0]?.message?.content || '';
        console.log('AI Vision response:', responseText);

        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                isRelevant: result.isRelevant ?? false,
                confidence: result.confidence ?? 0,
                detectedIssue: result.detectedIssue || 'Unable to determine',
                suggestedCategory: result.suggestedCategory || 'Other',
                explanation: result.explanation || 'No explanation provided',
            };
        }

        return {
            isRelevant: false,
            confidence: 0,
            detectedIssue: 'Unable to analyze image',
            suggestedCategory: 'Other',
            explanation: 'Image analysis failed to produce structured results',
        };
    } catch (err) {
        console.error('Groq image verification error:', err.message);
        // Fail open — don't block complaint submission if AI fails
        return {
            isRelevant: true,
            confidence: 0,
            detectedIssue: 'Verification unavailable',
            suggestedCategory: 'Other',
            explanation: 'Image verification service temporarily unavailable',
        };
    }
};
