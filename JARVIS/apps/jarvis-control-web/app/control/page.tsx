import { GoalExecutor, DeviceMonitor, PhoneScreenMirror } from "./components";

export default function TaskRunnerPage() {
  return (
    <div className="min-h-screen relative">
      {/* Cyberpunk Header */}
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-lg">P</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold neon-blue font-mono tracking-wider">PhoneAgent</h1>
                {/* <p className="text-xs text-cyan-300 font-mono">AI Phone Automation</p> */}
              </div>
            </div>
            <div className="flex items-center space-x-6 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400">SYSTEM ONLINE</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-cyan-400">ADB CONNECTED</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Hero Section */}
          <section className="text-center mb-12">
            <h2 className="text-4xl sm:text-6xl font-bold font-mono mb-4">
              <span className="neon-blue">AUTONOMOUS</span>
              <br />
              <span className="text-white">CONTROL</span>
            </h2>
            <p className="text-cyan-300 max-w-4xl mx-auto text-lg font-mono leading-relaxed">
              Harness the power of advanced AI to control your device through natural language.
              <br />
              <span className="text-purple-400">PhoneAgent</span> combines cutting-edge vision analysis, intelligent planning, and precise execution to automate complex mobile workflows with <span className="neon-green">unprecedented accuracy</span>.
            </p>
          </section>

          {/* System Status Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Neural Planning */}
            <div className="glass p-6 animate-slide-in-up">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-pink-400 text-lg">🧠</span>
                </div>
                <div>
                  <h3 className="text-pink-400 font-bold font-mono">NEURAL PLANNING</h3>
                  <p className="text-xs text-pink-300 font-mono">STATUS: OPERATIONAL</p>
                </div>
              </div>
              <p className="text-white/80 text-sm">
                Cerebras-powered LLM breaks down complex goals into precise, executable action sequences with advanced reasoning capabilities.
              </p>
            </div>

            {/* Vision System */}
            <div className="glass p-6 animate-slide-in-up animation-delay-100">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-purple-400 text-lg">👁️</span>
                </div>
                <div>
                  <h3 className="text-purple-400 font-bold font-mono">VISION SYSTEM</h3>
                  <p className="text-xs text-purple-300 font-mono">STATUS: SCANNING</p>
                </div>
              </div>
              <p className="text-white/80 text-sm">
                Gemini Vision AI analyzes screenshots and UI elements for pixel-perfect targeting and contextual understanding.
              </p>
            </div>

            {/* Execution Engine */}
            <div className="glass p-6 animate-slide-in-up animation-delay-200">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-green-400 text-lg">⚡</span>
                </div>
                <div>
                  <h3 className="text-green-400 font-bold font-mono">EXECUTION ENGINE</h3>
                  <p className="text-xs text-green-300 font-mono">STATUS: ACTIVE</p>
                </div>
              </div>
              <p className="text-white/80 text-sm">
                Plan → Act → Observe → Verify loop ensures reliable automation with real-time adaptation and error recovery.
              </p>
            </div>
          </div>

          {/* Main Interface Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="animate-slide-in-up animation-delay-300">
              <GoalExecutor />
            </div>
            <div className="animate-slide-in-up animation-delay-400">
              <DeviceMonitor />
            </div>
          </div>

          <div className="mt-6 animate-slide-in-up animation-delay-500">
            <PhoneScreenMirror />
          </div>
        </div>
      </main>
    </div>
  );
}
