import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedProduct {
  name: string;
  originalPrice: number;
}

export async function extractProductsFromImage(base64Image: string, mimeType: string): Promise<ExtractedProduct[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: "Extract the products and their prices from this image. Return a JSON array of objects, where each object has a 'name' (string) and 'originalPrice' (number). Ensure the price is a number. If the price is not in USD, try to convert it to USD, or just extract the number if it's already in USD.",
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Product name" },
            originalPrice: { type: Type.NUMBER, description: "Price in USD" },
          },
          required: ["name", "originalPrice"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function getExchangeRate(baseCurrency: string, targetCurrency: string): Promise<number> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `What is the current live exchange rate from ${baseCurrency} to ${targetCurrency}? Return ONLY the numeric multiplier value. No text, no symbols.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    // Extract the first valid number from the response
    const match = response.text?.match(/\d+(\.\d+)?/);
    if (match) {
      return parseFloat(match[0]);
    }
    // Fallback if AI fails to format properly
    return 36.5; // Approximate fallback for USD to TRY
  } catch (e) {
    console.error("Failed to fetch exchange rate", e);
    return 36.5; // Fallback
  }
}
