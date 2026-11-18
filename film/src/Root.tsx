import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { BARS, bf, FPS } from './kit';

export const Root: React.FC = () => <Composition id="Atrium" component={Film} durationInFrames={bf(BARS)} fps={FPS} width={1920} height={1080} />;
