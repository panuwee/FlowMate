import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('renders both Gantt views and their assignee choices without inactive Eye', () => {
  for (const mode of ['timeline', 'workload']) {
    let state = 0;
    const roster = [{ id: 'gd', name: 'Active GD', active: true, capacityPerDay: 8 },
      { id: 'paused', name: 'Paused Active Access', active: true, capacityPerDay: 8 }];
    const context: any = {
      React: { ...React, useState: (initial: any) => {
        const index = state++;
        return [index === 1 ? roster : typeof initial === 'function' ? initial() : initial, () => {}];
      }, useEffect: () => {} },
      window: {}, sessionStorage: { getItem: () => mode },
      MEMBERS_BY_ID: { eye: { id: 'eye', name: 'Eye' } },
      Icon: () => null, Avatar: () => null, Source: () => null,
    };
    runInNewContext(readFileSync('screens-c.js', 'utf8'), context);
    const html = renderToStaticMarkup(React.createElement(context.window.TeamGanttScreen, { onOpen: () => {} }));
    expect(html).toContain('Active GD');
    expect(html).toContain('Paused Active Access');
    expect(html).not.toContain('Eye');
    expect(html).toContain('flowmate-team-gantt-route');
  }
});
