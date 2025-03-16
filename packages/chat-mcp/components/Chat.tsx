'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { EB_Garamond } from 'next/font/google';

// Message type definition
type Message = {
  role: 'user' | 'assistant';
  content: string;
};

// Initialize the font
const ebGaramond = EB_Garamond({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the bottom of the messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea as user types
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to calculate proper scrollHeight
    textarea.style.height = 'auto';
    // Set new height based on scrollHeight (with max-height applied via CSS)
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message to the chat
    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Prepare the messages for the API
      const apiMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Send to our API endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Process the response
      let assistantContent = '';
      if (Array.isArray(data.response.content)) {
        assistantContent = data.response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      } else {
        assistantContent = data.response.content;
      }

      // Add assistant message to the chat
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantContent },
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      // Show error in the chat
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, there was an error processing your request.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  return (
    <div className={`flex flex-col h-screen bg-gradient-to-br from-teal-100 via-blue-50 to-indigo-100 text-zinc-800 ${ebGaramond.className}`}>      {/* Header - iMac-inspired with translucent look */}
      <header className="border-b border-teal-200 py-3 px-4 bg-teal-200 bg-opacity-80 backdrop-blur-sm shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500"></div>
            </div>
            <h1 className="text-xl font-bold text-indigo-800">MCPChat–from tiles</h1>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-4xl w-full mx-auto">
        {/* Messages display - CRT-style */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-teal-50 bg-opacity-70 backdrop-blur-sm border-2 border-teal-200 m-4 rounded-lg shadow-inner">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md p-6 rounded-lg bg-transparent">
                {/* Empty state with no text */}
              </div>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-3xl mx-auto w-full ${
                message.role === 'user' ? 'pl-10' : 'pl-0'
              }`}
            >
              <div className="flex gap-4 items-start">
                {/* Avatar - More playful and colorful */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                  message.role === 'user' 
                    ? 'bg-indigo-100 text-indigo-600 border-indigo-300' 
                    : 'bg-pink-100 text-pink-600 border-pink-300'
                }`}>
                  {message.role === 'user' ? 'Human:' : 'Agent:'}
                </div>
                
                {/* Message content */}
                <div className="flex-1 prose max-w-none p-3 rounded-lg bg-white bg-opacity-80 backdrop-blur-sm border-2 border-teal-200 shadow-sm">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>

            {/* Add horizontal line after every message except the last one */}
              <hr className="max-w-3xl mx-auto my-4 border-t border-gray-200 dark:border-gray-700" />
            </div>
          ))}
          
          {isLoading && (
            <div className="max-w-3xl mx-auto w-full">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 
                  bg-pink-100 text-pink-600 border-2 border-pink-300">
                  Agent
                </div>
                <div className="flex-1 p-3 rounded-lg bg-white bg-opacity-80 backdrop-blur-sm border-2 border-teal-200">
                  <div className="flex space-x-2 items-center h-8">
                    <span className="text-sm text-indigo-500">...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
          
        </div>
        
        {/* Input form - Candy-colored iMac style */}
        <div className="p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative rounded-lg border-2 border-teal-300 bg-white bg-opacity-80 backdrop-blur-sm shadow-md">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Talk here..."
                disabled={isLoading}
                rows={1}
                className="w-full p-3 pr-12 outline-none resize-none max-h-[200px] bg-transparent text-indigo-800"
                // make it bigger by 
                style={{ minHeight: '10rem', minWidth: '70%' }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 bottom-2 p-1.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
            <div className="mt-2 text-xs text-indigo-600 text-center">
              Press Ctrl+Enter to send
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}