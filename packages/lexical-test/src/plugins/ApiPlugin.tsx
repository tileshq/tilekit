import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  createCommand,
  LexicalCommand,
  LexicalEditor,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import {useCallback, useEffect} from 'react';

// Mock API function
const mockApiCall = async (text: string): Promise<string> => {
  // Simulate API delay
  // await new Promise(resolve => setTimeout(resolve, 1000));
  // Simple mock transformation - reverse the text and add some emojis
  return `🤖 ${text.split('').reverse().join('')} 🎉`;
};

// Create a custom command
export const API_TRANSFORM_COMMAND: LexicalCommand<void> = createCommand('API_TRANSFORM_COMMAND');

export default function ApiPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    console.log('Registering API plugin command');
    editor.registerCommand(
      API_TRANSFORM_COMMAND,
      () => {
        console.log('Command handler called');
        const selection = $getSelection();
        console.log('Selection:', selection);
        if ($isRangeSelection(selection)) {
          const text = selection.getTextContent();
          console.log('Selected text:', text);
          if (text) {
            // Handle the async operation outside the command handler
            mockApiCall(text).then(response => {
              console.log('API response:', response);
              editor.update(() => {
                selection.removeText();
                selection.insertRawText(response);
              });
            }).catch(error => {
              console.error('API call failed:', error);
            });
          } else {
            console.log('No text selected');
          }
        } else {
          console.log('No range selection');
        }
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const handleApiCall = useCallback(async () => {
    console.log('Button clicked, dispatching command');
    editor.dispatchCommand(API_TRANSFORM_COMMAND, undefined);
  }, [editor]);

  return (
    <button
      onClick={handleApiCall}
      className="toolbar-item spaced"
      aria-label="Transform with API">
      <i className="format api-transform" />
    </button>
  );
} 