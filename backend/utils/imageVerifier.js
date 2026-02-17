const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Verify if an uploaded image is relevant to the complaint category.
 * Uses Groq's vision model to analyze the image.
 *
 * @param {string} imageBase64 - Base64-encoded image data
 * @param {string} category - The complaint category (e.g., "Pothole", "Garbage")
 * @param {string} description - Optional complaint description for context
 * @returns {Object} { isRelevant, confidence, detectedIssue, explanation }
 */
exports.verifyImage = async (imageBase64, category, description = '') => {
    try {
        const prompt = `You are a civic issue image verification system. Analyze this image and determine:

1. What civic/infrastructure issue is visible in the image?
2. Is the image relevant to the category "${category}"?
3. Does the image appear to be a genuine photo of a civic issue (not a screenshot, meme, or unrelated image)?

Respond ONLY in this exact JSON format:
{
  "isRelevant": true/false,
  "confidence": 0.0-1.0,
  "detectedIssue": "brief description of what you see",
  "suggestedCategory": "most appropriate category from: Pothole, Garbage, Street Light, Water Leakage, Stray Animals, Road Damage, Drainage, Public Safety, Electricity, Other",
  "explanation": "brief explanation of your assessment"
}`;

        const chatCompletion = await groq.chat.completions.create({
            model: 'llama-4-scout-17b-16e-instruct',
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
            suggestedCategory: category || 'Other',
            explanation: 'Image verification service temporarily unavailable',
        };
    }
};
