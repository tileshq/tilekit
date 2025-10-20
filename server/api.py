# MIT License

# Copyright (c) 2025 The BROKE team 🦫

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

from fastapi import FastAPI, HTTPException
from .config import SYSTEM_PROMPT,MEMORY_PATH

import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional, Union

from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .cache_utils import (
    detect_framework,
    get_model_path
)
from .mlx_runner import MLXRunner

from server.mem_agent.utils import extract_python_code, extract_reply, extract_thoughts, create_memory_if_not_exists, format_results
from server.mem_agent.engine import execute_sandboxed_code
# Global model cache and configuration
_model_cache: Dict[str, MLXRunner] = {}
_current_model_path: Optional[str] = None
_default_max_tokens: Optional[int] = None  # Use dynamic model-aware limits by default
_runner: MLXRunner = {}
_max_tool_turns = 5

class CompletionRequest(BaseModel):
    model: str
    prompt: Union[str, List[str]]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None
    repetition_penalty: Optional[float] = 1.1


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str

_messages: list[ChatMessage]= []

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None
    repetition_penalty: Optional[float] = 1.1


class CompletionResponse(BaseModel):
    id: str
    object: str = "text_completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    # usage: Dict[str, int]


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    owned_by: str = "mlx-knife"
    permission: List = []
    context_length: Optional[int] = None

class StartRequest(BaseModel):
    model: str

class Agent:
    def __init__(
        self,
        max_tool_turns: int = 20,
        memory_path: str = None,
        use_vllm: bool = False,
        model: str = None,
        predetermined_memory_path: bool = False,
        model_cache: Dict[str, MLXRunner] = {},
        current_model_path: Optional[str] = None,
        default_max_tokens: Optional[int] = None  # Use dynamic model-aware limits by default

    ):
        # Load the system prompt and add it to the conversation history
        self.system_prompt = SYSTEM_PROMPT
        self.messages: list[ChatMessage] = [
            ChatMessage(role="system", content=self.system_prompt)
        ]

        # Set the maximum number of tool turns and use_vllm flag
        self.max_tool_turns = max_tool_turns
        self.use_vllm = use_vllm
            
app = FastAPI()

agent: Agent()

def get_or_load_model(model_spec: str, verbose: bool = False) -> MLXRunner:
    """Get model from cache or load it if not cached."""
    global _model_cache, _current_model_path

    print(model_spec)
    # Use the existing model path resolution from cache_utils

    try:
        model_path, model_name, commit_hash = get_model_path(model_spec)
        if not model_path.exists():
            raise HTTPException(status_code=404, detail=f"Model {model_spec} not found in cache")
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Model {model_spec} not found: {str(e)}")

    # Check if it's an MLX model

    model_path_str = str(model_path)

    print(_current_model_path)
    print(model_path_str)
    # Check if we need to load a different model
    if _current_model_path != model_path_str:
        # Proactively clean up any previously loaded runner to release memory
        if _model_cache:
            try:
                for _old_runner in list(_model_cache.values()):
                    try:
                        _old_runner.cleanup()
                    except Exception:
                        pass
            finally:
                _model_cache.clear()

        # Load new model
        if verbose:
            print(f"Loading model: {model_name}")

        runner = MLXRunner(model_path_str, verbose=verbose)
        runner.load_model()

        _model_cache[model_path_str] = runner
        _current_model_path = model_path_str

    return _model_cache[model_path_str]

def format_chat_messages_for_runner(messages: List[ChatMessage]) -> List[Dict[str, str]]:
    """Convert chat messages to format expected by MLXRunner.
    
    Returns messages in dict format for the runner to apply chat templates.
    """
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def count_tokens(text: str) -> int:
    """Rough token count estimation."""
    return int(len(text.split()) * 1.3)  # Approximation, convert to int

@app.get("/ping")
async def ping():
    return {"message": "Badda-Bing Badda-Bang"} 

@app.post("/start")
async def start_model(request: StartRequest):
    """Load the model and start the agent"""
    global _messages, _runner
    print(str(request))
    _messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]

    try:
        _runner = get_or_load_model(request.model)
        return {"message": "Model loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
async def create_chat_completion(request: ChatCompletionRequest):
    """Create a chat completion."""
    global _messages, _max_tool_turns
    try:
        runner = get_or_load_model(request.model)

        # if request.stream:
        #     # Streaming response
        #     return StreamingResponse(
        #         generate_chat_stream(runner, request.messages, request),
        #         media_type="text/plain",
        #         headers={"Cache-Control": "no-cache"}
        #     )
        # else:
            # Non-streaming response
        completion_id = f"chatcmpl-{uuid.uuid4()}"
        created = int(time.time())

        # Convert messages to dict format for runner
        # _messages.append(system_message)
        _messages.extend(request.messages)
        message_dicts = format_chat_messages_for_runner(_messages)
        # Let the runner format with chat templates
        prompt = runner._format_conversation(message_dicts, use_chat_template=True)

        generated_text = runner.generate_batch(
            prompt=prompt,
            max_tokens=runner.get_effective_max_tokens(request.max_tokens or _default_max_tokens, interactive=False),
            temperature=request.temperature,
            top_p=request.top_p,
            repetition_penalty=request.repetition_penalty,
            use_chat_template=False  # Already applied in _format_conversation
        )

        # Token counting
        # total_prompt = "\n\n".join([msg.content for msg in request.messages])
        # prompt_tokens = count_tokens(total_prompt)
        # completion_tokens = count_tokens(generated_text)

        thoughts = extract_thoughts(generated_text)
        reply = extract_reply(generated_text)
        python_code = extract_python_code(generated_text)
        print(generated_text)
        result = ({}, "")
        if python_code:
            create_memory_if_not_exists()
            result = execute_sandboxed_code(
                code=python_code,
                allowed_path=MEMORY_PATH,
                import_module="server.mem_agent.tools",
            )

        print(reply)
        print(str(result))        

        remaining_tool_turns = _max_tool_turns
        while remaining_tool_turns > 0 and not reply:
            _messages.append(ChatMessage(role="user", content=format_results(result[0], result[1])))
            message_dicts = format_chat_messages_for_runner(_messages)
            # Let the runner format with chat templates
            prompt = runner._format_conversation(message_dicts, use_chat_template=True)
            generated_text = runner.generate_batch(
                prompt=prompt
            )
            print(generated_text)
            # Extract the thoughts, reply and python code from the response
            thoughts = extract_thoughts(generated_text)
            reply = extract_reply(generated_text)
            python_code = extract_python_code(generated_text)

            _messages.append(ChatMessage(role="assistant", content=generated_text))
            if python_code:
                create_memory_if_not_exists()
                result = execute_sandboxed_code(
                    code=python_code,
                    allowed_path=MEMORY_PATH,
                    import_module="server.mem_agent.tools",
                )
            else:
                # Reset result when no Python code is executed
                result = ({}, "")
            remaining_tool_turns -= 1
        
        return ChatCompletionResponse(
            id=completion_id,
            created=created,
            model=request.model,
            choices=[
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": reply
                    },
                    "finish_reason": "stop"
                }
            ],
            # usage={
            #     "prompt_tokens": prompt_tokens,
            #     "completion_tokens": completion_tokens,
            #     "total_tokens": prompt_tokens + completion_tokens
            # }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
