
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { phonePilotAgent } from './agents/phonepilot-agent';
import { plannerAgent } from './agents/planner-agent';
import { analyzerAgent } from './agents/analyzer-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { 
    weatherAgent,
    phonePilotAgent,
    plannerAgent,
    analyzerAgent
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
