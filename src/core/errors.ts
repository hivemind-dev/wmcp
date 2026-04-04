/**
 * wMCP — Web Module Connection Protocol
 * Error classes
 */

export class WmcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WmcpError';
  }
}

/** Thrown when a required capability or requirement is not bound at bind time */
export class WmcpBindError extends WmcpError {
  public readonly capability: string;
  public readonly side: 'module' | 'host';

  constructor(capability: string, side: 'module' | 'host' = 'host') {
    const label =
      side === 'host'
        ? `Missing host handler for required host:requires "${capability}"`
        : `Module did not register a handler for declared module:capabilities "${capability}"`;
    super(label);
    this.name = 'WmcpBindError';
    this.capability = capability;
    this.side = side;
  }
}

/** Thrown when the host attempts to override a capability not declared in module:capabilities */
export class WmcpOverrideError extends WmcpError {
  public readonly capability: string;

  constructor(capability: string) {
    super(
      `Cannot override "${capability}": not declared in module:capabilities`,
    );
    this.name = 'WmcpOverrideError';
    this.capability = capability;
  }
}

/** Thrown when an HTTP-backed capability call fails */
export class WmcpApiError extends WmcpError {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`);
    this.name = 'WmcpApiError';
    this.status = status;
    this.body = body;
  }
}

/** Thrown when params or manifest fail validation */
export class WmcpValidationError extends WmcpError {
  public readonly field: string;

  constructor(field: string, message: string) {
    super(`Validation error on "${field}": ${message}`);
    this.name = 'WmcpValidationError';
    this.field = field;
  }
}
