const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Classify a civic issue using text (title + description) only.
 * Uses a fast Groq text model — separate from the vision model.
 *
 * @param {string} title - Complaint title
 * @param {string} description - Complaint description
 * @returns {Object} { suggestedCategory, severity, confidence, explanation }
 */
exports.classifyText = async (title = '', description = '') => {
    const text = `${title}. ${description}`.trim();
    if (!text || text === '.') {
        return {
            suggestedCategory: 'Other',
            severity: 'Medium',
            confidence: 0,
            explanation: 'No text provided for classification',
        };
    }

    try {
        const prompt = `You are a civic issue classification AI for a government complaint portal. Analyze the following citizen complaint and classify it.

Complaint:
Title: ${title || '(not provided)'}
Description: ${description || '(not provided)'}

Tasks:
1. Determine the most appropriate category for this complaint.
2. Assess the severity/urgency of the issue.
3. Rate your confidence in the classification.

Categories (pick exactly one):
- Pothole — road potholes, pits, craters on streets
- Garbage — waste dumping, overflowing bins, littering, unhygienic conditions
- Street Light — non-functional, flickering, broken, or missing street lights
- Water Leakage — pipe bursts, water main breaks, water supply issues
- Stray Animals — dangerous stray dogs, cattle on roads, animal nuisance
- Road Damage — broken roads, speed breaker issues, road cracks (not just potholes)
- Drainage — blocked drains, sewage overflow, waterlogging, flooding
- Public Safety — unsafe structures, open manholes, missing railings, fire hazards
- Electricity — exposed wires, transformer issues, power outages, electrical hazards
- Traffic — signal malfunction, illegal parking, congestion, sign damage
- Parks — damaged park equipment, overgrown vegetation, unsafe play areas
- Noise — construction noise, loudspeaker violations, industrial noise
- Other — if none of the above categories fit

Severity levels:
- Critical — immediate danger to life, health hazard, or major infrastructure failure
- High — significant inconvenience affecting many people, needs urgent attention
- Medium — moderate issue that should be addressed in normal course
- Low — minor issue, cosmetic, or very localized

Respond ONLY in this exact JSON format (no other text):
{
  "suggestedCategory": "one of the categories above",
  "severity": "Critical, High, Medium, or Low",
  "confidence": 0.0 to 1.0,
  "explanation": "brief reason for your classification"
}`;

        const chatCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.1,
        });

        const responseText = chatCompletion.choices[0]?.message?.content || '';
        console.log('AI Text Classification response:', responseText);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                suggestedCategory: result.suggestedCategory || 'Other',
                severity: result.severity || 'Medium',
                confidence: result.confidence ?? 0.5,
                explanation: result.explanation || 'No explanation provided',
            };
        }

        return {
            suggestedCategory: 'Other',
            severity: 'Medium',
            confidence: 0,
            explanation: 'Text classification failed to produce structured results',
        };
    } catch (err) {
        console.error('Groq text classification error:', err.message);
        return {
            suggestedCategory: 'Other',
            severity: 'Medium',
            confidence: 0,
            explanation: 'Classification service temporarily unavailable',
        };
    }
};
