"use client";

import { useState, useEffect, useRef } from "react";
import { executeGoal, executeSingleAdbAction, runDemoSuite, getDeviceInfo, takeScreenshot, startScreenMirror, stopScreenMirror } from "./actions";

interface DeviceInfo {
  width: number;
  height: number;
  density: number;
  orientation: number;
  focusComponent?: string;
}

interface ExecutionStep {
  step: number;
  action: string;
  params: any;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
}

interface ExecutionResult {
  success: boolean;
  status: string;
  steps: ExecutionStep[];
  summary?: string;
  error?: string;
}

export function GoalExecutor() {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setResult(null);
    setIsTyping(true);
    
    try {
      const res = await executeGoal(formData);
      const normalized: ExecutionResult = (res && typeof res === 'object' && 'status' in res && 'steps' in res)
        ? (res as ExecutionResult)
        : { success: false, status: 'error', steps: [], error: (res as any)?.error ?? 'Unknown error' };
      setResult(normalized);
    } catch (error: any) {
      setResult({ success: false, status: "SYSTEM_ERROR", steps: [], error: error.message });
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }

  return (
    <div className="glass p-6">
      <div className="border-b border-cyan-400/30 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-cyan-500/20 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-cyan-400 font-mono tracking-wider">MISSION CONTROL</h2>
              <p className="text-xs text-cyan-300 font-mono">MISSION OBJECTIVE</p>
            </div>
          </div>
          <div className="text-xs font-mono text-cyan-400">[NEURAL PARSE]</div>
        </div>
      </div>
        
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-mono text-cyan-400 uppercase tracking-wider">
              Enter your automation mission
            </label>
            <textarea
              name="goal"
              placeholder="Mission briefing..."
              className="w-full h-24 cyber-input resize-none text-sm"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-mono text-cyan-400 uppercase">Max Execution Steps</label>
              <input
                type="number"
                name="maxSteps"
                defaultValue="20"
                min="1"
                max="50"
                className="w-full cyber-input text-center"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-mono text-cyan-400 uppercase">Device Serial</label>
              <input
                type="text"
                name="deviceSerial"
                placeholder="[OPT]"
                className="w-full cyber-input text-center"
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 cyber-button relative ${
              loading ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="cyber-spinner w-4 h-4"></div>
              </div>
            )}
            <span className={loading ? 'opacity-0' : 'opacity-100'}>
              {loading ? 'EXECUTING...' : 'INITIATE MISSION'}
            </span>
          </button>
        </form>

        {result && (
          <div className="mt-6 space-y-4 animate-slide-in-up">
            <div className={`p-6 rounded-xl backdrop-blur-sm ${
              result.success 
                ? 'bg-green-900/20 border border-green-400/30 glow-border-green' 
                : 'bg-red-900/20 border border-red-400/30 glow-border-pink'
            }`}>
              <div className="flex items-center mb-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                  result.success ? 'bg-green-400/20' : 'bg-red-400/20'
                }`}>
                  {result.success ? (
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <h3 className="font-bold text-white text-lg">{result.success ? '✅ Success' : '❌ Failed'}</h3>
              </div>
              <div className="space-y-2">
                <p className="text-white/80 text-sm"><span className="font-medium">Status:</span> {result.status}</p>
                {result.summary && <p className="text-white/80 text-sm"><span className="font-medium">Summary:</span> {result.summary}</p>}
                {result.error && <p className="text-red-300 text-sm"><span className="font-medium">Error:</span> {result.error}</p>}
                <p className="text-white/60 text-xs">⚡ Completed in {result.steps.length} steps</p>
              </div>
            </div>

            {result.steps.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-white/80 mb-2 text-center">Execution Steps</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.steps.map((step, index) => (
                    <div key={index} className="glass p-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-white/90">Step {step.step}: {step.action}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${step.success ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>{step.success ? 'SUCCESS' : 'FAILED'}</span>
                      </div>
                      <pre className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{JSON.stringify(step.params, null, 2)}</pre>
                      {step.error && <p className="text-xs text-red-300 mt-1">{step.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    // </div>
  );
}

export function DeviceMonitor() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('SCANNING');

  async function refreshDeviceInfo() {
    setLoading(true);
    setConnectionStatus('PROBING');
    try {
      const formData = new FormData();
      const result = await getDeviceInfo(formData);
      if (result.ok && result.data) {
        setDeviceInfo(result.data);
        setConnectionStatus('CONNECTED');
      } else {
        setConnectionStatus('FAILED');
      }
    } catch (error) {
      console.error("Failed to get device info:", error);
      setConnectionStatus('ERROR');
    } finally {
      setLoading(false);
    }
  }

  async function captureScreenshot() {
    setLoading(true);
    try {
      const formData = new FormData();
      const result = await takeScreenshot(formData);
      if (result.ok && result.data) {
        setScreenshotPath(result.data.path);
      }
    } catch (error) {
      console.error("Failed to take screenshot:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshDeviceInfo();
  }, []);

  return (
    <div className="glass p-6">
      <div className="border-b border-green-400/30 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-500/20 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-green-400 font-mono tracking-wider">DEVICE INTERFACE</h2>
              <p className="text-xs text-green-300 font-mono">CONNECTION STATUS</p>
            </div>
          </div>
          <div className={`text-xs font-mono px-2 py-1 rounded ${
            connectionStatus === 'CONNECTED' ? 'bg-green-400/20 text-green-400' : 
            connectionStatus === 'SCANNING' || connectionStatus === 'PROBING' ? 'bg-yellow-400/20 text-yellow-400' :
            'bg-red-400/20 text-red-400'
          }`}>
            [{connectionStatus}]
          </div>
        </div>
      </div>
        
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <button
              onClick={refreshDeviceInfo}
              disabled={loading}
              className="cyber-button flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
            
            <button
              onClick={captureScreenshot}
              disabled={loading}
              className="cyber-button flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {loading ? 'Capturing...' : '📸 Screenshot'}
            </button>
          </div>

          {/* Connection Status */}
          <div className="glass p-4 text-center">
            <div className="flex items-center justify-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'CONNECTED' ? 'bg-green-400 animate-pulse' :
                connectionStatus === 'SCANNING' || connectionStatus === 'PROBING' ? 'bg-yellow-400 animate-pulse' :
                'bg-red-400'
              }`}></div>
              <span className="text-white/70 text-sm">Connection:</span>
              <span className={`text-sm font-medium ${
                connectionStatus === 'CONNECTED' ? 'text-green-400' :
                connectionStatus === 'SCANNING' || connectionStatus === 'PROBING' ? 'text-yellow-400' :
                'text-red-400'
              }`}>{connectionStatus}</span>
            </div>
          </div>

          {deviceInfo && (
            <div className="glass p-4">
              <h3 className="font-semibold text-white/90 mb-3 text-center">Device Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div>
                    <span className="text-white/60">Resolution:</span>
                    <span className="text-white ml-2">{deviceInfo.width} × {deviceInfo.height}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Density:</span>
                    <span className="text-white ml-2">{deviceInfo.density} DPI</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-white/60">Orientation:</span>
                    <span className="text-white ml-2">
                      {deviceInfo.orientation === 0 ? 'PORTRAIT' : 
                       deviceInfo.orientation === 1 ? 'LANDSCAPE' :
                       deviceInfo.orientation === 2 ? 'REV_PORTRAIT' : 'REV_LANDSCAPE'}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/60">Status:</span>
                    <span className="text-white ml-2">Active</span>
                  </div>
                </div>
              </div>
              
              {deviceInfo.focusComponent && (
                <div className="mt-4 p-3 bg-black/30 rounded border border-cyan-400/30">
                  <span className="text-gray-400 text-xs">CURRENT FOCUS:</span>
                  <div className="text-cyan-300 text-xs font-mono mt-1 break-all">
                    {deviceInfo.focusComponent}
                  </div>
                </div>
              )}
            </div>
          )}

          {screenshotPath && (
            <div className="glass p-4">
              <h3 className="font-semibold text-white/90 mb-2 text-center">Latest Screenshot</h3>
              <div className="space-y-2">
                <div className="text-xs text-white/60 font-mono break-all">{screenshotPath}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    // </div>
  );
}

export function DemoRunner() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setResult(null);
    
    try {
      const res = await runDemoSuite(formData);
      setResult(res);
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass p-8 group hover:scale-[1.01] transition-transform duration-300">
      <div className="flex items-center justify-center mb-6">
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-400 to-orange-500 flex items-center justify-center mr-3">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H9m3 0h3.375c.621 0 1.125.504 1.125 1.125V8.5a.75.75 0 01-.75.75H15M9 7h6m-3 10v3m-3-3h6" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white neon-orange">Demo Suite</h2>
      </div>
        
        <form action={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70 text-center">Phone PIN</label>
              <div className="relative">
                <input
                  type="password"
                  name="pin"
                  placeholder="For unlock demo"
                  className="w-full px-4 py-3 cyber-input font-mono"
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70 text-center">Slack Channel</label>
              <div className="relative">
                <input
                  type="text"
                  name="channelName"
                  defaultValue="general"
                  className="w-full px-4 py-3 cyber-input font-mono"
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70 text-center">Profile Count (Hinge)</label>
              <div className="relative">
                <input
                  type="number"
                  name="profileCount"
                  defaultValue="3"
                  min="1"
                  max="10"
                  className="w-full px-4 py-3 cyber-input font-mono"
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70 text-center">Device Serial (optional)</label>
              <div className="relative">
                <input
                  type="text"
                  name="deviceSerial"
                  placeholder="Auto-detect"
                  className="w-full px-4 py-3 cyber-input font-mono"
                />
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 px-6 cyber-button ${
              loading ? 'opacity-60 cursor-not-allowed' : ''
            } relative overflow-hidden`}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="cyber-spinner w-5 h-5"></div>
              </div>
            )}
            <span className={loading ? 'opacity-0' : 'opacity-100'}>
              {loading ? 'Running Demos...' : '🚀 Run All Demos'}
            </span>
          </button>
        </form>

        {result && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold text-white/90 mb-2 text-center">Demo Results</h3>
            <div className="space-y-4">
              {Object.entries(result).map(([demoName, demoResult]: [string, any]) => {
                if (demoName === 'error' || !demoResult) return null;
                
                return (
                  <div key={demoName} className={`glass p-4 ${demoResult.success ? '' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-white/90">
                        {demoName.charAt(0).toUpperCase() + demoName.slice(1)} Demo
                      </h4>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        demoResult.success ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                      }`}>
                        {demoResult.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </div>
                    {demoResult.error && <p className="text-red-300 text-sm">{demoResult.error}</p>}
                    {demoResult.roastCount && <p className="text-white/70 text-sm">Roasted {demoResult.roastCount} profiles</p>}
                    {demoResult.imageUri && <p className="text-white/70 text-sm">Image: {demoResult.imageUri}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    // </div>
  );
}

/**
 * PhoneScreenMirror Component
 * 
 * Provides real-time Android screen mirroring using scrcpy (Screen Copy).
 * 
 * Key Features:
 * - High performance (30-120fps)
 * - Low latency (35-70ms)
 * - Multiple quality options (360p, 720p, 1080p)
 * - Fullscreen support
 * - USB debugging required
 * 
 * Implementation Notes:
 * - Uses scrcpy subprocess for actual mirroring
 * - Video stream handled via WebSocket/WebRTC
 * - Currently shows simulated interface
 * 
 * To implement real scrcpy integration:
 * 1. Install scrcpy on server
 * 2. Start scrcpy process with correct parameters
 * 3. Set up video streaming (WebSocket/WebRTC)
 * 4. Handle device interaction forwarding
 */
export function PhoneScreenMirror() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState('medium');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startMirroring = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('quality', quality);
      
      const result = await startScreenMirror(formData);
      
      if (result.success) {
        setIsConnected(true);
      } else {
        setError(result.error || 'Failed to start screen mirroring');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start screen mirroring');
    } finally {
      setIsLoading(false);
    }
  };

  const stopMirroring = async () => {
    try {
      await stopScreenMirror();
      setIsConnected(false);
      setError(null);
      if (videoRef.current) {
        videoRef.current.src = '';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stop screen mirroring');
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="glass p-6">
      <div className="border-b border-purple-400/30 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-purple-400 font-mono tracking-wider">SCREEN MIRROR</h2>
              <p className="text-xs text-purple-300 font-mono">VISUAL FEEDBACK</p>
            </div>
          </div>
          <div className={`text-xs font-mono px-2 py-1 rounded ${
            isConnected ? 'bg-green-400/20 text-green-400' :
            isLoading ? 'bg-yellow-400/20 text-yellow-400' :
            error ? 'bg-red-400/20 text-red-400' : 'bg-gray-400/20 text-gray-400'
          }`}>
            [{isConnected ? 'ACTIVE' : isLoading ? 'CONNECTING' : error ? 'ERROR' : 'STANDBY'}]
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {!isConnected ? (
            <button
              onClick={startMirroring}
              disabled={isLoading}
              className={`cyber-button flex items-center justify-center ${
                isLoading ? 'opacity-60 cursor-not-allowed' : ''
              } relative overflow-hidden`}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="cyber-spinner w-5 h-5"></div>
                </div>
              )}
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H9m3 0h3.375c.621 0 1.125.504 1.125 1.125V8.5a.75.75 0 01-.75.75H15M9 7h6m-3 10v3m-3-3h6" />
              </svg>
              <span className={isLoading ? 'opacity-0' : 'opacity-100'}>
                {isLoading ? 'Connecting...' : '📱 Start Mirror'}
              </span>
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={stopMirroring}
                className="cyber-button flex items-center justify-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                </svg>
                🛑 Stop
              </button>
              
              <button
                onClick={toggleFullscreen}
                className="cyber-button flex items-center justify-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                🔍 Fullscreen
              </button>
            </div>
          )}

          {/* Quality Settings */}
          <div className="flex items-center space-x-2">
            <label className="text-sm text-white/70">Quality:</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="cyber-input px-3 py-1 text-sm"
              disabled={isConnected}
            >
              <option value="low">Low (360p)</option>
              <option value="medium">Medium (720p)</option>
              <option value="high">High (1080p)</option>
            </select>
          </div>
        </div>

        {/* Connection Status */}
        <div className="glass p-4 text-center">
          <div className="flex items-center justify-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-400 animate-pulse' :
              isLoading ? 'bg-yellow-400 animate-pulse' :
              error ? 'bg-red-400' : 'bg-gray-400'
            }`}></div>
            <span className="text-white/70 text-sm">Mirror Status:</span>
            <span className={`text-sm font-medium ${
              isConnected ? 'text-green-400' :
              isLoading ? 'text-yellow-400' :
              error ? 'text-red-400' : 'text-gray-400'
            }`}>
              {isConnected ? 'CONNECTED' :
               isLoading ? 'CONNECTING' :
               error ? 'ERROR' : 'DISCONNECTED'}
            </span>
          </div>
          {error && (
            <p className="text-red-300 text-sm mt-2">{error}</p>
          )}
        </div>

        {/* Screen Display */}
        <div 
          ref={containerRef}
          className={`relative bg-black rounded-xl overflow-hidden border-2 ${
            isConnected ? 'border-green-400/30 shadow-lg shadow-green-400/20' : 'border-white/10'
          } ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-[9/16] max-w-sm mx-auto'}`}
        >
          {isConnected ? (
            <div className="relative w-full h-full bg-gradient-to-br from-green-900/10 to-cyan-900/10">
              {/* Video Element for scrcpy stream */}
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                autoPlay
                muted
                playsInline
              />
              
              {/* Real scrcpy integration message */}
              <div className="absolute inset-4 bg-gradient-to-b from-green-900/30 to-cyan-900/30 rounded-lg border border-cyan-400/20">
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-400 to-green-500 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-white/90 text-lg font-bold mb-2">🎉 Screen Mirroring Active!</p>
                    <p className="text-white/70 text-sm mb-2">Check the scrcpy window on your desktop</p>
                    <p className="text-cyan-300 text-xs">Your phone screen is being mirrored</p>
                    <div className="mt-4 px-3 py-2 bg-black/30 rounded-lg">
                      <p className="text-white/60 text-xs">
                        🔴 LIVE via scrcpy
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Connection indicator */}
              <div className="absolute top-2 right-2 flex items-center space-x-1 bg-black/50 rounded-full px-2 py-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400 font-medium">LIVE</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900/40 to-gray-800/40">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-white/50 text-sm">No Device Connected</p>
                <p className="text-white/30 text-xs mt-1">Start mirroring to see your phone screen</p>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="glass p-4">
          <h3 className="font-semibold text-white/90 mb-3 text-center">📱 Screen Mirroring Info</h3>
          <div className="space-y-2 text-sm text-white/70">
            <p><span className="font-medium text-cyan-300">Technology:</span> Scrcpy (Screen Copy)</p>
            <p><span className="font-medium text-cyan-300">Resolution:</span> {quality === 'low' ? '360p' : quality === 'medium' ? '720p' : '1080p'}</p>
            <p><span className="font-medium text-cyan-300">Latency:</span> ~50-100ms</p>
            <p><span className="font-medium text-cyan-300">Requirements:</span> USB Debugging enabled</p>
          </div>
        </div>
      </div>
    </div>
  );
}