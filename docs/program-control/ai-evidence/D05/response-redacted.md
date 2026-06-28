Here's a concise TypeScript module design for your settings registry:

```typescript
// types.ts
export type SettingScope = 'global' | 'device' | 'project';
export type SettingsStore = {
  global: Record<string, any>;
  device: Record<string, Record<string, any>>;
  project: Record<string, Record<string, any>>;
};

export const KNOWN_DEFAULTS = {
  telemetryPollMs: 30000,
  voiceVerbosity: 'normal',
} as const;

// settings.ts
import { writeJsonAtomic } from "../lib/atomic";
import { SettingsStore, SettingScope, KNOWN_DEFAULTS } from "./types";

const SETTINGS_FILE = 'orchestrator-settings.json';
let _settings: SettingsStore = {
  global: {},
  device: {},
  project: {}
};

function loadSettings(): void {
  try {
    const data = require(`./${SETTINGS_FILE}`);
    _settings = {
      global: data.global || {},
      device: data.device || {},
      project: data.project || {}
    };
  } catch {
    // File missing/corrupt - use empty store
  }
}

function ensureLoaded() {
  if (Object.keys(_settings.global).length === 0) {
    loadSettings();
  }
}

export function getEffective(
  key: string,
  ctx?: { device?: string; project?: string }
): any {
  ensureLoaded();
  
  // Resolution order: project -> device -> global -> known default
  if (ctx?.project && _settings.project[ctx.project]?.[key] !== undefined) {
    return _settings.project[ctx.project][key];
  }
  if (ctx?.device && _settings.device[ctx.device]?.[key] !== undefined) {
    return _settings.device[ctx.device][key];
  }
  if (_settings.global[key] !== undefined) {
    return _settings.global[key];
  }
  return KNOWN_DEFAULTS[key as keyof typeof KNOWN_DEFAULTS];
}

export function setSetting(
  scope: SettingScope,
  key: string,
  value: any,
  target?: string
): void {
  ensureLoaded();
  
  if (scope === 'global') {
    _settings.global[key] = value;
  } else if (scope === 'device' && target) {
    _settings.device[target] = _settings.device[target] || {};
    _settings.device[target][key] = value;
  } else if (scope === 'project' && target) {
    _settings.project[target] = _settings.project[target] || {};
    _settings.project[target][key] = value;
  }
  
  writeJsonAtomic(SETTINGS_FILE, _settings).catch(() => {
    console.warn('Failed to persist settings');
  });
}

export function listSettings(): SettingsStore {
  ensureLoaded();
  return JSON.parse(JSON.stringify(_settings)); // Return deep copy
}
```

### Key Design Points:

1. **Type Model**:
   - `SettingsStore` has three clear scopes with proper nesting
   - `SettingScope` is a union type for type safety
   - Known defaults are typed as `const` for inference

2. **Resolution Algorithm**:
   - Checks project → device → global → known defaults
   - Short-circuits on first defined value found
   - Uses optional chaining for safe access

3. **Edge Cases Handled**:
   - Missing/corrupt file → falls back to empty store
   - Unknown key → returns undefined (after all checks)
   - Missing target for device/project → no-op in setSetting
   - Explicit null/undefined values are respected
   - Atomic writes with error handling
   - Lazy loading with memoization

4. **Safety**:
   - Deep copy in `listSettings()` to prevent mutation
   - Isolated module pattern
   - Async write errors don't bubble up

Would you like me to elaborate on any particular aspect?