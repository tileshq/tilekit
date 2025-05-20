import { Anthropic } from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

interface RequestBody {
  prompt: string;
  tools: any[];
}

interface ErrorResponse {
  error: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<any | ErrorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, tools } = req.body as RequestBody;

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here', // Replace with your API key or set in .env
    });

    // Send the initial request to Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ],
      // @ts-ignore - tools is supported but types may be outdated
      tools: tools,
    });

    // Return the response
    res.status(200).json(response);
  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}