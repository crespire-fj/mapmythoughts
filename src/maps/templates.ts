import type { OutlineNode } from '../commands/commands';
import type { MapSettings } from '../model/schema';

export interface Template {
  id: string;
  name: string;
  description: string;
  title: string;
  settings: Partial<MapSettings>;
  outline: OutlineNode[];
}

const n = (text: string, ...children: OutlineNode[]): OutlineNode => ({ text, children });

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank map',
    description: 'Start from a single central topic',
    title: 'Central topic',
    settings: { theme: 'daydream' },
    outline: [],
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Capture ideas, questions and next steps',
    title: 'Brainstorm',
    settings: { theme: 'spark' },
    outline: [n('Ideas'), n('Questions'), n('Risks'), n('Next steps')],
  },
  {
    id: 'project',
    name: 'Project plan',
    description: 'Goals, scope, timeline, people and risks',
    title: 'Project plan',
    settings: { theme: 'reef' },
    outline: [
      n('Goals', n('Outcome 1'), n('Outcome 2')),
      n('Timeline', n('Phase 1'), n('Phase 2'), n('Phase 3')),
      n('Scope', n('In scope'), n('Out of scope')),
      n('Team', n('Lead'), n('Partners')),
      n('Risks'),
      n('Budget'),
    ],
  },
  {
    id: 'swot',
    name: 'SWOT analysis',
    description: 'Strengths, weaknesses, opportunities, threats',
    title: 'SWOT analysis',
    settings: { theme: 'forest' },
    outline: [n('Strengths'), n('Opportunities'), n('Weaknesses'), n('Threats')],
  },
  {
    id: 'lesson',
    name: 'Lesson plan',
    description: 'Outcomes, activities, resources and checks',
    title: 'Lesson plan',
    settings: { theme: 'lagoon' },
    outline: [
      n('Learning outcomes'),
      n('Activities', n('Starter'), n('Main activity'), n('Plenary')),
      n('Resources'),
      n('Assessment'),
      n('Differentiation', n('Support'), n('Extension')),
    ],
  },
  {
    id: 'assessment',
    name: 'Assessment framework',
    description: 'From purpose and standards to reporting',
    title: 'Assessment framework',
    settings: { theme: 'reef', orientation: 'vertical', connector: 'elbow' },
    outline: [
      n('Purpose'),
      n('Standards and benchmarks'),
      n('Instruments', n('Tests'), n('Observation'), n('Portfolios')),
      n('Administration'),
      n('Analysis and reporting'),
      n('Use of results'),
    ],
  },
];
