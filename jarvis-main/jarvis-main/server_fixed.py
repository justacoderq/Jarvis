"""
Jarvis WebSocket Server - Gemini Bridge
This server acts as a real-time bridge between a Flutter client and the Gemini LiveAPI.
"""

import os
import json
import base64
import asyncio
import websockets
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from .env.local or .env file
load_dotenv('.env.local')

# CONFIGURE YOUR API KEY
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set")

client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=GEMINI_API_KEY
)

# Model to use
MODEL = "models/gemini-2.5-flash-native-audio-preview-09-2025"

# Define the update_ui tool that the AI will use to manipulate the Flutter UI
update_ui_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="update_ui",
            description="Add, remove, or update a UI component on the user's screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "action": types.Schema(
                        type=types.Type.STRING,
                        description="The action to perform: 'add', 'remove', or 'clear'"
                    ),
                    "component_id": types.Schema(
                        type=types.Type.STRING,
                        description="A unique ID for the component"
                    ),
                    "component_type": types.Schema(
                        type=types.Type.STRING,
                        description="The type of widget to render, e.g., 'data_card', 'note_input', 'alert'"
                    ),
                    "data": types.Schema(
                        type=types.Type.STRING,
                        description="A JSON string containing the data for the widget (e.g., title, text)"
                    ),
                },
                required=["action", "component_id"],
            ),
        )
    ]
)

# Gemini LiveAPI Configuration
CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO", "TEXT"],  # We need TEXT for tool calls
    tools=[update_ui_tool],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr")
        )
    ),
)


async def flutter_to_gemini(websocket, session):
    """
    Task that receives messages from Flutter client and forwards them to Gemini.
    Expects JSON messages with base64-encoded audio/video payloads.
    """
    print("flutter_to_gemini task started")
    try:
        async for message in websocket:
            try:
                # Parse the JSON command from Flutter
                command = json.loads(message)
                msg_type = command.get("type")
                payload = command.get("payload")

                if msg_type == "connection_test":
                    print(f"✓ Received connection test from client")
                    continue

                if not payload:
                    print(f"Received message without payload: {msg_type}")
                    continue

                # Decode from base64
                binary_data = base64.b64decode(payload)

                # Forward to Gemini based on type
                if msg_type == "audio_stream":
                    print(f"Received audio stream: {len(binary_data)} bytes -> forwarding to Gemini")
                    await session.send(input={"data": binary_data, "mime_type": "audio/pcm"})
                elif msg_type == "video_stream":
                    print(f"Received video stream: {len(binary_data)} bytes -> forwarding to Gemini")
                    await session.send(input={"data": binary_data, "mime_type": "image/jpeg"})
                else:
                    print(f"Unknown message type: {msg_type}")

            except json.JSONDecodeError as e:
                print(f"Error decoding JSON from client: {e}")
            except Exception as e:
                print(f"Error processing client message: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("flutter_to_gemini: WebSocket connection closed")
    except Exception as e:
        print(f"flutter_to_gemini error: {e}")


async def gemini_to_flutter(websocket, session):
    """
    Task that receives responses from Gemini and forwards them to Flutter.
    - Audio responses are sent as raw binary
    - Tool calls (update_ui) are sent as JSON text messages
    """
    print("gemini_to_flutter task started")
    try:
        while True:
            turn = session.receive()
            async for response in turn:
                # Handle audio responses - send as raw binary
                if response.data:
                    print(f"Sending audio to Flutter: {len(response.data)} bytes")
                    await websocket.send(response.data)

                # Handle text responses (for debugging)
                if response.text:
                    print(f"Gemini text response: {response.text}")

                # Handle function calls - convert to UI commands
                if response.tool_call:
                    for part in response.tool_call:
                        if hasattr(part, 'function_call'):
                            call = part.function_call
                            if call.name == "update_ui":
                                # Create the JSON command per the protocol
                                ui_command = {
                                    "type": "ui_command",
                                    "action": call.args.get("action", ""),
                                    "component_id": call.args.get("component_id", ""),
                                    "component_type": call.args.get("component_type", ""),
                                    "data": call.args.get("data", "{}")
                                }
                                # Send the command as a JSON text message
                                command_json = json.dumps(ui_command)
                                print(f"Sending UI command: {command_json}")
                                await websocket.send(command_json)

    except websockets.exceptions.ConnectionClosed:
        print("gemini_to_flutter: WebSocket connection closed")
    except Exception as e:
        print(f"gemini_to_flutter error: {e}")


async def handler(websocket, path):
    """
    Main WebSocket connection handler.
    Manages the Gemini session and coordinates the bidirectional data flow.
    """
    client_address = websocket.remote_address
    print(f"✓ New client connected: {client_address}")

    # Send immediate ack to keep connection alive
    try:
        await websocket.send(json.dumps({"type": "server_ready", "status": "connected"}))
        print("Sent server_ready message to client")
    except Exception as e:
        print(f"Error sending server_ready: {e}")

    try:
        # Initialize Gemini LiveAPI session
        print(f"Initializing Gemini session for client: {client_address}...")
        async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
            print(f"✓ Gemini session established for client: {client_address}")

            # Notify client that we're fully ready
            try:
                await websocket.send(json.dumps({"type": "gemini_ready", "status": "ready"}))
                print("Sent gemini_ready message to client")
            except Exception as e:
                print(f"Error sending gemini_ready: {e}")

            # Create task group for concurrent execution
            async with asyncio.TaskGroup() as tg:
                # Start both bidirectional tasks
                tg.create_task(flutter_to_gemini(websocket, session))
                tg.create_task(gemini_to_flutter(websocket, session))

    except* websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {client_address}")
    except* Exception as e:
        print(f"Error in handler for {client_address}: {e}")
    finally:
        print(f"Handler closed for client: {client_address}")


async def main():
    """
    Start the WebSocket server.
    """
    host = "0.0.0.0"
    port = 8765

    print(f"Starting Jarvis WebSocket Server on ws://{host}:{port}")
    print(f"Using Gemini model: {MODEL}")

    async with websockets.serve(handler, host, port):
        print("Server is running. Press Ctrl+C to stop.")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
