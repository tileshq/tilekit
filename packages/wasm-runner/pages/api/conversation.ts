import { Anthropic } from '@anthropic-ai/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createWasmExecutorFromBuffer, WasmExecutorOptions } from '../../lib/wasm-executor';

// Use global fetch instead of node-fetch
const fetch = global.fetch;

interface ServletInfo {
  slug: string;
  contentAddress?: string;
  functionName?: string;
  config?: Record<string, any>;
  allowedHosts?: string[];
  allowedPaths?: Record<string, string>;
  logLevel?: string;
  runInWorker?: boolean;
  meta?: {
    schema?: {
      description?: string;
      inputSchema?: {
        properties?: Record<string, any>;
        required?: string[];
      };
      tools?: any[];
      name?: string;
    };
    description?: string;
  };
}

interface ServletTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  servletSlug: string;
}

interface PluginInstance {
  plugin: any;
  functionName: string;
  contentAddress?: string;
}

interface ToolUseSubmessage {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

interface Message {
  role: 'user' | 'assistant' | string;
  content: any;
  type?: string;
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
    const { prompt, servletTools, servletInfoList } = req.body as {
      prompt: string;
      servletTools: ServletTool[];
      servletInfoList: ServletInfo[];
    };

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!servletTools || !Array.isArray(servletTools) || !servletInfoList) {
      return res.status(400).json({ error: 'Required data is missing' });
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here', // Replace with your API key or set in .env
    });

    // Create Claude tools based on the provided servlet tools
    const tools = servletTools.map(tool => {
      // Get the servlet info for this tool
      const servletInfo = servletInfoList.find(info => info.slug === tool.servletSlug);
      const schema = servletInfo?.meta?.schema;
      
      return {
        name: tool.name,
        description: schema?.description || tool.description || `Execute the ${tool.name} function`,
        input_schema: {
          type: "object",
          properties: {
            ...(schema?.inputSchema?.properties || {}),
            ...(schema?.tools && { tools: { type: "array", description: "Available tools in this servlet" } }),
            ...(schema?.name && { servlet_name: { type: "string", description: "Name of the servlet" } }),
            ...(servletInfo?.meta?.description && { servlet_description: { type: "string", description: "Full description of the servlet" } })
          },
          required: schema?.inputSchema?.required || []
        }
      };
    });

    console.log(`Tools: ${JSON.stringify(tools)}`);

    // Add a preamble to guide Claude on how to use the servlet tools 
    const systemMessage = `You are an AI assistant that helps users interact with WASM servlets. 
You have access to the following ${servletTools.length} tool(s): ${servletTools.map(t => t.name).join(', ')}.
Your task is to understand the user's request in natural language and execute the appropriate servlet functions.
When calling a tool, use the exact format required by the tool's input schema.
For each tool call, structure your response to:
1. Explain what you're about to do
2. Call the appropriate tool with the correct parameters
3. Interpret the results in a user-friendly way`;

    // Create a map to store plugin instances
    const pluginInstances: Record<string, {
      executor: any;
      functionName: string;
      contentAddress: string;
    }> = {};

    // Fetch and create actual plugin instances server-side
    for (const servletInfo of servletInfoList) {
      try {
        const { slug, contentAddress, functionName, config } = servletInfo;
        
        if (!contentAddress) {
          throw new Error('Content address is required');
        }
        
        // Fetch the WASM file directly on the server
        const contentResponse = await fetch(`https://www.mcp.run/api/c/${contentAddress}`);
        if (!contentResponse.ok) {
          throw new Error(`Failed to fetch servlet content: ${contentResponse.statusText}`);
        }
        
        const buffer = await contentResponse.arrayBuffer();
        
        // Setup plugin options
        const pluginOptions: WasmExecutorOptions = {
          useWasi: true,
          config: config || {},
          runInWorker: servletInfo.runInWorker
        };
        
        // Add additional options if provided
        if (servletInfo.allowedHosts?.length) {
          pluginOptions.allowedHosts = servletInfo.allowedHosts;
        }
        
        if (servletInfo.allowedPaths && Object.keys(servletInfo.allowedPaths).length > 0) {
          pluginOptions.allowedPaths = servletInfo.allowedPaths;
        }
        
        if (servletInfo.logLevel) {
          pluginOptions.logLevel = servletInfo.logLevel;
        }
        
        // Create the executor
        const executor = await createWasmExecutorFromBuffer(buffer, pluginOptions);
        
        pluginInstances[slug] = {
          executor,
          functionName: functionName || 'call',
          contentAddress
        };
        console.log(`Plugin created for ${servletInfo.slug}`);
      } catch (error) {
        console.error(`Error creating plugin for ${servletInfo.slug}:`, error);
        throw error;
      }
    }

    // Start the conversation with the initial message
    let messages: Message[] = [
      { role: 'user', content: prompt }
    ];

    // Keep track of conversation 
    let conversationHistory: Message[] = [{
      role: 'user',
      content: prompt
    }];
    
    let messageIdx = 1;  // Start after the first user message
    let stopReason: string | null = null;
    let response;
    let finalMessage = null;

    console.log(`Messages: ${JSON.stringify(tools)}`);
    
    // Agentic loop - continue running until we get a final message
    do {
      // Send the current state of the conversation to Claude
      response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4096,
        temperature: 0.7,
        system: systemMessage,
        // @ts-ignore - types are not properly updated for the Anthropic SDK
        messages,
        // @ts-ignore - tools is supported but types may be outdated
        tools,
      });

      // Add Claude's response to messages and conversation history
      messages.push({
        role: response.role,
        content: response.content,
      });
      
      conversationHistory.push({
        role: response.role,
        content: response.content,
      });

      // Log each exchange
      for (; messageIdx < messages.length; ++messageIdx) {
        console.log(`Message ${messageIdx}:`, messages[messageIdx].role);
      }

      // Check if there are any tool use requests
      const newMessage: Message = { role: 'user', content: [] };
      let toolUseCount = 0;
      
      for (const submessage of response.content) {
        // Type assertion to handle the comparison
        if ((submessage as any).type !== 'tool_use') {
          continue;
        }

        ++toolUseCount;
        // Cast to any first to avoid TypeScript errors
        const { id, input, name } = submessage as any as ToolUseSubmessage;

        try {
          // Find the corresponding servlet tool
          const servletTool = servletTools.find(t => t.name === name);
          if (!servletTool) {
            throw new Error(`Tool ${name} not found`);
          }
          
          const pluginInfo = pluginInstances[servletTool.servletSlug];
          if (!pluginInfo) {
            throw new Error(`No plugin instance found for ${servletTool.servletSlug}`);
          }
          
          // Prepare the input for the servlet
          const servletInput = JSON.stringify({
            params: {
              name: name,
              arguments: input
            }
          });
          
          console.log(`Executing tool ${name} with input:`, servletInput);
          
          // Execute the servlet using the plugin
          const executionResult = await pluginInfo.executor.execute(pluginInfo.functionName, servletInput);
          if (executionResult.error) {
            throw new Error(executionResult.error);
          }
          
          // Get the result
          const resultText = executionResult.output;
          let parsedResult;
          
          try {
            // Try to parse as JSON if it looks like JSON
            if (resultText.startsWith('{') && resultText.endsWith('}')) {
              parsedResult = JSON.parse(resultText);
            } else {
              parsedResult = resultText;
            }
          } catch (e) {
            parsedResult = resultText;
          }
          
          console.log(`Tool ${name} result:`, typeof parsedResult === 'object' ? JSON.stringify(parsedResult) : parsedResult);
          
          // Add the tool result to the message - ensure content is a string
          newMessage.content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: typeof parsedResult === 'object' ? JSON.stringify(parsedResult) : String(parsedResult)
          });
          
          // Track for history display
          conversationHistory.push({
            role: 'user',
            type: 'tool_results',
            content: [{
              toolName: name,
              input,
              result: parsedResult
            }]
          });
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Add the error as a tool result
          newMessage.content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: `Error: ${errorMessage}`,
            is_error: true
          });
          
          // Track for history display
          conversationHistory.push({
            role: 'user',
            type: 'tool_results',
            content: [{
              toolName: name,
              input,
              error: errorMessage
            }]
          });
        }
      }

      // If Claude is doing tool use, add the result as a user message and continue
      if (response.stop_reason === 'tool_use' as any) {
        messages.push(newMessage);
        continue;
      }

      // If there was tool use but Claude is now done its turn, add the results and continue
      if (response.stop_reason === 'end_turn' && toolUseCount > 0) {
        messages.push(newMessage);
        continue;
      }

      // Otherwise, we're done
      stopReason = response.stop_reason;
      finalMessage = response;
      messages.pop(); // Remove the empty message that wasn't needed
      break;
      
    } while (true);

    console.log(`Conversation complete. Reason: ${stopReason}`);

    // Cleanup plugins
    for (const [_, pluginInfo] of Object.entries(pluginInstances)) {
      try {
        if (pluginInfo.executor) {
          // If there's a cleanup method available
          if (typeof pluginInfo.executor.free === 'function') {
            pluginInfo.executor.free();
          }
        }
      } catch (err) {
        console.error('Error cleaning up plugin:', err);
      }
    }

    // Return the final response and conversation history
    res.status(200).json({ 
      finalMessage, 
      stopReason, 
      conversationHistory 
    });
    
  } catch (error) {
    console.error('Conversation API error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}