import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  createCommand,
  LexicalCommand,
  LexicalEditor,
  COMMAND_PRIORITY_LOW,
  RangeSelection,
  $getRoot,
  $isParagraphNode,
  ParagraphNode,
  TextNode,
} from 'lexical';
import {useCallback, useEffect} from 'react';

/**
 * Mock API function that transforms text
 * @param text - The text to transform
 * @returns Promise with the transformed text
 */
const mockApiCall = async (text: string): Promise<string> => {
  // Simulate API delay
  // await new Promise<void>(resolve => setTimeout(resolve, 1000));
  // Simple mock transformation - reverse the text and add some emojis
  return `🤖 ${text.split('').reverse().join('')} 🎉`;
};

// Create a custom command
export const API_TRANSFORM_COMMAND: LexicalCommand<void> = createCommand('API_TRANSFORM_COMMAND');

/**
 * ApiPlugin component that provides text transformation functionality
 * via the robot icon in the toolbar
 */
export default function ApiPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    console.log('Registering API plugin command');
    return editor.registerCommand<void>(
      API_TRANSFORM_COMMAND,
      (): boolean => {
        console.log('Command handler called');
        const selection = $getSelection();
        console.log('Selection:', selection);
        
        let textToTransform: string | null = null;
        let targetNode: ParagraphNode | null = null;
        
        if ($isRangeSelection(selection)) {
          textToTransform = selection.getTextContent();
          console.log('Selected text:', textToTransform);
        } else {
          // If no selection, get the current block's content
          const root = $getRoot();
          const firstChild = root.getFirstChild();
          if ($isParagraphNode(firstChild)) {
            targetNode = firstChild;
            textToTransform = firstChild.getTextContent();
            console.log('Current block text:', textToTransform);
          } else {
            // Create a new paragraph node if none exists
            editor.update(() => {
              const newParagraph = new ParagraphNode();
              const textNode = new TextNode('');
              newParagraph.append(textNode);
              root.append(newParagraph);
              targetNode = newParagraph;
              textToTransform = '';
            });
          }
        }
        
        if (textToTransform !== null) {
          // Handle the async operation outside the command handler
          mockApiCall(textToTransform)
            .then((response: string) => {
              console.log('API response:', response);
              editor.update(() => {
                if ($isRangeSelection(selection)) {
                  selection.removeText();
                  selection.insertRawText(response);
                } else {
                  // If no selection, replace the current block's content
                  if (targetNode) {
                    targetNode.clear();
                    const textNode = new TextNode(response);
                    targetNode.append(textNode);
                  }
                }
              });
            })
            .catch((error: Error) => {
              console.error('API call failed:', error);
            });
        } else {
          console.log('No text to transform');
        }
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const handleApiCall = useCallback((): void => {
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