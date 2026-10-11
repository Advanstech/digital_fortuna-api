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

  async generateValuationNarrative(listing: any, report: any, comparables: any[]): Promise<string> {
    const prompt = `You are a senior M&A advisor at Digital Fortuna Computing. Write a concise, professional valuation narrative (3-4 paragraphs) for the following business.

Listing: ${JSON.stringify({ title: listing.title, category: listing.category, revenueMrr: listing.revenueMrr, revenueArr: listing.revenueArr })}
Valuation Report: ${JSON.stringify({ estimatedValuationMin: report.estimatedValuationMin, estimatedValuationMax: report.estimatedValuationMax, recommendedListPrice: report.recommendedListPrice, primaryMethod: report.primaryMethod, ruleOf40Score: report.ruleOf40Score, factors: report.factors, risks: report.risks })}
Comparable Listings: ${JSON.stringify(comparables)}

Write in a professional yet accessible tone. Cover: (1) How the valuation was derived, (2) What drives the premium or discount, (3) How it compares to similar businesses, (4) Recommended next steps for the seller. Do NOT wrap in JSON — return plain text.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.4 },
    });
    return response.text || '';
  }

  async generateNDA(buyerName: string, sellerName: string, listingTitle: string): Promise<any> {
    const prompt = `You are an M&A attorney at Digital Fortuna Computing. Draft a professional, internationally-accepted Non-Disclosure Agreement (NDA) / Confidentiality Agreement for a business acquisition.

Buyer: ${buyerName}
Seller: ${sellerName}
Subject Business: ${listingTitle}

The NDA should cover: definition of confidential information (financial records, customer data, IP, trade secrets, source code, business plans), permitted disclosures, obligations of receiving party, term (2 years), remedies, governing law (State of Delaware / Republic of Ghana as alternatives), and signature blocks.

Return ONLY a JSON object:
{
  "title": "string",
  "documentType": "nda",
  "markdown": "the full NDA in professional markdown format with proper legal sections, numbered clauses, and signature blocks",
  "disclaimer": "string noting this is a template requiring legal review"
}`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text!);
  }

  async generateDueDiligenceChecklist(listing: any, deal: any): Promise<any> {
    const prompt = `You are an M&A due diligence specialist at Digital Fortuna Computing. Generate a comprehensive due diligence checklist for the acquisition of a ${listing.category || 'software'} business.

Business: ${JSON.stringify({ title: listing.title, category: listing.category, revenueMrr: listing.revenueMrr, techStack: listing.techStack, acquisitionPrice: listing.acquisitionPrice })}
Deal: ${JSON.stringify({ agreedPrice: deal.agreedPrice, status: deal.status })}

Create a professional checklist organized by category. Each item should have a description and priority level.

Return ONLY a JSON object:
{
  "title": "string",
  "documentType": "due_diligence_checklist",
  "categories": [
    {
      "name": "string (e.g. Financial, Legal, Technical, Operational, Customer, IP)",
      "items": [
        {
          "item": "string",
          "description": "string",
          "priority": "critical | high | medium | low",
          "status": "pending"
        }
      ]
    }
  ],
  "estimatedCompletionDays": number,
  "disclaimer": "string"
}`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text!);
  }

  async generateEscrowAgreement(deal: any, listing: any, buyerName: string, sellerName: string): Promise<any> {
    const prompt = `You are an M&A attorney at Digital Fortuna Computing. Draft a professional Escrow Agreement for a software business acquisition.

Buyer: ${buyerName}
Seller: ${sellerName}
Escrow Agent: Digital Fortuna Computing (via Stripe/Paystack)
Business: ${listing.title}
Purchase Price: $${deal.agreedPrice?.toLocaleString() || 'TBD'}

The agreement should cover: parties, escrow amount and deposit timeline, release conditions (satisfactory handover, asset transfer verification, 30-day warranty period), dispute resolution mechanism, escrow agent responsibilities and fees (8% platform fee), refund conditions, governing law, and signature blocks.

Return ONLY a JSON object:
{
  "title": "string",
  "documentType": "escrow_agreement",
  "markdown": "the full agreement in professional markdown with numbered clauses and signature blocks",
  "escrowAmount": number,
  "platformFeePct": 8,
  "warrantyPeriodDays": 30,
  "disclaimer": "string"
}`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text!);
  }

  async extractListingFromInput(urlOrText: string) {
    const prompt = `You are an expert M&A startup analyst for Digital Fortuna Computing (a premier marketplace for software, SaaS, AI, and digital assets in Africa and globally).
Analyze the following startup input (URL or brief description):
"${urlOrText}"

Extract and generate a complete, highly persuasive acquisition listing optimized for potential buyers.
Emphasize African market relevance and international scalability where appropriate.

Return ONLY a JSON object with this exact shape:
{
  "title": "string",
  "category": "saas",
  "acquisitionPrice": "string (numeric string, e.g. 150000)",
  "mrr": "string (numeric string, e.g. 12000)",
  "arr": "string (numeric string, e.g. 144000)",
  "profitMargin": "string (e.g. 85)",
  "techStack": "string (comma separated list of technologies)",
  "description": "string (detailed description of the business, value proposition, and user base)",
  "whySelling": "string (strategic rationale for selling)",
  "contactEmail": "string",
  "benefits": "string (comma separated key buyer benefits)",
  "relevance": "string (market fit and relevance)",
  "growth": "string (actionable growth and scale playbook)",
  "activeUsers": "string (numeric string)",
  "logoUrl": "string",
  "screenshotUrl": "string",
  "pitchDeckUrl": "string"
}`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text!);
  }
}
