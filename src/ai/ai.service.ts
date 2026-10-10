import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private ai: GoogleGenAI;

  constructor(private configService: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
    });
  }

  async generateDueDiligenceReport(listingDetails: any) {
    const prompt = `You are an expert AI acquisition auditor for the Digital Fortuna marketplace. Evaluate the following project and generate a due diligence report.
    Details: ${JSON.stringify(listingDetails, null, 2)}
    
    Return ONLY a JSON object with the following structure:
    {
      "summary": "string",
      "techQualityScore": 0,
      "marketOpportunity": "string",
      "risks": ["string"],
      "recommendation": "string"
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
      }
    });

    try {
      return JSON.parse(response.text!);
    } catch (e) {
      throw new Error('Failed to parse AI response');
    }
  }

  async optimizeListing(rawTitle: string, rawDescription: string) {
    const prompt = `You are an expert copywriter for Digital Fortuna, a startup acquisition marketplace. Optimize the following listing for conversion.
    Raw Title: ${rawTitle}
    Raw Description: ${rawDescription}
    
    Return ONLY a JSON object with the following structure:
    {
      "optimizedTitle": "string",
      "optimizedDescription": "string",
      "featureBullets": ["string"],
      "suggestedPriceRange": "string"
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    try {
      return JSON.parse(response.text!);
    } catch (e) {
      throw new Error('Failed to parse AI response');
    }
  }

  async analyzeStartup(prompt: string) {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    try {
      return { summary: response.text };
    } catch (e) {
      return { summary: "Failed to generate report." };
    }
  }

  async generateBusinessValuation(listing: any, financials: any[]) {
    const prompt = `You are a top-tier M&A advisor for Digital Fortuna. Given the following startup details and financial records, generate a professional business valuation report with estimated multiple (e.g., 3x-5x ARR).
    Listing: ${JSON.stringify(listing)}
    Financials: ${JSON.stringify(financials)}
    
    Return a JSON object:
    {
      "estimatedValuationMin": number,
      "estimatedValuationMax": number,
      "recommendedListPrice": number,
      "multipleUsed": "string",
      "valuationRationale": "string",
      "growthFactors": ["string"]
    }`;
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: "application/json" }
    });
    return JSON.parse(response.text!);
  }

  async buildPnLStatement(rawInputText: string) {
    const prompt = `You are an expert accountant. A startup founder has provided you with raw, unformatted financial data (e.g., pasted from a spreadsheet or bank statement).
    Raw Data: ${rawInputText}
    
    Categorize this into a standardized Profit & Loss statement.
    Return a JSON object with:
    {
      "totalRevenue": number,
      "cogs": number,
      "grossMargin": number,
      "operatingExpenses": {
        "marketing": number,
        "software": number,
        "payroll": number,
        "other": number
      },
      "netIncome": number,
      "ebitda": number,
      "summaryNotes": "string"
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.1, responseMimeType: "application/json" }
    });
    return JSON.parse(response.text!);
  }

  async generateCIM(listing: any, valuation: any, pnl: any) {
    const prompt = `You are an investment banker preparing a Confidential Information Memorandum (CIM) for a tech acquisition.
    Listing Details: ${JSON.stringify(listing)}
    Valuation: ${JSON.stringify(valuation)}
    P&L: ${JSON.stringify(pnl)}
    
    Write a highly professional, multi-section markdown document that can be presented to private equity firms and enterprise buyers. 
    Include Executive Summary, Market Opportunity, Financial Overview, Tech Stack Analysis, and Growth Potential.
    Do NOT wrap in JSON, return pure Markdown.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.5 }
    });
    return response.text;
  }

  async matchBuyers(listing: any, buyerMandates: any[]) {
    const prompt = `You are an M&A matchmaking algorithm. 
    We have a listing: ${JSON.stringify(listing)}
    We have these buyer mandates: ${JSON.stringify(buyerMandates)}
    
    Rank the buyers based on how well their mandates match the listing.
    Return a JSON array of objects:
    [{
      "buyerId": "string",
      "matchScore": number (0-100),
      "matchReason": "string"
    }]`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: "application/json" }
    });
    return JSON.parse(response.text!);
  }

  async generateLegalDocument(deal: any, listing: any, documentType: 'loi' | 'apa') {
    const docName = documentType === 'loi' ? 'Letter of Intent (LOI)' : 'Asset Purchase Agreement (APA)';
    const prompt = `You are an M&A attorney drafting a ${docName} for the acquisition of a software business on the Digital Fortuna marketplace.

Listing: ${JSON.stringify(listing)}
Deal: ${JSON.stringify({ agreedPrice: deal.agreedPrice, buyerId: deal.buyerId, sellerId: deal.sellerId, status: deal.status })}

Draft a professional ${docName} covering: parties (use placeholder names like [Buyer Legal Name]), purchase price and payment structure (escrow), assets included (code, IP, domains, accounts, customer data), due diligence and inspection period, representations and warranties, transition/handover services, non-compete terms, governing law, and signature blocks. Keep it plain-language, practical, and clearly marked as a template requiring legal review.

Return ONLY a JSON object:
{
  "title": "string",
  "documentType": "${documentType}",
  "markdown": "the full document in markdown",
  "disclaimer": "string"
}`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.3, responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text!);
  }
}
