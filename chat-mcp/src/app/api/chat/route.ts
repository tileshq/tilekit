// This file would be app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import createDriver from '@dylibso/mcpx-anthropic';
import pino from 'pino';

// Initialize the logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
  },
});

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Function to get or create a driver (optimized to avoid creating a new one for each request)
let driverPromise: Promise<any> | null = null;
const getDriver = async () => {

  if (!driverPromise) {
    driverPromise = createDriver({
      anthropic,
      logger,
      sessionId: process.env.MCP_RUN_SESSION_ID || '',
      profile: process.env.MCP_RUN_PROFILE_NAME || 'default',
    });
  }

  /* print session id and api key and profile name
  console.log("MCP SESSION ID", process.env.MCP_RUN_SESSION_ID);
  console.log(process.env.ANTHROPIC_API_KEY);
  console.log(process.env.MCP_RUN_PROFILE_NAME);
  */
  return driverPromise;
};

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Get the mcpx driver
    const mcpx = await getDriver();

    // Call Claude with mcpx handling tools
    const response = await mcpx.createMessage({
      max_tokens: 2048,
      messages,
      model: 'claude-3-5-haiku-latest',
    });

    return NextResponse.json({ response });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in chat API');
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}


