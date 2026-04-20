# 📱 PhonePilot

**AI-Powered Android Automation**

> 🏆 **2nd Place Winner** at the Just Build x Redo AI Agent Hackathon

An autonomous Android device controller using multimodal AI agents. PhonePilot reads phone UI, plans actions, and executes them via ADB using a **Plan → Act → Observe → Verify (PAOV)** loop, converting natural language goals into reliable, selector-first device operations.

**Built with:** TypeScript, Mastra.ai, Cerebras, and Gemini

## 🎥 Demo

[Watch PhonePilot in Action](https://www.youtube.com/watch?v=otLwivWkeIg)

## 🏗️ Architecture

```
User Goal → Planner (Cerebras) → Vision Analysis (Gemini) → ADB Executor → Device Action → UI Verification
```

**Components:**
- **Planner**: Cerebras llama3.1-8b for fast step planning and reflection
- **Vision**: Gemini 1.5 Flash for screenshot and UI XML analysis
- **Executor**: TypeScript ADB wrapper with closed-loop verification
- **Frontend**: Next.js interface with real-time device monitoring

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Mastra.ai agent framework |
| LLMs | Cerebras (planning), Gemini (vision) |
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Device Control | Android Debug Bridge (ADB) |
| Target Platform | Android 11+ |

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Android Debug Bridge (ADB)
- Android device with USB debugging enabled
- API keys for Cerebras and Google Gemini

### Installation

**1. Clone and install dependencies:**
```bash
git clone <repository>
cd phoneagent
npm install
```

**2. Configure environment variables:**

Create a `.env.local` file in the root directory:
```env
CEREBRAS_API_KEY=your_cerebras_api_key
GOOGLE_API_KEY=your_gemini_api_key
```

**3. Connect your Android device:**
```bash
# Verify connection
adb devices

# For wireless debugging (Android 11+)
adb pair <ip>:<pair_port> <pairing_code>
adb connect <ip>:<adb_port>
```

**4. Start the application:**
```bash
# Terminal 1: Start Mastra dev server
npm run dev:mastra

# Terminal 2: Start Next.js
npm run dev
```

**5. Open the interface:**

Navigate to [http://localhost:3000/phonepilot](http://localhost:3000/phonepilot)

## 🎯 Usage Examples

Execute natural language commands through the UI:

- `"Open Camera, flip to front camera, take a photo, and share it to Slack"`
- `"Take a screenshot and save it to the gallery"`
- `"Open Settings and navigate to WiFi"`

## 🧪 Testing

Run integration tests to verify functionality:
```bash
npm run test:integration
```

## 🛣️ Future Roadmap

- Voice control integration
- Multi-device orchestration
- AR overlays for action visualization
- Custom workflow builder

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

Built with [Mastra.ai](https://mastra.ai), [Cerebras](https://cerebras.ai), [Google Gemini](https://deepmind.google/technologies/gemini/), and Android ADB.

---

*Built with passion for the hackathon! 🚀*
