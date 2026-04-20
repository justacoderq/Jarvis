WebSocket Communication ProtocolThis document defines the strict data contract between the Flutter client and the Python backend. Both parties MUST adhere to these JSON and binary formats.1. Client (Flutter) -> Server (Python)The client MUST send all messages to the server as text-based JSON strings. Binary data (audio/video) MUST be base64-encoded and wrapped in a JSON object.A. Audio Stream MessageSent continuously for real-time audio.{
"type": "audio_stream",
"payload": "<base64_encoded_pcm_audio_data>"
}
B. Video Stream MessageSent on a throttle (e.g., 5 FPS) for real-time video.{
"type": "video_stream",
"payload": "<base64_encoded_jpeg_data>"
}
C. Text Message (User Input)(Optional, for future use if user types a message){
"type": "text_message",
"payload": "User's typed text"
}
2. Server (Python) -> Client (Flutter)The server will send two distinct types of messages:A. AI Audio (Binary Message)Type: Raw BinaryContent: A chunk of PCM audio data from the Gemini API.Flutter Action: The Flutter client, upon receiving a binary message, MUST pipe these bytes directly to the just_audio player for playback.B. AI Command (Text Message)Type: Text (JSON String)Content: A JSON object representing a command for the UI or system.Flutter Action: The Flutter client, upon receiving a text message, MUST parse it as JSON and pass it to the DynamicUiModel for processing.ui_command Structure:This is the primary command for building the dynamic UI.{
   "type": "ui_command",
   "action": "add" | "remove" | "clear",
   "component_id": "<unique-string-id>",
   "component_type": "data_card" | "note_input" | "alert" | ... ,
   "data": "<stringified_json_payload_for_the_widget>"
   }
   Example ui_command (as received by Flutter):"{\"type\":\"ui_command\",\"action\":\"add\",\"component_id\":\"note-16788\",\"component_type\":\"note_input\",\"data\":\"{\\\"label\\\":\\\"My New Note\\\"}\"}"
