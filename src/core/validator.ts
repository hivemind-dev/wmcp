/**
 * wMCP — Web Module Connection Protocol
 * Manifest and parameter validation
 */

import type { WmcpManifest, WmcpCapability } from './types.js';
import { WmcpValidationError } from './errors.js';

const SUPPORTED_VERSIONS = ['1.0'];

export function validateManifest(manifest: unknown): asserts manifest is WmcpManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new WmcpValidationError('manifest', 'Must be a non-null object');
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.wmcp !== 'string' || !SUPPORTED_VERSIONS.includes(m.wmcp)) {
    throw new WmcpValidationError(
      'wmcp',
      `Must be one of: ${SUPPORTED_VERSIONS.join(', ')}. Got: "${m.wmcp}"`,
    );
  }

  if (!m.module || typeof m.module !== 'object') {
    throw new WmcpValidationError('module', 'Must be an object');
  }
  const mod = m.module as Record<string, unknown>;
  if (typeof mod.name !== 'string' || !mod.name) {
    throw new WmcpValidationError('module.name', 'Must be a non-empty string');
  }
  if (typeof mod.version !== 'string' || !mod.version) {
    throw new WmcpValidationError('module.version', 'Must be a non-empty string');
  }

  if (!m.mount || typeof m.mount !== 'object') {
    throw new WmcpValidationError('mount', 'Must be an object');
  }
  const mount = m.mount as Record<string, unknown>;
  if (typeof mount.entry !== 'string' || !mount.entry) {
    throw new WmcpValidationError('mount.entry', 'Must be a non-empty string');
  }

  // module:capabilities (REQUIRED)
  const caps = m['module:capabilities'];
  if (!caps || typeof caps !== 'object') {
    throw new WmcpValidationError('module:capabilities', 'Must be an object');
  }
  for (const [name, cap] of Object.entries(caps as Record<string, unknown>)) {
    validateCapability(`module:capabilities.${name}`, cap);
  }

  // host:requires (OPTIONAL)
  const requires = m['host:requires'];
  if (requires !== undefined) {
    if (typeof requires !== 'object' || requires === null) {
      throw new WmcpValidationError('host:requires', 'Must be an object');
    }
    for (const [name, cap] of Object.entries(requires as Record<string, unknown>)) {
      validateCapability(`host:requires.${name}`, cap);
    }
  }

  // module:events (OPTIONAL)
  const events = m['module:events'];
  if (events !== undefined) {
    if (typeof events !== 'object' || events === null) {
      throw new WmcpValidationError('module:events', 'Must be an object');
    }
    for (const [name, ev] of Object.entries(events as Record<string, unknown>)) {
      validateEvent(`module:events.${name}`, ev);
    }
  }

  // module:listeners (OPTIONAL)
  const listeners = m['module:listeners'];
  if (listeners !== undefined) {
    if (typeof listeners !== 'object' || listeners === null) {
      throw new WmcpValidationError('module:listeners', 'Must be an object');
    }
    for (const [name, ev] of Object.entries(listeners as Record<string, unknown>)) {
      validateEvent(`module:listeners.${name}`, ev);
    }
  }
}

function validateCapability(path: string, cap: unknown): void {
  if (!cap || typeof cap !== 'object') {
    throw new WmcpValidationError(path, 'Must be an object');
  }

  const c = cap as Record<string, unknown>;

  if (typeof c.description !== 'string') {
    throw new WmcpValidationError(`${path}.description`, 'Must be a string');
  }

  if (c.mode !== 'request' && c.mode !== 'stream') {
    throw new WmcpValidationError(`${path}.mode`, 'Must be "request" or "stream"');
  }
}

function validateEvent(path: string, ev: unknown): void {
  if (!ev || typeof ev !== 'object') {
    throw new WmcpValidationError(path, 'Must be an object');
  }

  const e = ev as Record<string, unknown>;

  if (typeof e.description !== 'string') {
    throw new WmcpValidationError(`${path}.description`, 'Must be a string');
  }

  if (e.data !== undefined && (typeof e.data !== 'object' || e.data === null)) {
    throw new WmcpValidationError(`${path}.data`, 'Must be an object');
  }
}

/**
 * Validates params against a capability's param definitions.
 */
export function validateParams(
  capabilityName: string,
  capability: WmcpCapability,
  params: Record<string, unknown>,
): void {
  if (!capability.params) return;

  for (const [paramName, def] of Object.entries(capability.params)) {
    const value = params[paramName];

    if (def.required && (value === undefined || value === null)) {
      throw new WmcpValidationError(
        `${capabilityName}.params.${paramName}`,
        'Required parameter is missing',
      );
    }

    if (value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      const allowedTypes: string[] = [def.type];
      if (def.type === 'blob') allowedTypes.push('object');

      if (!allowedTypes.includes(actualType)) {
        throw new WmcpValidationError(
          `${capabilityName}.params.${paramName}`,
          `Expected type "${def.type}", got "${actualType}"`,
        );
      }

      if (def.enum && !def.enum.includes(value)) {
        throw new WmcpValidationError(
          `${capabilityName}.params.${paramName}`,
          `Value must be one of: ${def.enum.join(', ')}`,
        );
      }
    }
  }
}
