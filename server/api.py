from fastapi import FastAPI, HTTPException
from .config import SYSTEM_PROMPT

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

# Global model cache and configuration
_model_cache: Dict[str, MLXRunner] = {}
_current_model_path: Optional[str] = None
_default_max_tokens: Optional[int] = None  # Use dynamic model-aware limits by default


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
    usage: Dict[str, int]


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    owned_by: str = "mlx-knife"
    permission: List = []
    context_length: Optional[int] = None


app = FastAPI()

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

async def generate_completion_stream(
    runner: MLXRunner,
    prompt: str,
    request: CompletionRequest
) -> AsyncGenerator[str, None]:
    """Generate streaming completion response."""
    completion_id = f"cmpl-{uuid.uuid4()}"
    created = int(time.time())

    # Yield initial response
    initial_response = {
        "id": completion_id,
        "object": "text_completion",
        "created": created,
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "text": "",
                "logprobs": None,
                "finish_reason": None
            }
        ]
    }

    yield f"data: {json.dumps(initial_response)}\n\n"

    # Stream tokens
    try:
        token_count = 0
        for token in runner.generate_streaming(
            prompt=prompt,
            max_tokens=runner.get_effective_max_tokens(request.max_tokens or _default_max_tokens, interactive=False),
            temperature=request.temperature,
            top_p=request.top_p,
            repetition_penalty=request.repetition_penalty,
            use_chat_template=False  # Raw completion mode
        ):
            token_count += 1

            chunk_response = {
                "id": completion_id,
                "object": "text_completion",
                "created": created,
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "text": token,
                        "logprobs": None,
                        "finish_reason": None
                    }
                ]
            }

            yield f"data: {json.dumps(chunk_response)}\n\n"

            # Check for stop sequences
            if request.stop:
                stop_sequences = request.stop if isinstance(request.stop, list) else [request.stop]
                if any(stop in token for stop in stop_sequences):
                    break

    except Exception as e:
        error_response = {
            "id": completion_id,
            "object": "text_completion",
            "created": created,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "text": "",
                    "logprobs": None,
                    "finish_reason": "error"
                }
            ],
            "error": str(e)
        }
        yield f"data: {json.dumps(error_response)}\n\n"

    # Final response
    final_response = {
        "id": completion_id,
        "object": "text_completion",
        "created": created,
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "text": "",
                "logprobs": None,
                "finish_reason": "stop"
            }
        ]
    }

    yield f"data: {json.dumps(final_response)}\n\n"
    yield "data: [DONE]\n\n"

async def generate_chat_stream(
    runner: MLXRunner,
    messages: List[ChatMessage],
    request: ChatCompletionRequest
) -> AsyncGenerator[str, None]:
    """Generate streaming chat completion response."""
    completion_id = f"chatcmpl-{uuid.uuid4()}"
    created = int(time.time())

    # Convert messages to dict format for runner
    message_dicts = format_chat_messages_for_runner(messages)
    
    # Let the runner format with chat templates
    prompt = runner._format_conversation(message_dicts, use_chat_template=True)

    # Yield initial response
    initial_response = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "delta": {"role": "assistant", "content": ""},
                "finish_reason": None
            }
        ]
    }

    yield f"data: {json.dumps(initial_response)}\n\n"

    # Stream tokens
    try:
        for token in runner.generate_streaming(
            prompt=prompt,
            max_tokens=runner.get_effective_max_tokens(request.max_tokens or _default_max_tokens, interactive=False),
            temperature=request.temperature,
            top_p=request.top_p,
            repetition_penalty=request.repetition_penalty,
            use_chat_template=False,  # Already applied in _format_conversation
            use_chat_stop_tokens=False  # Server mode shouldn't stop on chat markers
        ):
            chunk_response = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": token},
                        "finish_reason": None
                    }
                ]
            }

            yield f"data: {json.dumps(chunk_response)}\n\n"

            # Check for stop sequences
            if request.stop:
                stop_sequences = request.stop if isinstance(request.stop, list) else [request.stop]
                if any(stop in token for stop in stop_sequences):
                    break

    except Exception as e:
        error_response = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "error"
                }
            ],
            "error": str(e)
        }
        yield f"data: {json.dumps(error_response)}\n\n"

    # Final response
    final_response = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }
        ]
    }

    yield f"data: {json.dumps(final_response)}\n\n"
    yield "data: [DONE]\n\n"


def format_chat_messages_for_runner(messages: List[ChatMessage]) -> List[Dict[str, str]]:
    """Convert chat messages to format expected by MLXRunner.
    
    Returns messages in dict format for the runner to apply chat templates.
    """
    system_message = ChatMessage(role="system", content=SYSTEM_PROMPT)
    messages.append(system_message)
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def count_tokens(text: str) -> int:
    """Rough token count estimation."""
    return int(len(text.split()) * 1.3)  # Approximation, convert to int

@app.get("/ping")
async def ping():
    return {"message": "ping"} 


@app.post("/v1/chat/completions")
async def create_chat_completion(request: ChatCompletionRequest):
    """Create a chat completion."""
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
        message_dicts = format_chat_messages_for_runner(request.messages)
        # conversation_history.append({"role": "system", "content": system_prompt})
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
        total_prompt = "\n\n".join([msg.content for msg in request.messages])
        prompt_tokens = count_tokens(total_prompt)
        completion_tokens = count_tokens(generated_text)

        return ChatCompletionResponse(
            id=completion_id,
            created=created,
            model=request.model,
            choices=[
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": generated_text
                    },
                    "finish_reason": "stop"
                }
            ],
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
