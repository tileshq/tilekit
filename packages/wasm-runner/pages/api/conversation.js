import { Anthropic } from '@anthropic-ai/sdk';

// Use global fetch instead of node-fetch
const fetch = global.fetch;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, servletTools, servletInfoList } = req.body;

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

    // Fetch and create actual plugin instances server-side
    const pluginInstances = {};
    for (const servletInfo of servletInfoList) {
      try {
        const { slug, contentAddress, functionName, config } = servletInfo;
        
        // Fetch the WASM file directly on the server
        const contentResponse = await fetch(`https://www.mcp.run/api/c/${contentAddress}`);
        if (!contentResponse.ok) {
          throw new Error(`Failed to fetch servlet content: ${contentResponse.statusText}`);
        }
        
        const buffer = await contentResponse.arrayBuffer();
        
        // Import dynamically since we're in a server environment
        const { createPlugin } = await import('extism');
        
        // Create the plugin
        const plugin = await createPlugin(buffer, {
          useWasi: true,
          config: config || {}
        });
        
        pluginInstances[slug] = {
          plugin,
          functionName: functionName || 'call',
          contentAddress
        };
        console.log(`Plugin created for ${servletInfo.slug}`);
      } catch (err) {
        console.error(`Failed to create plugin for ${servletInfo.slug}:`, err);
      }
    }

    // Start the conversation with the initial message
    let messages = [
      { role: 'user', content: prompt }
    ];

    // Keep track of conversation 
    let conversationHistory = [{
      role: 'user',
      content: prompt
    }];
    
    let messageIdx = 1;  // Start after the first user message
    let stopReason = null;
    let response;
    let finalMessage = null;
    
    // Agentic loop - continue running until we get a final message
    do {
      // Send the current state of the conversation to Claude
      response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4096,
        temperature: 0.7,
        system: systemMessage,
        messages,
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
      const newMessage = { role: 'user', content: [] };
      let toolUseCount = 0;
      
      for (const submessage of response.content) {
        if (submessage.type !== 'tool_use') {
          continue;
        }

        ++toolUseCount;
        const { id, input, name } = submessage;

        try {
          // Find the corresponding servlet tool
          const servletTool = servletTools.find(t => t.name === name);
          if (!servletTool) {
            throw new Error(`Tool ${name} not found`);
          }
          
          const pluginInfo = pluginInstances[servletTool.servletSlug];
          if (!pluginInfo) {
            throw new Error(`Plugin for servlet ${servletTool.servletSlug} not found or failed to load`);
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
          const functionName = pluginInfo.functionName || 'call';
          const outputBuffer = await pluginInfo.plugin.call(functionName, servletInput);
          
          // Get the result
          const resultText = outputBuffer.text();
          let result;
          
          try {
            // Try to parse the result as JSON
            result = JSON.parse(resultText);
            // If the result has a content array with text, extract just the text
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
              const firstContent = result.content[0];
              if (firstContent.type === 'text' && firstContent.text) {
                result = firstContent.text;
              }
            }
          } catch (e) {
            // If parsing fails, use the raw text
            result = resultText;
          }
          
          console.log(`Tool ${name} result:`, typeof result === 'object' ? JSON.stringify(result) : result);
          
          // Add the tool result to the message
          newMessage.content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: result
          });
          
          // Track for history display
          conversationHistory.push({
            role: 'user',
            type: 'tool_results',
            content: [{
              toolName: name,
              input,
              result
            }]
          });
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          
          // Add the error as a tool result
          newMessage.content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: `Error: ${error.message}`,
            is_error: true
          });
          
          // Track for history display
          conversationHistory.push({
            role: 'user',
            type: 'tool_results',
            content: [{
              toolName: name,
              input,
              error: error.message
            }]
          });
        }
      }

      // If Claude is doing tool use, add the result as a user message and continue
      if (response.stop_reason === 'tool_use') {
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
        if (pluginInfo.plugin) {
          // If there's a cleanup method available
          if (typeof pluginInfo.plugin.free === 'function') {
            pluginInfo.plugin.free();
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
    res.status(500).json({ error: error.message });
  }
}