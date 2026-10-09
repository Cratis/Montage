// Scene registry: type key -> class. Adding a scene type to the engine is one file
// in scenes/ and one line here. Unknown types in a spec fall back to `statement`
// so a package never hard-fails the render.

import type { SceneClass } from './scene';
import { Title } from '../scenes/title';
import { Kinetic } from '../scenes/kinetic';
import { Statement } from '../scenes/statement';
import { Steps } from '../scenes/steps';
import { Compare } from '../scenes/compare';
import { Flow } from '../scenes/flow';
import { Metric } from '../scenes/metric';
import { Chart } from '../scenes/chart';
import { Quote } from '../scenes/quote';
import { Code } from '../scenes/code';
import { Endcard } from '../scenes/endcard';
import { ImageScene } from '../scenes/image';
import { Diagram } from '../scenes/diagram';

export const registry: Record<string, SceneClass> = {
  title: Title,
  kinetic: Kinetic,
  statement: Statement,
  steps: Steps,
  compare: Compare,
  flow: Flow,
  metric: Metric,
  chart: Chart,
  quote: Quote,
  code: Code,
  endcard: Endcard,
  image: ImageScene,
  diagram: Diagram,
};

export const sceneClassFor = (type: string): SceneClass => registry[type] ?? Statement;
