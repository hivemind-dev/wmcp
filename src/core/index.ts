/**
 * wMCP — Web Module Connection Protocol
 * Package entry point
 */

export { WmcpClient } from './client.js';
export { WmcpHost } from './host.js';
export { validateManifest, validateParams } from './validator.js';
export {
  WmcpError,
  WmcpBindError,
  WmcpOverrideError,
  WmcpApiError,
  WmcpValidationError,
} from './errors.js';
export { parseSSE, isAsyncIterable } from '../utils/stream.js';

export type {
  WmcpManifest,
  WmcpModuleInfo,
  WmcpMountConfig,
  WmcpCapability,
  WmcpParamDef,
  WmcpTypeDef,
  WmcpHint,
  WmcpEvent,
  WmcpConfigParam,
  CapabilityHandler,
  OverrideHandler,
  CapabilityAdapter,
  CapabilityBinding,
  HeadersProvider,
  WmcpHostConfig,
  WmcpMountOptions,
  EventCallback,
} from './types.js';
